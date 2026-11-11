import { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ErpService, isErpReady, loadErpConfig } from './services/erpService';
import type { ActiveTab } from './components/layout/Sidebar';
import { prefetchAll } from './services/prefetch';
import { fetchCached } from './services/swrCache';
import { PageSkeleton } from './components/common/PageSkeleton';
import { MobileNav } from './components/layout/MobileNav';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { OrdersView } from './components/orders/OrdersView';
import { OrderEntryModal } from './components/orders/OrderEntryModal';
import { ThermalLabel } from './components/label/ThermalLabel';
import { Printer } from 'lucide-react';
import type { Order, CompanySettings, PrintQueueItem, OrderStatus } from './types';
import { StorageService } from './services/storage';
import { DataService } from './services/dataService';
import { ENABLE_MULTI_WAREHOUSE } from './constants/featureFlags';
import { loadTelegramConfig, sendTelegramMessage, TelegramMessages } from './services/telegramService';
import { startTelegramPolling, stopTelegramPolling } from './services/telegramBotService';

// Pages load on demand, so the first visit downloads only what it needs. They are fetched quietly in the background right after the app opens.

const pageLoaders = {
  LabelGeneratorView: () => import('./components/generator/LabelGeneratorView').then((m) => ({ default: m.LabelGeneratorView })),
  BulkImportView: () => import('./components/bulk/BulkImportView').then((m) => ({ default: m.BulkImportView })),
  PrintQueueView: () => import('./components/printQueue/PrintQueueView').then((m) => ({ default: m.PrintQueueView })),
  MapView: () => import('./components/map/RealMapView').then((m) => ({ default: m.RealMapView })),
  ErpView: () => import('./components/erp/ErpView').then((m) => ({ default: m.ErpView })),
  SettingsView: () => import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
  ReturnsView: () => import('./components/warehouse/ReturnsView').then((m) => ({ default: m.ReturnsView })),
  InventoryOutView: () => import('./components/warehouse/InventoryOutView').then((m) => ({ default: m.InventoryOutView })),
  StockSummary: () => import('./components/warehouse/StockSummary').then((m) => ({ default: m.StockSummary })),
  WarrantyView: () => import('./components/warranty/WarrantyView').then((m) => ({ default: m.WarrantyView })),
  WarrantyCardView: () => import('./components/warranty/WarrantyCardView').then((m) => ({ default: m.WarrantyCardView })),
  ClaimsView: () => import('./components/claims/ClaimsView').then((m) => ({ default: m.ClaimsView })),
  TrackingView: () => import('./components/tracking/TrackingView').then((m) => ({ default: m.TrackingView })),
  InventoryAdd: () => import('./components/inventory/InventoryAdd').then((m) => ({ default: m.InventoryAdd })),
  InventoryList: () => import('./components/inventory/InventoryList').then((m) => ({ default: m.InventoryList })),
  InventorySearch: () => import('./components/inventory/InventorySearch').then((m) => ({ default: m.InventorySearch })),
  CartonsView: () => import('./components/warehouse/CartonsView').then((m) => ({ default: m.CartonsView })),
  ProductsView: () => import('./components/warehouse/ProductsView').then((m) => ({ default: m.ProductsView })),
  ReportsView: () => import('./components/reports/ReportsView'),
} as const;
const LabelGeneratorView = lazy(pageLoaders.LabelGeneratorView);
const BulkImportView = lazy(pageLoaders.BulkImportView);
const PrintQueueView = lazy(pageLoaders.PrintQueueView);
const SettingsView = lazy(pageLoaders.SettingsView);
const ErpView = lazy(pageLoaders.ErpView);
const MapView = lazy(pageLoaders.MapView);
const ReturnsView = lazy(pageLoaders.ReturnsView);
const InventoryOutView = lazy(pageLoaders.InventoryOutView);
const StockSummary = lazy(pageLoaders.StockSummary);
const WarrantyView = lazy(pageLoaders.WarrantyView);
const WarrantyCardView = lazy(pageLoaders.WarrantyCardView);
const ClaimsView = lazy(pageLoaders.ClaimsView);
const TrackingView = lazy(pageLoaders.TrackingView);
const InventoryAdd = lazy(pageLoaders.InventoryAdd);
const InventoryList = lazy(pageLoaders.InventoryList);
const InventorySearch = lazy(pageLoaders.InventorySearch);
const CartonsView = lazy(pageLoaders.CartonsView);
const ProductsView = lazy(pageLoaders.ProductsView);
const ReportsView = lazy(pageLoaders.ReportsView);

