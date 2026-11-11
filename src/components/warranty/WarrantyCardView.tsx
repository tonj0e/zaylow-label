import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Order } from '../../types';
import { DataService } from '../../services/dataService';
import { WarrantyCard } from './WarrantyCard';
import { CARD_DIMENSIONS, type CardSizeOption } from '../../constants/warrantyCardSizes';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileDown, PackageCheck, PencilLine, Printer, Search, Users } from 'lucide-react';
import { Switch } from '../common/Switch';

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

// Old orders carry whatever name the product had when it was sold ("premium quality 2nd carton"). The card shows the proper product name.
const cardProductName = (sold?: string): string => {
  const n = (sold || '').toLowerCase();
  if (/premium/.test(n)) return 'Period Cramps Relief Massager Premium';
  if (/massager|massage/.test(n)) return 'Period Cramps Relief Massager';
  return (sold || '').trim() || 'Period Cramps Relief Massager';
};

export const WarrantyCardView: React.FC<WarrantyCardViewProps> = ({
  orders: propOrders,
  initialOrder
}) => {
  const [orders, setOrders] = useState<Order[]>(propOrders || []);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialOrder || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOneYearFilter, setOnlyOneYearFilter] = useState(true);

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
    cardProductName(initialOrder?.item?.productName)
  );
  const [orderId, setOrderId] = useState(initialOrder?.id || 'ZYL-10928');
  const [productImage, setProductImage] = useState('/warranty-product-belt.png');

  // Display & Print Options: Default to 4x6" thermal card
  const [cardSize, setCardSize] = useState<CardSizeOption>('thermal');
  const [zoomLevel, setZoomLevel] = useState<'auto' | '85' | '100'>('auto');
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'customer' | 'card' | 'edit'>('card');
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

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

    setProductName(cardProductName(order.item?.productName));
    setOrderId(order.id);
  };

  // Never leave the sample card on screen: start on the first real customer
  useEffect(() => {
    if (!selectedOrder && !initialOrder && filteredOrders.length > 0) handleSelectOrder(filteredOrders[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, selectedOrder, initialOrder]);

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
    setIsExporting(true); setNotice('');
    try {
      const canvas = await captureCardCanvas(3);
      if (!canvas) return;
      const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
      const dataUrl = canvas.toDataURL('image/png');

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setNotice('Your browser blocked the print window. Allow pop-ups for this site, then press Print again.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>ZAYLOW Warranty Card - ${String(customerName).replace(/[&<>"']/g, '')}</title>
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
      setNotice('Could not prepare the card for printing. Try again.');
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
      setNotice('Could not make the PNG. Try again.');
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
      setNotice('Could not make the PDF. Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Preview size: on a phone the card fits the screen width; on a desk it is large by default
  const scaleMultiplier = useMemo(() => {
    if (zoomLevel === '85') return 0.85;
    if (zoomLevel === '100') return 1.0;
    const widthPx = CARD_DIMENSIONS[cardSize].widthMm * 3.7795;
    if (vw < 768) return Math.min(1, (vw - 72) / widthPx);
    return 0.9;
  }, [zoomLevel, vw, cardSize]);

  const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
  const SIZES: { key: CardSizeOption; label: string; note: string }[] = [
    { key: 'thermal', label: '4 × 6 inch label', note: '100 × 150 mm, thermal roll' },
    { key: 'A6', label: 'A6 card', note: '105 × 148 mm, box insert' },
    { key: 'compact', label: 'Compact', note: '85 × 125 mm' },
  ];

  const pick = (order: Order) => { handleSelectOrder(order); setTab('card'); };
  const TABS = [
    { key: 'customer' as const, label: 'Customer', icon: Users },
    { key: 'card' as const, label: 'Card', icon: Eye },
    { key: 'edit' as const, label: 'Edit', icon: PencilLine },
  ];
  const showOn = (k: typeof tab) => (tab === k ? '' : 'max-md:hidden');
  const position = currentOrderIndex >= 0 ? `${currentOrderIndex + 1} of ${filteredOrders.length}` : '';

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-[88rem] mx-auto pb-44 md:pb-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Warranty cards</h2>
          <p className="text-sm k-muted mt-1 max-md:hidden">Pick a customer on the left, check the card, then print it for the box.</p>
        </div>
        <div className="flex gap-2 flex-wrap max-md:hidden">
          <button onClick={handleDownloadPNG} disabled={isExporting} className="k-btn k-btn-soft px-4 py-2.5 text-sm"><Download className="w-4 h-4" /> PNG</button>
          <button onClick={handleDownloadPDF} disabled={isExporting} className="k-btn k-btn-soft px-4 py-2.5 text-sm"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={handlePrintAndNext} disabled={isExporting} title="Print this card, then move to the next customer" className="k-btn k-btn-outline-green px-4 py-2.5 text-sm"><PackageCheck className="w-4 h-4" /> Print and next</button>
          <button onClick={handlePrintCard} disabled={isExporting} className="k-btn k-btn-lime px-5 py-2.5 text-sm"><Printer className="w-4 h-4" /> {isExporting ? 'Preparing…' : 'Print card'}</button>
        </div>
      </header>

      {notice && <p role="alert" className="text-sm font-medium rounded-2xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>{notice}</p>}

      {/* Phone: three tabs, one step on screen at a time */}
      <div role="tablist" aria-label="Warranty card steps" className="md:hidden k-card p-1 flex" style={{ borderRadius: 999 }}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold ${tab === t.key ? 'k-btn-lime' : 'k-muted'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem] gap-4 md:gap-5 items-start">
        {/* 1. Customers */}
        <section className={`k-card overflow-hidden min-w-0 md:sticky md:top-28 ${showOn('customer')}`} aria-label="Choose a customer">
          <div className="p-4 pb-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold k-display">Customer</h3>
              <p className="text-xs k-muted tabular-nums">{filteredOrders.length} of {oneYearCount}</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, phone or order ID" aria-label="Search customers" className="k-field" style={{ paddingLeft: '2.4rem' }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Only 1-year warranty orders</span>
              <Switch on={onlyOneYearFilter} onChange={setOnlyOneYearFilter} label="Only 1-year warranty orders" />
            </div>
          </div>
          <ul className="max-h-[26rem] md:max-h-[calc(100vh-22rem)] overflow-y-auto border-t k-rule">
            {filteredOrders.length === 0 ? (
              <li className="py-10 px-5 text-center text-sm k-muted">No order matches that search.</li>
            ) : filteredOrders.map((order) => {
              const on = selectedOrder?.id === order.id;
              return (
                <li key={order.id} className="border-t k-rule first:border-t-0">
                  <button onClick={() => pick(order)} aria-pressed={on} className="k-row w-full text-left px-4 py-3 flex items-center gap-3" style={on ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold truncate">{order.customer.name}{on && <Check className="w-3.5 h-3.5 k-lime-text shrink-0" />}</span>
                      <span className="block text-xs k-muted truncate">{order.customer?.city || order.item?.productName || 'Massager'}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-xs font-mono font-semibold">{order.id.replace('ZYL-', '#')}</span>
                      <span className="block text-xs k-muted">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 2. The card, on a dark desk */}
        <section className={`min-w-0 rounded-[28px] p-4 sm:p-6 rep-hero ${showOn('card')}`} style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)', backgroundSize: '18px 18px' }} aria-label="Card preview">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div role="radiogroup" aria-label="Paper size" className="flex gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,.1)' }}>
              {SIZES.map((z) => {
                const on = cardSize === z.key;
                return <button key={z.key} role="radio" aria-checked={on} onClick={() => setCardSize(z.key)} title={z.note} className="px-3.5 py-1.5 rounded-full text-xs font-semibold" style={on ? { background: '#fff', color: '#0b0d0a' } : { opacity: 0.75 }}>{z.key === 'thermal' ? '4 × 6 in' : z.key === 'A6' ? 'A6' : 'Compact'}</button>;
              })}
            </div>
            <div role="group" aria-label="Preview size" className="flex gap-1 p-1 rounded-full max-md:hidden" style={{ background: 'rgba(255,255,255,.1)' }}>
              {(['auto', '85', '100'] as const).map((z) => (
                <button key={z} onClick={() => setZoomLevel(z)} aria-pressed={zoomLevel === z} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={zoomLevel === z ? { background: '#fff', color: '#0b0d0a' } : { opacity: 0.75 }}>{z === 'auto' ? 'Fit' : `${z}%`}</button>
              ))}
            </div>
          </div>

          <div className="w-full flex items-start justify-center overflow-x-auto md:overflow-visible min-h-[300px]">
            <div style={{ width: `${Math.round(dim.widthMm * 3.7795 * scaleMultiplier)}px`, height: `${Math.round(dim.heightMm * 3.7795 * scaleMultiplier)}px`, position: 'relative' }}>
              <div style={{ transform: `scale(${scaleMultiplier})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }} className="bg-transparent rounded-2xl shadow-2xl shrink-0">
                <WarrantyCard innerRef={printContainerRef} customerName={customerName} purchaseDate={purchaseDate} warrantyPeriod={warrantyPeriod} productName={productName} orderId={orderId} size={cardSize} productImage={productImage} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5">
            <button onClick={handlePrevOrder} aria-label="Previous customer" className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.14)' }}><ChevronLeft className="w-5 h-5" /></button>
            <div className="text-center min-w-[9rem]">
              <p className="font-semibold truncate max-w-[12rem]">{customerName}</p>
              <p className="text-xs opacity-60 font-mono">{orderId.replace('ZYL-', '#')}{position && ` · ${position}`}</p>
            </div>
            <button onClick={handleNextOrder} aria-label="Next customer" className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.14)' }}><ChevronRight className="w-5 h-5" /></button>
          </div>
        </section>

        {/* 3. Edit what is printed */}
        <section className={`k-card p-4 md:p-5 space-y-4 min-w-0 md:col-span-2 xl:col-span-1 xl:sticky xl:top-28 ${showOn('edit')}`} aria-label="Card details">
          <h3 className="font-bold k-display">Edit the card</h3>
          <div>
            <label htmlFor="wc-name" className="k-label">Customer name</label>
            <input id="wc-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="k-field font-semibold" autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5"><label htmlFor="wc-start" className="k-label !mb-0">Bought on</label>
                <button type="button" onClick={() => { const t = formatDateToDDMMYYYY(new Date()); setPurchaseDate(t); setWarrantyPeriod(calculateOneYearEndDate(t)); }} className="text-xs font-semibold underline">Today</button></div>
              <input id="wc-start" value={purchaseDate} onChange={(e) => { const v = e.target.value; setPurchaseDate(v); const n = calculateOneYearEndDate(v); if (n) setWarrantyPeriod(n); }} placeholder="DD/MM/YYYY" className="k-field font-mono" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5"><label htmlFor="wc-end" className="k-label !mb-0">Ends</label>
                <button type="button" onClick={() => { const n = calculateOneYearEndDate(purchaseDate); if (n) setWarrantyPeriod(n); }} className="text-xs font-semibold underline">+1 year</button></div>
              <input id="wc-end" value={warrantyPeriod} onChange={(e) => setWarrantyPeriod(e.target.value)} placeholder="DD/MM/YYYY" className="k-field font-mono" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5"><label htmlFor="wc-product" className="k-label !mb-0">Product</label>
              <button type="button" onClick={() => setProductName('Period Cramps Relief Massager')} className="text-xs font-semibold underline">Standard name</button></div>
            <input id="wc-product" value={productName} onChange={(e) => setProductName(e.target.value)} className="k-field font-semibold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="wc-order" className="k-label">Order number</label><input id="wc-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="k-field font-mono" /></div>
            <div><label htmlFor="wc-image" className="k-label">Picture</label>
              <select id="wc-image" value={productImage} onChange={(e) => setProductImage(e.target.value)} className="k-field">
                <option value="/warranty-product-belt.png">Product belt</option>
                <option value="/warranty-product.jpg">Original photo</option>
                <option value="/warranty-product-alt.jpg">Floral edition</option>
              </select></div>
          </div>
          <p className="text-xs k-muted">{dim.widthMm} × {dim.heightMm} mm. Prints upright, edge to edge, on the 4 × 6 inch thermal printer.</p>
        </section>
      </div>

      {/* Phone: print bar stays above the tab bar */}
      <div className="md:hidden fixed left-3 right-3 z-30 flex gap-2 p-2 rounded-3xl k-card" style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))', boxShadow: '0 10px 30px -10px rgba(0,0,0,.35)' }}>
        <button onClick={handlePrintCard} disabled={isExporting} className="k-btn k-btn-lime flex-1 py-3 text-sm"><Printer className="w-4 h-4" /> {isExporting ? 'Preparing…' : 'Print card'}</button>
        <button onClick={handlePrintAndNext} disabled={isExporting} aria-label="Print and next customer" className="k-btn k-btn-outline-green w-12 h-12"><PackageCheck className="w-4 h-4" /></button>
        <button onClick={handleDownloadPNG} disabled={isExporting} aria-label="Download PNG" className="k-btn k-btn-soft w-12 h-12"><Download className="w-4 h-4" /></button>
        <button onClick={handleDownloadPDF} disabled={isExporting} aria-label="Download PDF" className="k-btn k-btn-soft w-12 h-12"><FileDown className="w-4 h-4" /></button>
      </div>
    </div>
  );
};
