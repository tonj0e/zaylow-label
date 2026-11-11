import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Order } from '../../types';
import { DataService } from '../../services/dataService';
import { WarrantyCard } from './WarrantyCard';
import { CARD_DIMENSIONS, type CardSizeOption } from '../../constants/warrantyCardSizes';
import jsPDF from 'jspdf';
import { Check, CheckSquare, ChevronLeft, ChevronRight, Download, Eye, FileDown, Loader2, PackageCheck, PencilLine, Printer, Search, Square, Users } from 'lucide-react';
import { Switch } from '../common/Switch';

interface WarrantyCardViewProps {
  orders?: Order[];
  initialOrder?: Order | null;
  /** called after cards are marked printed, so the orders are loaded again */
  onOrdersChanged?: () => void | Promise<void>;
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
  initialOrder,
  onOrdersChanged
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
  const [okNote, setOkNote] = useState('');
  const [tab, setTab] = useState<'customer' | 'card' | 'edit'>('card');
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  const printContainerRef = useRef<HTMLDivElement>(null);

  // which cards are printed: the order's saved day, with instant overrides while the save is on its way
  const [printedOverride, setPrintedOverride] = useState<Record<string, string | null>>({});
  const printedAt = (o: Order): string | undefined => (o.id in printedOverride ? printedOverride[o.id] || undefined : o.cardPrintedAt);
  const [stateFilter, setStateFilter] = useState<'all' | 'pending' | 'printed'>('pending');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchOrder, setBatchOrder] = useState<Order | null>(null);
  const batchRef = useRef<HTMLDivElement>(null);
  const today = () => new Date().toISOString().slice(0, 10);
  const markPrinted = async (ids: string[], printed: boolean) => {
    setPrintedOverride((m) => { const n = { ...m }; ids.forEach((id) => { n[id] = printed ? today() : null; }); return n; });
    const ok = await DataService.setCardPrinted(ids, printed);
    if (!ok) setNotice('The printed status could not be saved. Check the connection and try again.');
    else await onOrdersChanged?.();
  };

  // keep in step with the orders the site loads
  useEffect(() => { if (propOrders && propOrders.length) setOrders(propOrders); }, [propOrders]);

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

  // Only the Premium (699) massager carries the 1-year warranty. The normal 499 one does not get a card.
  const isOneYearOrder = (order: Order): boolean => /premium/i.test(order.item?.productName || '');

  // Filter orders: 1-year only, then the search, then Pending / Printed
  const baseOrders = useMemo(() => {
    return orders.filter(o => {
      if (onlyOneYearFilter && !isOneYearOrder(o)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.phone.includes(q) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q))
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, onlyOneYearFilter, searchQuery]);
  const counts = useMemo(() => {
    let printed = 0;
    baseOrders.forEach((o) => { if (o.id in printedOverride ? printedOverride[o.id] : o.cardPrintedAt) printed += 1; });
    return { all: baseOrders.length, printed, pending: baseOrders.length - printed };
  }, [baseOrders, printedOverride]);
  const stateOrders = useMemo(() => {
    if (stateFilter === 'all') return baseOrders;
    return baseOrders.filter((o) => { const done = !!(o.id in printedOverride ? printedOverride[o.id] : o.cardPrintedAt); return stateFilter === 'printed' ? done : !done; });
  }, [baseOrders, stateFilter, printedOverride]);
  // Product groups (for example Standard and Premium) with how many cards each has in the current Pending/Printed view
  const productGroups = useMemo(() => {
    const m = new Map<string, number>();
    stateOrders.forEach((o) => { const n = cardProductName(o.item?.productName); m.set(n, (m.get(n) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [stateOrders]);
  const filteredOrders = useMemo(() => (
    productFilter === 'all' ? stateOrders : stateOrders.filter((o) => cardProductName(o.item?.productName) === productFilter)
  ), [stateOrders, productFilter]);

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
      const { captureCanvas } = await import('../../utils/captureImage');
      const canvas = await captureCanvas(el, scale);
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
      if (selectedOrder) void markPrinted([selectedOrder.id], true);
    } catch (err) {
      console.error('Print generation failed:', err);
      setNotice('Could not prepare the card for printing. Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Print every ticked card together: one picture per card, one card per page
  const cardPropsFor = (o: Order) => {
    const pDate = o.date ? formatDateToDDMMYYYY(o.date) : '';
    const end = o.warrantyEnd ? formatDateToDDMMYYYY(o.warrantyEnd) : calculateOneYearEndDate(pDate);
    return { customerName: o.customer.name || '', purchaseDate: pDate, warrantyPeriod: end, productName: cardProductName(o.item?.productName), orderId: o.id };
  };
  // Draw each ticked card in turn and return one picture per card
  const renderCards = async (list: Order[]): Promise<string[]> => {
    const { captureCanvas } = await import('../../utils/captureImage');
    const urls: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBatchOrder(list[i]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, i === 0 ? 350 : 120));
      if (!batchRef.current) throw new Error('card not ready');
      urls.push((await captureCanvas(batchRef.current, 3)).toDataURL('image/png'));
      setBatch({ done: i + 1, total: list.length });
    }
    return urls;
  };
  const pickedList = () => orders.filter((o) => picked.has(o.id));
  const tooMany = (n: number) => { if (n > 100) { setNotice('Do up to 100 cards at a time. Untick some and try again.'); return true; } return false; };
  const printSelected = async () => {
    const list = pickedList();
    if (list.length === 0 || tooMany(list.length)) return;
    const win = window.open('', '_blank');
    if (!win) { setNotice('Your browser blocked the print window. Allow pop-ups for this site, then press Print again.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:24px">Preparing the cards…</p>');
    setIsExporting(true); setNotice(''); setOkNote(''); setBatch({ done: 0, total: list.length });
    try {
      const urls = await renderCards(list);
      const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
      win.document.open();
      win.document.write(`<!DOCTYPE html><html><head><title>ZAYLOW Warranty Cards (${urls.length})</title><style>
        @page { size: ${dim.widthMm}mm ${dim.heightMm}mm portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        img { display: block; width: ${dim.widthMm}mm; height: ${dim.heightMm}mm; object-fit: contain; page-break-after: always; break-after: page; }
        img:last-child { page-break-after: auto; break-after: auto; }
      </style></head><body>${urls.map((u) => `<img src="${u}" />`).join('')}<script>
        window.onload = function () { setTimeout(function () { window.print(); }, 400); };
      </script></body></html>`);
      win.document.close();
      await markPrinted(list.map((o) => o.id), true);
      setOkNote(`${list.length} warranty card${list.length === 1 ? '' : 's'} sent to print and marked Printed.`);
      setPicked(new Set());
    } catch (err) {
      console.error('Batch print failed:', err);
      try { win.close(); } catch { /* ignore */ }
      setNotice('Could not prepare the cards for printing. Try again with fewer cards.');
    } finally {
      setBatchOrder(null); setBatch(null); setIsExporting(false);
    }
  };
  const safeName = (o: Order) => (o.customer.name || 'customer').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '-' + o.id.replace(/[^A-Za-z0-9]+/g, '');
  // Download the ticked cards: one PNG each, or all in one PDF (one card per page)
  const downloadSelected = async (as: 'png' | 'pdf') => {
    const list = pickedList();
    if (list.length === 0 || tooMany(list.length)) return;
    setIsExporting(true); setNotice(''); setOkNote(''); setBatch({ done: 0, total: list.length });
    try {
      const urls = await renderCards(list);
      if (as === 'pdf') {
        const dim = CARD_DIMENSIONS[cardSize] || CARD_DIMENSIONS.thermal;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [dim.widthMm, dim.heightMm] });
        urls.forEach((u, i) => { if (i > 0) pdf.addPage([dim.widthMm, dim.heightMm], 'portrait'); pdf.addImage(u, 'PNG', 0, 0, dim.widthMm, dim.heightMm); });
        pdf.save(`ZAYLOW-WarrantyCards-${list.length}.pdf`);
      } else {
        for (let i = 0; i < urls.length; i++) {
          const a = document.createElement('a');
          a.download = `ZAYLOW-WarrantyCard-${safeName(list[i])}.png`;
          a.href = urls[i];
          document.body.appendChild(a); a.click(); a.remove();
          await new Promise((r) => setTimeout(r, 350));
        }
      }
      setOkNote(`${list.length} warranty card${list.length === 1 ? '' : 's'} downloaded${as === 'pdf' ? ' as one PDF' : ' as separate PNG files'}. They are still marked Pending until you print them or tap Mark as printed.`);
    } catch (err) {
      console.error('Batch download failed:', err);
      setNotice('Could not make the downloads. Try again with fewer cards.');
    } finally {
      setBatchOrder(null); setBatch(null); setIsExporting(false);
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

      {okNote && <p role="status" className="text-sm font-medium rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--lime) 16%, transparent)' }}><Check className="w-4 h-4 k-lime-text" />{okNote}</p>}
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
              <span className="font-medium">Only Premium (1-year warranty) orders</span>
              <Switch on={onlyOneYearFilter} onChange={setOnlyOneYearFilter} label="Only Premium (1-year warranty) orders" />
            </div>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Show cards">
              {([['pending', 'Pending'], ['printed', 'Printed'], ['all', 'All']] as const).map(([k, l]) => (
                <button key={k} type="button" className="k-chip" aria-pressed={stateFilter === k} onClick={() => { setStateFilter(k); setProductFilter('all'); setPicked(new Set()); }}>{l} <span className="opacity-70">{counts[k]}</span></button>
              ))}
            </div>
            {productGroups.length > 1 && (
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Show product">
                <button type="button" className="k-chip" aria-pressed={productFilter === 'all'} onClick={() => { setProductFilter('all'); setPicked(new Set()); }}>All products <span className="opacity-70">{stateOrders.length}</span></button>
                {productGroups.map(([n, c]) => (
                  <button key={n} type="button" className="k-chip" aria-pressed={productFilter === n} onClick={() => { setProductFilter(n); setPicked(new Set()); }}>{n.replace('Period Cramps Relief Massager', 'Massager').trim() || n} <span className="opacity-70">{c}</span></button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setPicked(picked.size === filteredOrders.length && filteredOrders.length > 0 ? new Set() : new Set(filteredOrders.slice(0, 100).map((o) => o.id)))} className="flex items-center gap-2 text-sm font-semibold" aria-label="Select all shown">
                {filteredOrders.length > 0 && picked.size >= Math.min(filteredOrders.length, 100) ? <CheckSquare className="w-5 h-5 k-lime-text" /> : <Square className="w-5 h-5 k-muted" />} Select all shown
              </button>
              <span className="text-xs k-muted tabular-nums">{picked.size} selected</span>
            </div>
            {picked.size === 0 && stateFilter === 'pending' && filteredOrders.length > 1 && (
              <p className="text-xs k-muted">Printed most of these before? Tick the ones you still need, then tap "Mark the others as printed".</p>
            )}
            {picked.size > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void printSelected()} disabled={isExporting} className="k-btn k-btn-lime py-2.5 text-sm col-span-2">{batch ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing {batch.done} of {batch.total}…</> : <><Printer className="w-4 h-4" /> Print {picked.size} selected</>}</button>
                <button type="button" onClick={() => void downloadSelected('png')} disabled={isExporting} className="k-btn k-btn-soft py-2 text-xs"><Download className="w-4 h-4" /> Download {picked.size} PNG</button>
                <button type="button" onClick={() => void downloadSelected('pdf')} disabled={isExporting} className="k-btn k-btn-soft py-2 text-xs"><FileDown className="w-4 h-4" /> Download 1 PDF</button>
                <button type="button" onClick={() => { void markPrinted([...picked], true); setPicked(new Set()); }} disabled={isExporting} className="k-btn k-btn-soft py-2 text-xs">Mark as printed</button>
                {stateFilter === 'pending' && filteredOrders.length > picked.size && (
                  <button type="button" disabled={isExporting} className="k-btn k-btn-soft py-2 text-xs col-span-2" onClick={() => {
                    const rest = filteredOrders.filter((o) => !picked.has(o.id)).map((o) => o.id);
                    if (!window.confirm(`Mark the other ${rest.length} pending cards as already printed? The ${picked.size} ticked cards stay pending.`)) return;
                    void markPrinted(rest, true).then(() => setOkNote(`${rest.length} cards marked as printed. ${picked.size} still pending.`));
                  }}>Mark the other {filteredOrders.length - picked.size} as already printed</button>
                )}
                <button type="button" onClick={() => { void markPrinted([...picked], false); setPicked(new Set()); }} disabled={isExporting} className="k-btn k-btn-soft py-2 text-xs">Mark as not printed</button>
              </div>
            )}
          </div>
          <ul className="max-h-[26rem] md:max-h-[calc(100vh-30rem)] overflow-y-auto border-t k-rule">
            {filteredOrders.length === 0 ? (
              <li className="py-10 px-5 text-center text-sm k-muted">{stateFilter === 'pending' && counts.all > 0 ? 'Every card here is printed.' : stateFilter === 'printed' ? 'No card is marked printed yet.' : 'No order matches that search.'}</li>
            ) : filteredOrders.map((order) => {
              const on = selectedOrder?.id === order.id;
              const done = printedAt(order);
              const isPicked = picked.has(order.id);
              return (
                <li key={order.id} className="border-t k-rule first:border-t-0 flex items-stretch" style={on ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                  <button type="button" onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(order.id)) n.delete(order.id); else n.add(order.id); return n; })} aria-pressed={isPicked} aria-label={`Select ${order.customer.name}`} className="pl-4 pr-2 flex items-center shrink-0">
                    {isPicked ? <CheckSquare className="w-5 h-5 k-lime-text" /> : <Square className="w-5 h-5 k-muted" />}
                  </button>
                  <button onClick={() => pick(order)} aria-pressed={on} className="k-row flex-1 min-w-0 text-left pr-4 py-3 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold truncate">{order.customer.name}{on && <Check className="w-3.5 h-3.5 k-lime-text shrink-0" />}</span>
                      <span className="block text-xs k-muted truncate">{order.customer?.city || order.item?.productName || 'Massager'}</span>
                      <span className="block text-xs font-semibold truncate">{order.date ? `Ordered ${formatDateToDDMMYYYY(order.date)}` : 'No order date'}{/premium/i.test(order.item?.productName || '') ? ' · Premium' : ''}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-xs font-mono font-semibold">{order.id.replace('ZYL-', '#')}</span>
                      <span className="inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={done ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { background: 'var(--card2)', color: 'var(--ink)' }}>{done ? `Printed ${new Date(done + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Pending'}</span>
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

      {/* off-screen copy of each card while many are printed together */}
      {batchOrder && (
        <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <WarrantyCard innerRef={batchRef} {...cardPropsFor(batchOrder)} size={cardSize} productImage={productImage} />
        </div>
      )}

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
