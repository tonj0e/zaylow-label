import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Order } from '../../types';
import { DataService } from '../../services/dataService';
import { WarrantyCard } from './WarrantyCard';
import { CARD_DIMENSIONS, type CardSizeOption } from '../../constants/warrantyCardSizes';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Award,
  Printer,
  Download,
  Search,
  User,
  Sparkles,
  FileDown,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  CheckCircle2,
  PackageCheck
} from 'lucide-react';

interface WarrantyCardViewProps {
  orders?: Order[];
  initialOrder?: Order | null;
}

// Helper to calculate exact +1 year end date (e.g. 1/10/2026 -> 1/10/2027)
// Helper to format a date nicely as DD/MM/YYYY (e.g. 01/10/2026)
const formatDateToDDMMYYYY = (dateInput?: string | Date): string => {
  if (!dateInput) {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    const parts = String(dateInput).split(/[/.-]/);
    if (parts.length === 3) {
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
    return String(dateInput);
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Helper to calculate exact +1 year end date (e.g. 01/10/2026 -> 01/10/2027)
const calculateOneYearEndDate = (startDateStr: string): string => {
  if (!startDateStr) return '';
  const parts = startDateStr.split(/[/.-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const nextYear = year + 1;
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${nextYear}`;
    }
  }
  const d = new Date(startDateStr);
  if (!isNaN(d.getTime())) {
    d.setFullYear(d.getFullYear() + 1);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return '';
};

export const WarrantyCardView: React.FC<WarrantyCardViewProps> = ({
  orders: propOrders,
  initialOrder
}) => {
  const [orders, setOrders] = useState<Order[]>(propOrders || []);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialOrder || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOneYearFilter, setOnlyOneYearFilter] = useState(true);

  // Left-panel tab switcher: 'orders' | 'editor' | 'settings'
  const [activeTab, setActiveTab] = useState<'orders' | 'editor' | 'settings'>('orders');

  // Form customization state
  const [customerName, setCustomerName] = useState(
    initialOrder?.customer?.name || 'Nashid'
  );
  const [purchaseDate, setPurchaseDate] = useState(() => {
    if (initialOrder?.date) {
      return formatDateToDDMMYYYY(initialOrder.date);
    }
    return '01/10/2026';
  });

  const [warrantyPeriod, setWarrantyPeriod] = useState(() => {
    if (initialOrder?.warrantyEnd) {
      return formatDateToDDMMYYYY(initialOrder.warrantyEnd);
    }
    const initialPDate = initialOrder?.date
      ? formatDateToDDMMYYYY(initialOrder.date)
      : '01/10/2026';
    return calculateOneYearEndDate(initialPDate) || '01/10/2027';
  });

  const [productName, setProductName] = useState(
    initialOrder?.item?.productName || 'Period Cramps Relief Massager'
  );
  const [orderId, setOrderId] = useState(initialOrder?.id || 'ZYL-10928');
  const [productImage, setProductImage] = useState('/warranty-product-belt.png');

  // Display & Print Options: Default to 4x6" thermal card
  const [cardSize, setCardSize] = useState<CardSizeOption>('thermal');
  const [zoomLevel, setZoomLevel] = useState<'auto' | '85' | '100'>('auto');
  const [isExporting, setIsExporting] = useState(false);

  const printContainerRef = useRef<HTMLDivElement>(null);

  // Load orders if not provided
  useEffect(() => {
    if (!propOrders || propOrders.length === 0) {
      DataService.getOrders().then(loaded => {
        setOrders(loaded);
        setSelectedOrder(prev => {
          if (!prev && loaded.length > 0) {
            const first1Y = loaded.find(isOneYearOrder) || loaded[0];
            handleSelectOrder(first1Y);
            return first1Y;
          }
          return prev;
        });
      });
    }
  }, [propOrders]);

  // When initialOrder changes from parent
  useEffect(() => {
    if (initialOrder) {
      handleSelectOrder(initialOrder);
    }
  }, [initialOrder]);

  // Helper to test if an order has ~1 year warranty (duration >= 300 days or remarks/dates)
  const isOneYearOrder = (order: Order): boolean => {
    if (order.warrantyStart && order.warrantyEnd) {
      const start = new Date(order.warrantyStart).getTime();
      const end = new Date(order.warrantyEnd).getTime();
      const days = Math.round((end - start) / (1000 * 3600 * 24));
      if (days >= 300) return true;
    }
    const notes = (order.notes || '').toLowerCase();
    const prod = (order.item?.productName || '').toLowerCase();
    if (notes.includes('1 year') || notes.includes('365') || prod.includes('period massager')) {
      return true;
    }
    return false;
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (onlyOneYearFilter && !isOneYearOrder(o)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.phone.includes(q) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q))
      );
    });
  }, [orders, onlyOneYearFilter, searchQuery]);

  const oneYearCount = useMemo(() => {
    return orders.filter(isOneYearOrder).length;
  }, [orders]);

  const currentOrderIndex = useMemo(() => {
    if (!selectedOrder) return -1;
    return filteredOrders.findIndex(o => o.id === selectedOrder.id);
  }, [filteredOrders, selectedOrder]);

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setCustomerName(order.customer.name || 'Nashid');
    const pDate = order.date ? formatDateToDDMMYYYY(order.date) : '01/10/2026';
    setPurchaseDate(pDate);

    let eDate = '';
    if (order.warrantyEnd) {
      eDate = formatDateToDDMMYYYY(order.warrantyEnd);
    } else {
      eDate = calculateOneYearEndDate(pDate);
    }
    setWarrantyPeriod(eDate || '01/10/2027');

    setProductName(order.item?.productName || 'Period Cramps Relief Massager');
    setOrderId(order.id);
  };

  // Cycle to previous / next order in filtered list
  const handlePrevOrder = () => {
    if (filteredOrders.length === 0) return;
    const prevIdx = currentOrderIndex <= 0 ? filteredOrders.length - 1 : currentOrderIndex - 1;
    handleSelectOrder(filteredOrders[prevIdx]);
  };

  const handleNextOrder = () => {
    if (filteredOrders.length === 0) return;
    const nextIdx = currentOrderIndex >= filteredOrders.length - 1 ? 0 : currentOrderIndex + 1;
    handleSelectOrder(filteredOrders[nextIdx]);
  };

  // Capture high-DPI canvas without ANY CSS transform interference or font collapse
  const captureCardCanvas = async (scale: number = 3): Promise<HTMLCanvasElement | null> => {
    const el = printContainerRef.current;
    if (!el) return null;

    // The preview wrapper uses CSS transform: scale(...) to fit the screen.
    // html2canvas incorrectly calculates font glyph advances when any parent has a CSS transform,
    // which causes letters and words to collide/overlap.
    // We temporarily remove the transform during html2canvas capture and immediately restore it.
    const transformParent = el.parentElement;
    const prevTransform = transformParent ? transformParent.style.transform : '';
    const prevOrigin = transformParent ? transformParent.style.transformOrigin : '';

    if (transformParent) {
      transformParent.style.transform = 'none';
      transformParent.style.transformOrigin = 'initial';
    }

    try {
      const canvas = await html2canvas(el, {
        scale: scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Double guarantee: ensure cloned element and its parents have zero transforms
          const clonedCard = clonedDoc.querySelector('.warranty-card-element') as HTMLElement;
          if (clonedCard) {
            clonedCard.style.transform = 'none';
            let curr = clonedCard.parentElement;
            while (curr && curr !== clonedDoc.body) {
              curr.style.transform = 'none';
              curr = curr.parentElement;
            }
          }
        }
      });
      return canvas;
    } finally {
      if (transformParent) {
        transformParent.style.transform = prevTransform;
        transformParent.style.transformOrigin = prevOrigin;
      }
    }
  };

  // High-Resolution Card Printing: Formatted for 4x6 Thermal Printer (Portrait Single Label)
  const handlePrintCard = async () => {
    setIsExporting(true);
    try {
      const canvas = await captureCardCanvas(3);
      if (!canvas) return;
      const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
      const dataUrl = canvas.toDataURL('image/png');

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up was blocked. Please allow popups to print warranty cards.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>ZAYLOW Warranty Card - ${customerName}</title>
            <style>
              @page {
                size: ${dim.widthMm}mm ${dim.heightMm}mm portrait;
                margin: 0;
              }
              html, body {
                margin: 0;
                padding: 0;
                width: ${dim.widthMm}mm;
                height: ${dim.heightMm}mm;
                background: #fff;
                overflow: hidden;
              }
              img {
                display: block;
                width: ${dim.widthMm}mm;
                height: ${dim.heightMm}mm;
                object-fit: contain;
                margin: 0;
                padding: 0;
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.onafterprint = function() { window.close(); };
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Print generation failed:', err);
      alert('Failed to generate print preview.');
    } finally {
      setIsExporting(false);
    }
  };

  // Print current order card and automatically advance to next 1-year order
  const handlePrintAndNext = async () => {
    await handlePrintCard();
    setTimeout(() => {
      handleNextOrder();
    }, 600);
  };

  // Download High-DPI PNG
  const handleDownloadPNG = async () => {
    setIsExporting(true);
    try {
      const canvas = await captureCardCanvas(3);
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `ZAYLOW-WarrantyCard-${customerName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to export PNG:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Download High-DPI PDF
  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
      const canvas = await captureCardCanvas(3);
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [dim.widthMm, dim.heightMm]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, dim.widthMm, dim.heightMm);
      pdf.save(`ZAYLOW-WarrantyCard-${customerName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('PDF generation failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // Compute preview scaling factor
  const scaleMultiplier = useMemo(() => {
    if (zoomLevel === '85') return 0.85;
    if (zoomLevel === '100') return 1.0;
    return 0.80; // Fit to screen comfortably without clipping on standard laptop displays
  }, [zoomLevel]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto select-none pb-24">
      {/* ── TOP HEADER & ACTIONS ── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-black text-black dark:text-white tracking-tight flex items-center gap-2">
              1-Year Warranty Card Studio
            </h2>
            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black">
              Official Label
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Official monochrome customer warranty card & packaging insert label for 1-Year Guarantee orders.
          </p>
        </div>

        {/* Selected Customer Quick-Cycle Banner & Main Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {selectedOrder && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
              <button
                onClick={handlePrevOrder}
                title="Previous 1-Year Order"
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="px-1 text-center">
                <span className="font-bold text-slate-900 dark:text-white block leading-tight max-w-[120px] truncate">
                  {customerName}
                </span>
                <span className="font-mono text-[9px] text-slate-400 block">
                  #{orderId.replace('ZYL-', '')}
                </span>
              </div>
              <button
                onClick={handleNextOrder}
                title="Next 1-Year Order"
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={handleDownloadPNG}
            disabled={isExporting}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-black dark:text-white" />
            <span>{isExporting ? 'Exporting...' : 'PNG (300 DPI)'}</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={isExporting}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
          >
            <FileDown className="w-3.5 h-3.5 text-black dark:text-white" />
            <span>PDF Card</span>
          </button>

          <button
            onClick={handlePrintAndNext}
            title="Print current card and move to next 1-year order in queue"
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition border border-slate-700 shadow-sm"
          >
            <PackageCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Print & Next</span>
          </button>

          <button
            onClick={handlePrintCard}
            className="px-5 py-2 rounded-xl bg-black text-white hover:bg-slate-800 font-black text-xs flex items-center gap-2 transition shadow-lg active:scale-95 border border-slate-700"
          >
            <Printer className="w-4 h-4" />
            <span>Print Official Label</span>
          </button>
        </div>
      </div>

      {/* ── MAIN WORKSPACE GRID: TABBED CONTROLS (LEFT) + LIVE PREVIEW (RIGHT) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── LEFT PANEL: TABBED STUDIO CONTROLLER ── */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          
          {/* Studio Navigation Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-1.5 gap-1 text-xs font-bold">
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-white dark:bg-slate-800 text-black dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Orders ({oneYearCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-white dark:bg-slate-800 text-black dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Card Details</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-white dark:bg-slate-800 text-black dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Print & Size</span>
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* ── TAB 1: ORDER SELECTION ── */}
            {activeTab === 'orders' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={onlyOneYearFilter}
                      onChange={(e) => setOnlyOneYearFilter(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-black focus:ring-0"
                    />
                    <span>1-Year Warranty Orders Only</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {filteredOrders.length} matching
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customer name, phone, or order ID..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-black dark:text-white focus:outline-none focus:border-black"
                  />
                </div>

                {/* Orders Scrollable List */}
                <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredOrders.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No orders match your search criteria.
                    </div>
                  ) : (
                    filteredOrders.map((order) => {
                      const isSelected = selectedOrder?.id === order.id;
                      const is1Year = isOneYearOrder(order);
                      return (
                        <button
                          key={order.id}
                          onClick={() => handleSelectOrder(order)}
                          className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-2 ${
                            isSelected
                              ? 'bg-slate-100 dark:bg-slate-800 border border-black/40 shadow-xs'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-black dark:text-white truncate">
                                {order.customer.name}
                              </span>
                              {is1Year && (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-black text-white dark:bg-white dark:text-black">
                                  1Y
                                </span>
                              )}
                              {isSelected && (
                                <CheckCircle2 className="w-3 h-3 text-black dark:text-white shrink-0" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {order.item?.productName || 'Massager'} • {order.customer?.city || 'India'}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono text-[10px] font-bold text-slate-500 block">
                              #{order.id.replace('ZYL-', '')}
                            </span>
                            <span className="text-[9px] text-slate-400">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 2: LIVE CARD DETAILS EDITOR ── */}
            {activeTab === 'editor' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Nashid"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-black dark:text-white focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                        Purchase Date
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const todayStr = formatDateToDDMMYYYY(new Date());
                          setPurchaseDate(todayStr);
                          const nextYr = calculateOneYearEndDate(todayStr);
                          setWarrantyPeriod(nextYr);
                        }}
                        className="text-[9.5px] text-black dark:text-white font-bold hover:underline"
                      >
                        Today
                      </button>
                    </div>
                    <input
                      type="text"
                      value={purchaseDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPurchaseDate(val);
                        const nextYr = calculateOneYearEndDate(val);
                        if (nextYr) {
                          setWarrantyPeriod(nextYr);
                        }
                      }}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold font-mono text-black dark:text-white focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                        Warranty Period (End Date)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextYr = calculateOneYearEndDate(purchaseDate);
                          if (nextYr) {
                            setWarrantyPeriod(nextYr);
                          }
                        }}
                        className="text-[9.5px] text-black dark:text-white font-bold hover:underline"
                      >
                        +1 Year
                      </button>
                    </div>
                    <input
                      type="text"
                      value={warrantyPeriod}
                      onChange={(e) => setWarrantyPeriod(e.target.value)}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold font-mono text-black dark:text-white focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                      Product Name
                    </label>
                    <button
                      type="button"
                      onClick={() => setProductName('Period Cramps Relief Massager')}
                      className="text-[9px] text-black dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-bold"
                    >
                      Reset Default
                    </button>
                  </div>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-black dark:text-white focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Order Reference
                    </label>
                    <input
                      type="text"
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs text-black dark:text-white focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Product Visual
                    </label>
                    <select
                      value={productImage}
                      onChange={(e) => setProductImage(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-black dark:text-white focus:outline-none focus:border-black"
                    >
                      <option value="/warranty-product-belt.png">Official Product Belt (Isolated)</option>
                      <option value="/warranty-product.jpg">Original Design Photo</option>
                      <option value="/warranty-product-alt.jpg">Studio Floral Edition</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: PRINT & SIZING SETTINGS ── */}
            {activeTab === 'settings' && (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-black dark:text-white" />
                      Label Print Dimensions
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      {CARD_DIMENSIONS[cardSize].widthMm} × {CARD_DIMENSIONS[cardSize].heightMm} mm
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(['thermal', 'A6', 'compact'] as CardSizeOption[]).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setCardSize(sz)}
                        className={`py-2.5 px-2 rounded-xl font-bold transition text-center ${
                          cardSize === sz
                            ? 'bg-black text-white shadow-md font-black dark:bg-white dark:text-black'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="block text-[11px]">
                          {sz === 'thermal' ? '4×6" Label' : sz === 'A6' ? 'A6 Postcard' : 'Compact'}
                        </span>
                        <span className="block text-[8px] opacity-80 mt-0.5">
                          {sz === 'thermal' ? 'H30C-lite (100×150)' : sz === 'A6' ? 'Box Insert' : '85×125 mm'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-[10.5px] text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5" /> 4×6" Thermal Printing Ready:
                  </p>
                  <p>
                    This label is formatted natively for your <strong>4×6" thermal label printer (H30C-lite)</strong> in standard <strong>Portrait</strong> orientation. It prints edge-to-edge with crisp monochrome thermal clarity.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: LIVE HIGH-FIDELITY PREVIEW ── */}
        <div className="lg:col-span-7 flex flex-col items-center w-full">
          <div className="w-full bg-slate-100/90 dark:bg-slate-900/60 p-4 md:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col items-center shadow-inner">
            
            {/* Preview Stage Toolbar */}
            <div className="flex items-center justify-between w-full gap-3 mb-4 border-b border-slate-200 dark:border-slate-800/80 pb-3 text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-black dark:text-white font-extrabold text-sm">Official Warranty Label</span>
                <span className="text-[10px] text-slate-500 font-bold bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  {cardSize === 'thermal' ? '4×6" Thermal (100 × 150 mm)' : cardSize === 'A6' ? 'A6 (105 × 148 mm)' : 'Compact (85 × 125 mm)'}
                </span>
              </div>

              {/* Zoom Scale Buttons */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700 text-[10px]">
                <ZoomIn className="w-3 h-3 text-slate-400 ml-1" />
                {(['auto', '85', '100'] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoomLevel(z)}
                    className={`px-2 py-0.5 rounded-md font-bold uppercase transition ${
                      zoomLevel === z
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {z === 'auto' ? 'Fit' : `${z}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Rendered Card Container */}
            <div className="w-full flex items-center justify-center p-2 min-h-[460px] overflow-visible">
              <div
                style={{
                  width: `${Math.round((CARD_DIMENSIONS[cardSize]?.widthMm || 100) * 3.7795 * scaleMultiplier)}px`,
                  height: `${Math.round((CARD_DIMENSIONS[cardSize]?.heightMm || 150) * 3.7795 * scaleMultiplier)}px`,
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    transform: `scale(${scaleMultiplier})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                  className="bg-transparent rounded-2xl shadow-xl shrink-0"
                >
                  <WarrantyCard
                    innerRef={printContainerRef}
                    customerName={customerName}
                    purchaseDate={purchaseDate}
                    warrantyPeriod={warrantyPeriod}
                    productName={productName}
                    orderId={orderId}
                    size={cardSize}
                    productImage={productImage}
                  />
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="mt-4 text-center max-w-md">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                💡 <strong className="text-slate-700 dark:text-slate-300">Printing Note:</strong> Directly prints in Portrait orientation onto standard 4×6" (100 × 150 mm) thermal adhesive roll or box insert cardstock.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