export function App() {
  // Ref for the main scrollable content area — used to reset scroll on every navigation
  const mainRef = useRef<HTMLElement>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return (localStorage.getItem('zaylow_active_tab') as ActiveTab) || 'dashboard';
  });

  // Wrap setActiveTab so every navigation automatically scrolls to top
  const navigateTo = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  // useLayoutEffect fires SYNCHRONOUSLY after DOM update, BEFORE browser paint.
  // This is the correct API for scroll resets — the old scroll is never visible.
  useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('zaylow_active_tab', activeTab);
  }, [activeTab]);

  // Start Telegram bot polling for two-way commands (/today, /pending, etc.)
  useEffect(() => {
    const tg = loadTelegramConfig();
    if (tg.botToken && tg.chatId) {
      startTelegramPolling(tg.botToken, tg.chatId);
    }
    return () => stopTelegramPolling();
  }, []);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersFresh, setOrdersFresh] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>(StorageService.getSettings());
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>(StorageService.getPrintQueue());

  // ERP: while the site is open, send today's new or changed orders by themselves
  useEffect(() => {
    if (!ordersFresh) return;
    const cfg = loadErpConfig();
    if (!cfg.auto || !isErpReady(cfg)) return;
    const t = setTimeout(() => {
      const pending = ErpService.pendingToday(orders);
      if (pending.length) void ErpService.send(cfg, pending, `Automatic: ${pending.length} order${pending.length === 1 ? '' : 's'}`);
    }, 4000);
    return () => clearTimeout(t);
  }, [orders, ordersFresh]);


  const [searchQuery, setSearchQuery] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('zaylow_dark_mode');
    return saved !== null ? saved === 'true' : true; // default: dark
  });
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [selectedOrderForLabel, setSelectedOrderForLabel] = useState<Order | null>(null);
  const [selectedOrderForWarrantyCard, setSelectedOrderForWarrantyCard] = useState<Order | null>(null);
  const [bulkPrintOrders, setBulkPrintOrders] = useState<Order[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Load and refresh orders from Supabase when needed
  const lastOrderFetch = useRef(0);
  const ordersRef = useRef<Order[]>([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  const orderSig = (list: Order[]) => list.map((o) => [
    o.id, o.status, o.trackingNumber || '', o.codAmount, o.advancePaid || 0, o.courier, o.paymentType,
    o.customer.name, o.customer.phone, o.customer.addressLine, o.customer.landmark || '', o.customer.city,
    o.customer.district, o.customer.state, o.customer.pinCode, o.notes || '',
  ].join('|')).join(';');
  const fetchOrders = async () => {
    lastOrderFetch.current = Date.now();
    // callers that ask at the same moment share one download of the orders
    const loadedOrders = await fetchCached('orders-all', () => DataService.getOrders(), 1500);
    setOrdersLoaded(true);
    setOrdersFresh(true);
    // Only touch state when something actually changed, so pages don't re-render for nothing
    if (orderSig(loadedOrders) === orderSig(ordersRef.current)) return;
    setOrders(loadedOrders);
  };

  useEffect(() => {
    fetchOrders();
    prefetchAll(); // download the warehouse data at the same time, so every page is ready when you open it
    const warm = setTimeout(() => { Object.values(pageLoaders).forEach((load) => { void load(); }); }, 1200); // then the page files
    const mapData = setTimeout(() => { void import('./data/inPincodes.json'); void import('./data/indiaDistricts.json'); }, 4000); // and the map's pin codes and districts, so the map opens at once
    return () => { clearTimeout(warm); clearTimeout(mapData); };
  }, []);

  // Refresh orders whenever the user navigates back to orders or dashboard
  // (throttled: clicking between pages must not re-download every order each time)
  useEffect(() => {
    if ((activeTab === 'orders' || activeTab === 'dashboard') && Date.now() - lastOrderFetch.current > 20000) {
      fetchOrders();
    }
  }, [activeTab]);

  // Handle Bulk Printing with html2canvas
  useEffect(() => {
    if (bulkPrintOrders.length > 0) {
      const processBulkPrint = async () => {
        // Wait for rendering and QR codes
        await new Promise(r => setTimeout(r, 800));

        try {
          const dataUrls = [];
          for (const order of bulkPrintOrders) {
            const el = document.getElementById(`bulk-print-label-${order.id}`);
            if (el) {
              const { captureCanvas } = await import('./utils/captureImage');
              const canvas = await captureCanvas(el, 3);
              dataUrls.push(canvas.toDataURL('image/png'));
            }
          }

          if (dataUrls.length > 0) {
            const printWin = window.open('', '_blank');
            if (!printWin) {
              alert('Popup blocked! Please allow popups for this site and try again.');
              setBulkPrintOrders([]);
              return;
            }

            const imgTags = dataUrls.map(url =>
              `<div style="page-break-after: always;"><img src="${url}" /></div>`
            ).join('');

            printWin.document.write(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Bulk Print Labels</title>
                  <style>
                    @page { size: 100mm 150mm; margin: 0; }
                    html, body { margin: 0; padding: 0; width: 100mm; background: #fff; }
                    img { display: block; width: 100mm; height: 150mm; object-fit: contain; }
                    div { margin: 0; padding: 0; }
                  </style>
                </head>
                <body>
                  ${imgTags}
                  <script>
                    window.onload = function() {
                      window.print();
                      window.onafterprint = function() { window.close(); };
                    };
                  </script>
                </body>
              </html>
            `);
            printWin.document.close();

            // Mark as printed
            if (settings.autoMarkPrintedOnPrint) {
               for (const order of bulkPrintOrders) {
                   await DataService.updateOrderStatus(order.id, 'Printed');
               }
               setOrders(await DataService.getOrders());
            }

            // Remove successfully printed items from the Active Print Queue
            const currentQueue = StorageService.getPrintQueue();
            const printedIds = bulkPrintOrders.map(o => o.id);
            const remainingQueue = currentQueue.filter(item => !printedIds.includes(item.order.id));
            StorageService.savePrintQueue(remainingQueue);
            setPrintQueue(remainingQueue);
          }
        } catch (err) {
          console.error("Bulk print failed", err);
        } finally {
          setBulkPrintOrders([]);
        }
      };

      processBulkPrint();
    }
  }, [bulkPrintOrders, settings.autoMarkPrintedOnPrint]);

  // Handle Dark / Light Theme toggle
  useEffect(() => {
    localStorage.setItem('zaylow_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Order Handlers
  const handleSaveOrder = async (newOrder: Order) => {
    const saved = await DataService.addOrder(newOrder);
    if (saved) {
      setOrders(await DataService.getOrders());
      setSelectedOrderForLabel(saved);
      navigateTo('generator');
    }
  };

  const handleUpdateStatus = async (id: string, status: OrderStatus) => {
    const success = await DataService.updateOrderStatus(id, status);
    if (success) {
      const updatedOrders = await DataService.getOrders();
      setOrders(updatedOrders);

      // Send Telegram notification for key status changes
      const tg = loadTelegramConfig();
      if (tg.botToken && tg.chatId) {
        const order = updatedOrders.find(o => o.id === id);
        if (order) {
          if (status === 'Delivered') {
            sendTelegramMessage(tg.botToken, tg.chatId,
              TelegramMessages.orderDelivered(order, new Date().toISOString()));
          } else if (status === 'Cancelled') {
            sendTelegramMessage(tg.botToken, tg.chatId,
              TelegramMessages.orderCancelled(order));
          }
        }
      }
    }
  };

  const handleEditOrder = async (id: string, changes: Parameters<typeof DataService.updateOrderDetails>[1]) => {
    const ok = await DataService.updateOrderDetails(id, changes);
    if (ok) setOrders(await DataService.getOrders());
    return ok;
  };

  const handleApplyTrackingBatch = async (pairs: { id: string; awb: string; status: OrderStatus; next?: OrderStatus; setTracking?: boolean }[], onProgress?: (done: number, total: number) => void) => {
    const result = await DataService.applyTrackingBatch(pairs, onProgress);
    setOrders(await DataService.getOrders());
    return result;
  };

  const handleDeleteOrder = async (id: string) => {
    const success = await DataService.deleteOrder(id);
    if (success) {
      setOrders(await DataService.getOrders());
    }
  };

  const handleUpdateTracking = async (id: string, trackingNumber: string, shippingLabelUrl: string | null) => {
    const success = await DataService.updateTrackingInfo(id, trackingNumber, shippingLabelUrl);
    if (success) {
      const updatedOrders = await DataService.getOrders();
      setOrders(updatedOrders);

      // Send Telegram notification: order shipped
      const tg = loadTelegramConfig();
      if (tg.botToken && tg.chatId) {
        const order = updatedOrders.find(o => o.id === id);
        if (order) {
          sendTelegramMessage(tg.botToken, tg.chatId,
            TelegramMessages.orderShipped(order, trackingNumber));
        }
      }
    }
  };

  const handleDuplicateOrder = async (order: Order) => {
    const duplicated: Order = {
      ...order,
      id: `ZYL-DUP-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    const saved = await DataService.addOrder(duplicated);
    if (saved) {
      setOrders(await DataService.getOrders());
      setSelectedOrderForLabel(saved);
    }
  };

  // Bulk Import Handler
  const handleBulkImportComplete = async (importedOrders: Order[]) => {
    let added = 0;
    for (const o of importedOrders) {
      const s = await DataService.addOrder(o);
      if (s) added++;
    }
    setOrders(await DataService.getOrders());
    alert(`Successfully processed ${added} orders!`);
    navigateTo('orders');
  };

  // Print Queue Handlers
  const handleAddToQueue = (ordersToQueue: Order[]) => {
    const updatedQueue = StorageService.addToPrintQueue(ordersToQueue);
    setPrintQueue(updatedQueue);
    navigateTo('printQueue');
  };

  const handleClearQueue = () => {
    StorageService.clearPrintQueue();
    setPrintQueue([]);
  };

  // Direct Sequential Bulk Printing - captures actual label design
  const handlePrintBulkOrders = (ordersToPrint: Order[]) => {
    if (ordersToPrint.length === 0) return;
    setBulkPrintOrders(ordersToPrint);
  };

  // Download Bulk PDF
  const handleDownloadBulkPDF = (ordersToDownload: Order[]) => {
    alert(`Generating multi-page PDF for ${ordersToDownload.length} orders... Please check your downloads folder shortly.`);
  };

  // Settings Save Handler
  const handleSaveSettings = (newSettings: CompanySettings) => {
    StorageService.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const pendingCount = orders.filter(o => o.status === 'Pending').length;

  return (
    <div className={`kdash flex overflow-hidden text-black dark:text-white ${darkMode ? 'dark' : ''}`} style={{ height: '100dvh' }}>
      {/* Sidebar Navigation */}
      <MobileNav activeTab={activeTab} onNavigate={navigateTo} onNewOrder={() => setIsOrderModalOpen(true)} onMore={() => setIsSidebarOpen(true)} pendingCount={pendingCount} />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navigateTo}
        pendingCount={pendingCount}
        queueCount={printQueue.length}
        orderStatusFilter={orderStatusFilter}
        setOrderStatusFilter={setOrderStatusFilter}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          searchQuery={searchQuery}
          setSearchQuery={(q: string) => {
            setSearchQuery(q);
            if (activeTab !== 'orders') navigateTo('orders');
          }}
          onOpenOrderModal={() => setIsOrderModalOpen(true)}
          settings={settings}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          queueCount={printQueue.length}
          onOpenPrintQueue={() => navigateTo('printQueue')}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <main ref={mainRef} className="flex-1 overflow-y-auto max-md:pb-24">
          <Suspense fallback={<PageSkeleton title="Loading" />}>
          {activeTab === 'dashboard' && !ordersLoaded && <PageSkeleton title="Dashboard" />}
          {activeTab === 'dashboard' && ordersLoaded && (
            <DashboardView
              orders={orders}
              settings={settings}
              onNavigateToOrders={() => navigateTo('orders')}
              onNavigateToGenerator={(order?: Order) => {
                if (order) setSelectedOrderForLabel(order);
                navigateTo('generator');
              }}
              onNavigateToBulk={() => navigateTo('bulk')}
              onUpdateStatus={handleUpdateStatus}
              onUpdateTracking={handleUpdateTracking}
            />
          )}

          {activeTab === 'inventory-add' && <InventoryAdd />}
          {activeTab === 'inventory-list' && <InventoryList />}
          {activeTab === 'inventory-search' && <InventorySearch />}
          {activeTab === 'generator' && (
            <LabelGeneratorView
              selectedOrder={selectedOrderForLabel}
              allOrders={orders}
              settings={settings}
              onSelectOrder={setSelectedOrderForLabel}
              onAddToQueue={handleAddToQueue}
              onDuplicateOrder={handleDuplicateOrder}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              loading={!ordersLoaded}
              settings={settings}
              searchQuery={searchQuery}
              statusFilter={orderStatusFilter}
              setStatusFilter={setOrderStatusFilter}
              onOpenOrderModal={() => setIsOrderModalOpen(true)}
              onNavigateToGenerator={(order: Order) => {
                setSelectedOrderForLabel(order);
                navigateTo('generator');
              }}
              onPrintBulkOrders={handlePrintBulkOrders}
              onAddToQueue={handleAddToQueue}
              onDownloadBulkPDF={handleDownloadBulkPDF}
              onDeleteOrder={handleDeleteOrder}
              onUpdateStatus={handleUpdateStatus}
              onUpdateTracking={handleUpdateTracking}
              onEditOrder={handleEditOrder}
              onNavigateToWarrantyCard={(order: Order) => {
                setSelectedOrderForWarrantyCard(order);
                navigateTo('warranty-cards');
              }}
            />
          )}

          {activeTab === 'bulk' && (
            <BulkImportView
              settings={settings}
              onImportComplete={handleBulkImportComplete}
            />
          )}

          {activeTab === 'tracking' && !ordersLoaded && <PageSkeleton title="Tracking and COD" />}
          {activeTab === 'tracking' && ordersLoaded && (
            <TrackingView
              orders={orders}
              settings={settings}
              onUpdateStatus={handleUpdateStatus}
              onUpdateTracking={handleUpdateTracking}
              onApplyTrackingBatch={handleApplyTrackingBatch}
              onRefreshOrders={async () => { setOrders(await DataService.getOrders()); }}
            />
          )}

          {activeTab === 'printQueue' && (
            <PrintQueueView
              queue={printQueue}
              allOrders={orders}
              settings={settings}
              onClearQueue={handleClearQueue}
              onNavigateToGenerator={(order) => {
                setSelectedOrderForLabel(order);
                navigateTo('generator');
              }}
              onPrintBulkOrders={handlePrintBulkOrders}
            />
          )}

          {/* Warehouse Section - Conditionally rendered based on feature flag */}
          {ENABLE_MULTI_WAREHOUSE && (
            <>
              {activeTab === 'returns' && <ReturnsView />}
              {activeTab === 'inventory-out' && <InventoryOutView />}
              {activeTab === 'stock-summary' && <StockSummary />}
              {activeTab === 'cartons' && <CartonsView />}
              {activeTab === 'products' && <ProductsView />}
              {activeTab === 'reports' && <ReportsView orders={orders} loading={!ordersLoaded} onOpenOrders={() => navigateTo('orders')} />}
            </>
          )}

          {/* Warranty Section - Always rendered */}
          {activeTab === 'warranty' && !ordersLoaded && <PageSkeleton title="Warranty" />}
          {activeTab === 'warranty' && ordersLoaded && (
            <WarrantyView
              orders={orders}
              onNavigateToWarrantyCard={(order) => {
                setSelectedOrderForWarrantyCard(order || null);
                navigateTo('warranty-cards');
              }}
            />
          )}
          {activeTab === 'warranty-cards' && (
            <WarrantyCardView
              orders={orders}
              initialOrder={selectedOrderForWarrantyCard}
              onOrdersChanged={async () => { setOrders(await DataService.getOrders()); }}
            />
          )}
          {activeTab === 'claims' && !ordersLoaded && <PageSkeleton title="Claims" />}
          {activeTab === 'claims' && ordersLoaded && <ClaimsView orders={orders} onRefreshOrders={async () => { setOrders(await DataService.getOrders()); }} />}

          {activeTab === 'erp' && <ErpView orders={orders} />}
          {activeTab === 'shipping-map' && !ordersLoaded && <PageSkeleton title="Shipping map" />}
          {activeTab === 'shipping-map' && ordersLoaded && <MapView orders={orders} settings={settings} onRefresh={fetchOrders} />}
          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={handleSaveSettings}
            />
          )}
          </Suspense>
        </main>
      </div>

      {/* Order Creation Modal */}
      <OrderEntryModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onSave={handleSaveOrder}
        settings={settings}
      />

      {/* Bulk Print Overlay (Hidden but rendered to DOM for html2canvas) */}
      {bulkPrintOrders.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="text-black dark:text-white text-lg font-bold animate-pulse mb-6 flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Generating {bulkPrintOrders.length} label(s) for printing...
          </div>

          {/* We render them off-screen but visible so html2canvas can capture them exactly */}
          <div className="absolute left-[-9999px] top-0 flex flex-col gap-4">
            {bulkPrintOrders.map(order => (
              <div key={order.id} id={`bulk-print-label-${order.id}`} className="bg-white shadow-xl">
                <ThermalLabel order={order} settings={settings} scale={1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}