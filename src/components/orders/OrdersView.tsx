import React, { useState, useMemo, useEffect } from 'react';
import type { Order, OrderStatus, CompanySettings } from '../../types';
import { Printer, FileDown, Trash2, ChevronLeft, ChevronRight, Download, Award, ScanLine, CheckCircle2, X, ListPlus, Pencil, CalendarDays, PackageCheck, Truck } from 'lucide-react';
import { TrackingModal } from './TrackingModal';
import { TrackingScannerModal } from './TrackingScannerModal';
import { OrderEditModal } from './OrderEditModal';
import type { OrderChanges } from './OrderEditModal';
import { useLabelDownload } from '../../hooks/useLabelDownload';
import { STATUS_DOT, STATUS_ORDER } from './orderUi';

interface OrdersViewProps {
  orders: Order[];
  settings: CompanySettings;
  searchQuery: string;
  statusFilter: OrderStatus | 'ALL';
  setStatusFilter: (status: OrderStatus | 'ALL') => void;
  onOpenOrderModal: () => void;
  onNavigateToGenerator: (order: Order) => void;
  onPrintBulkOrders: (orders: Order[]) => void;
  onAddToQueue: (orders: Order[]) => void;
  onDownloadBulkPDF: (orders: Order[]) => void;
  onDeleteOrder: (id: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateTracking: (id: string, trackingNumber: string, shippingLabelUrl: string | null) => void;
  onEditOrder: (id: string, changes: OrderChanges) => Promise<boolean>;
  onNavigateToWarrantyCard?: (order: Order) => void;
}

const PAGE = 15;
// shared column template so the header lines up with every row on wide screens
const COLS = 'lg:grid-cols-[1.75rem_8.5rem_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.15fr)_7rem_9.5rem_16.5rem]';

const IconBtn: React.FC<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, danger, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="w-9 h-9 rounded-full flex items-center justify-center k-btn-soft disabled:opacity-40"
    style={danger ? { color: 'var(--bad)' } : undefined}
  >
    {children}
  </button>
);

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders, settings, searchQuery, statusFilter, setStatusFilter, onOpenOrderModal: _onOpenOrderModal, onNavigateToGenerator,
  onAddToQueue, onDownloadBulkPDF, onDeleteOrder, onUpdateStatus, onUpdateTracking, onEditOrder, onNavigateToWarrantyCard,
}) => {
  const { download, downloadingId, overlay } = useLabelDownload(settings);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editedId, setEditedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ orderId: string; customerName: string; trackingNumber: string } | null>(null);
  const [courierFilter, setCourierFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!editedId) return;
    const t = setTimeout(() => setEditedId(null), 3500);
    return () => clearTimeout(t);
  }, [editedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // back to page 1 whenever the search or status filter changes from outside
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const stats = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t = start.getTime();
    const live = orders.filter((o) => o.status !== 'Cancelled');
    const day = 86_400_000;
    const week = Array.from({ length: 7 }, (_, i) => {
      const from = t - (6 - i) * day;
      const d = new Date(from);
      return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), n: live.filter((o) => { const c = new Date(o.createdAt).getTime(); return c >= from && c < from + day; }).length };
    });
    const shipped = orders.filter((o) => o.status === 'Shipped');
    const ready = counts['Printed'] || 0;
    const printedOrBeyond = ready + (counts['Shipped'] || 0) + (counts['Delivered'] || 0);
    return {
      today: week[6].n,
      week,
      toPrint: (counts['Pending'] || 0) + (counts['Processing'] || 0) + (counts['Label Generated'] || 0),
      ready,
      printedShare: live.length ? Math.round((printedOrBeyond / live.length) * 100) : 0,
      shippedCount: shipped.length,
      shipShare: ready + shipped.length ? Math.round((shipped.length / (ready + shipped.length)) * 100) : 0,
      shippedCod: shipped.filter((o) => o.paymentType === 'COD').length,
      codOnRoad: shipped.filter((o) => o.paymentType === 'COD').reduce((n, o) => n + o.codAmount, 0),
    };
  }, [orders, counts]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return orders.filter((o) => {
      const matchQuery = !q ||
        o.id.toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) || o.customer.phone.includes(q) ||
        o.customer.pinCode.includes(q) || o.courier.toLowerCase().includes(q) || o.customer.city.toLowerCase().includes(q) ||
        o.item.productName.toLowerCase().includes(q);
      return matchQuery &&
        (statusFilter === 'ALL' || o.status === statusFilter) &&
        (courierFilter === 'ALL' || o.courier === courierFilter) &&
        (paymentFilter === 'ALL' || o.paymentType === paymentFilter);
    });
  }, [orders, searchQuery, statusFilter, courierFilter, paymentFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, totalPages);
  const rows = useMemo(() => filtered.slice((current - 1) * PAGE, current * PAGE), [filtered, current]);

  const allOnPage = rows.length > 0 && rows.every((o) => selected.has(o.id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); rows.forEach((o) => (allOnPage ? n.delete(o.id) : n.add(o.id))); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedList = useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected]);

  const changeStatus = (order: Order, status: OrderStatus) => {
    if (status === 'Shipped') { setTrackingOrder(order); return; }
    onUpdateStatus(order.id, status);
  };

  const filtersActive = courierFilter !== 'ALL' || paymentFilter !== 'ALL';
  const pills: [string, string, number][] = [['ALL', 'All', orders.length], ...STATUS_ORDER.filter((s) => (counts[s] || 0) > 0 || s === statusFilter).map((s) => [s, s, counts[s] || 0] as [string, string, number])];

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-32 md:pb-28">
      <div className="space-y-5">
        <header className="k-rise flex items-end justify-between gap-4" style={{ ['--i' as string]: 0 }}>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Orders</h2>
            <p className="text-sm k-muted mt-2">
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{filtered.length.toLocaleString('en-IN')}</span> of {orders.length.toLocaleString('en-IN')}
              {searchQuery ? <> matching “{searchQuery}”</> : ' orders'}
            </p>
          </div>
          <button onClick={() => setScannerOpen(true)} className="k-btn k-btn-ink px-5 py-3 text-sm" title="Scan an India Post tracking code to mark an order as shipped">
            <ScanLine className="w-4 h-4" /> Scan tracking
          </button>
        </header>

        {/* four metric tiles, each with a small live chart */}
        <dl className="k-rise grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4" style={{ ['--i' as string]: 1 }}>
          <div className="k-card p-5 overflow-hidden">
            <div className="flex items-start justify-between">
              <dt className="text-sm k-muted">Placed today</dt>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 16%, var(--card2))' }}><CalendarDays className="w-[18px] h-[18px] k-lime-text" /></span>
            </div>
            <dd className="text-5xl font-bold k-display leading-none mt-3">{stats.today.toLocaleString('en-IN')}</dd>
            <dd className="mt-4" aria-label={`Orders in the last 7 days: ${stats.week.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
              <div className="flex items-end gap-1.5 h-10" aria-hidden>
                {stats.week.map((d, i) => (
                  <span key={i} title={`${d.label}: ${d.n} orders`} className="flex-1 rounded-sm" style={{ height: `${Math.max(8, (d.n / Math.max(1, ...stats.week.map((x) => x.n))) * 100)}%`, background: i === 6 ? 'var(--lime)' : 'color-mix(in srgb, var(--lime) 32%, var(--card2))' }} />
                ))}
              </div>
              <p className="text-xs k-muted mt-2">Last 7 days · {stats.week.reduce((n, d) => n + d.n, 0)} orders</p>
            </dd>
          </div>

          <div className="k-card p-5 overflow-hidden">
            <div className="flex items-start justify-between">
              <dt className="text-sm k-muted">Waiting for a label</dt>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 16%, var(--card2))' }}><Printer className="w-[18px] h-[18px] k-lime-text" /></span>
            </div>
            <dd className="text-5xl font-bold k-display leading-none mt-3">{stats.toPrint.toLocaleString('en-IN')}</dd>
            <dd className="mt-4">
              <div className="h-2 rounded-full k-track overflow-hidden"><div className="h-full rounded-full k-bar bar-grow" style={{ width: `${stats.printedShare}%` }} /></div>
              <p className="text-xs k-muted mt-2">{stats.printedShare}% of all orders are already printed</p>
            </dd>
          </div>

          <div className="k-card p-5 overflow-hidden">
            <div className="flex items-start justify-between">
              <dt className="text-sm k-muted">Ready to ship</dt>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 16%, var(--card2))' }}><PackageCheck className="w-[18px] h-[18px] k-lime-text" /></span>
            </div>
            <dd className="text-5xl font-bold k-display leading-none mt-3">{stats.ready.toLocaleString('en-IN')}</dd>
            <dd className="mt-4">
              <div className="h-2 rounded-full k-track overflow-hidden"><div className="h-full rounded-full k-bar bar-grow" style={{ width: `${stats.shipShare}%` }} /></div>
              <p className="text-xs k-muted mt-2">{stats.shippedCount} already with the courier ({stats.shipShare}%)</p>
            </dd>
          </div>

          <div className="k-card p-5 overflow-hidden">
            <div className="flex items-start justify-between">
              <dt className="text-sm k-muted">COD on the road</dt>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 16%, var(--card2))' }}><Truck className="w-[18px] h-[18px] k-lime-text" /></span>
            </div>
            <dd className="text-5xl font-bold k-display leading-none mt-3">₹{Math.round(stats.codOnRoad).toLocaleString('en-IN')}</dd>
            <dd className="mt-4">
              <div className="h-2 rounded-full k-track overflow-hidden flex">
                <div className="h-full k-bar bar-grow" style={{ width: `${stats.shippedCount ? (stats.shippedCod / stats.shippedCount) * 100 : 0}%` }} />
              </div>
              <p className="text-xs k-muted mt-2">{stats.shippedCod} of {stats.shippedCount} shipped parcels are COD</p>
            </dd>
          </div>
        </dl>

        {/* status tabs on the left, filters on the right */}
        <div className="k-rise flex flex-col xl:flex-row xl:items-end justify-between gap-3 border-b k-rule" style={{ ['--i' as string]: 2 }}>
          <nav aria-label="Filter by status">
            <ul className="flex flex-wrap gap-x-7">
              {pills.map(([id, label, n]) => {
                const on = statusFilter === id;
                return (
                  <li key={id}>
                    <button
                      onClick={() => { setStatusFilter(id as OrderStatus | 'ALL'); setPage(1); }}
                      aria-pressed={on}
                      className="relative flex items-center gap-2 py-3 text-sm font-semibold whitespace-nowrap transition-colors"
                      style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}
                    >
                      {id !== 'ALL' && <span className="w-2 h-2 rounded-full" style={{ background: STATUS_DOT[id] }} />}
                      {label} <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ background: on ? 'color-mix(in srgb, var(--lime) 20%, var(--card2))' : 'var(--card2)', color: on ? 'var(--ink)' : 'var(--muted)' }}>{n}</span>
                      <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-transform" style={{ background: 'var(--lime)', transform: on ? 'scaleX(1)' : 'scaleX(0)' }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2 flex-wrap pb-2.5">
            <select aria-label="Courier" value={courierFilter} onChange={(e) => { setCourierFilter(e.target.value); setPage(1); }} className="k-field" style={{ width: 'auto', borderRadius: 999, padding: '.45rem 1rem', fontSize: '.8rem' }}>
              <option value="ALL">All couriers</option>
              {['Delhivery', 'DTDC', 'India Post', 'Shiprocket', 'NimbusPost', 'Bluedart', 'Ekart'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Payment type" value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }} className="k-field" style={{ width: 'auto', borderRadius: 999, padding: '.45rem 1rem', fontSize: '.8rem' }}>
              <option value="ALL">COD and prepaid</option>
              <option value="COD">COD only</option>
              <option value="Prepaid">Prepaid only</option>
            </select>
            {filtersActive && <button onClick={() => { setCourierFilter('ALL'); setPaymentFilter('ALL'); setPage(1); }} className="text-sm font-semibold underline">Clear</button>}
            <button onClick={() => filtered.length && onAddToQueue(filtered)} disabled={!filtered.length} className="k-btn k-btn-ghost px-4 py-2 text-sm">
              <ListPlus className="w-4 h-4" /> Add all {filtered.length.toLocaleString('en-IN')} to queue
            </button>
          </div>
        </div>

        {/* list */}
        <section className="k-card k-hot overflow-hidden k-rise" style={{ ['--i' as string]: 3 }} aria-label="Orders">
          <div className={`hidden lg:grid ${COLS} gap-4 px-5 py-3 text-xs font-semibold k-muted border-b k-rule items-center`}>
            <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" className="w-4 h-4" style={{ accentColor: 'var(--lime)' }} />
            <span>Order</span><span>Customer</span><span>Deliver to</span><span>Product</span><span>Payment</span><span>Status</span><span className="text-right">Actions</span>
          </div>

          {rows.length === 0 ? (
            <p className="p-14 text-center text-sm k-muted">No order matches. Try another search or clear the filters.</p>
          ) : (
            <ul>
              {rows.map((o) => {
                const isSel = selected.has(o.id);
                return (
                  <li key={o.id} className={`k-row flex flex-wrap items-center gap-x-4 gap-y-3 px-4 lg:px-5 py-4 border-t k-rule first:border-t-0 lg:grid ${COLS}`} style={{ background: isSel ? 'var(--card2)' : undefined, boxShadow: isSel ? 'inset 3px 0 0 var(--lime)' : undefined }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(o.id)} aria-label={`Select ${o.id}`} className="w-4 h-4 order-1 lg:order-1" style={{ accentColor: 'var(--lime)' }} />

                    <div className="order-2 lg:order-2 flex-1 lg:flex-none min-w-0">
                      <p className="font-mono font-bold text-sm">{o.id}</p>
                      <p className="text-xs k-muted">{new Date(o.createdAt).toLocaleDateString('en-IN')}</p>
                    </div>

                    <label className="order-3 lg:order-7 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT[o.status] || '#94a3b8' }} />
                      <select aria-label={`Status of ${o.id}`} value={o.status} onChange={(e) => changeStatus(o, e.target.value as OrderStatus)} className="k-field" style={{ padding: '.4rem .7rem', borderRadius: 999, fontSize: '.8rem', fontWeight: 600, width: 'auto', background: `color-mix(in srgb, ${STATUS_DOT[o.status] || '#94a3b8'} 14%, var(--card2))`, borderColor: `color-mix(in srgb, ${STATUS_DOT[o.status] || '#94a3b8'} 38%, var(--line))` }}>
                        {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>

                    <div className="order-4 lg:order-3 basis-[calc(50%-.5rem)] lg:basis-auto min-w-0">
                      <p className="font-semibold text-sm truncate">{o.customer.name}</p>
                      <p className="font-mono text-xs k-muted">{o.customer.phone}</p>
                    </div>

                    <div className="order-5 lg:order-4 basis-[calc(50%-.5rem)] lg:basis-auto min-w-0">
                      <p className="text-sm truncate">{o.customer.city}</p>
                      <p className="font-mono text-xs k-muted">{o.customer.pinCode}</p>
                    </div>

                    <div className="order-6 lg:order-5 basis-[calc(50%-.5rem)] lg:basis-auto min-w-0">
                      <p className="text-sm font-semibold truncate capitalize">{o.item.productName.toLowerCase()}</p>
                      <p className="text-xs k-muted">{o.item.quantity > 1 ? `${o.item.quantity} pieces · ` : ''}{o.courier}</p>
                    </div>

                    <div className="order-7 lg:order-6 basis-[calc(50%-.5rem)] lg:basis-auto">
                      {o.paymentType === 'COD'
                        ? <p className="text-sm font-bold">₹{o.codAmount}</p>
                        : <span className="inline-block text-xs font-bold rounded-full px-2.5 py-0.5" style={{ background: 'color-mix(in srgb, var(--lime) 20%, var(--card2))', color: 'var(--ink)' }}>Prepaid</span>}
                      <p className="text-xs k-muted">{o.paymentType === 'COD' ? ((o.advancePaid || 0) > 0 ? `COD · advance ₹${o.advancePaid}` : 'COD') : ((o.advancePaid || 0) > 0 ? `paid ₹${o.advancePaid}` : 'paid')}</p>
                    </div>

                    <div className="order-8 lg:order-8 w-full lg:w-auto flex items-center justify-end gap-1.5">
                      <button onClick={() => onNavigateToGenerator(o)} className="k-btn k-btn-outline-green px-4 h-9 text-xs" title="Open the label to print"><Printer className="w-4 h-4" /> Print</button>
                      <IconBtn label="Edit customer or address" onClick={() => setEditOrder(o)}><Pencil className="w-4 h-4" /></IconBtn>
                      <IconBtn label="Download label as PNG" onClick={() => download(o)} disabled={downloadingId === o.id}><Download className="w-4 h-4" /></IconBtn>
                      {onNavigateToWarrantyCard && <IconBtn label="Print 1-year warranty card" onClick={() => onNavigateToWarrantyCard(o)}><Award className="w-4 h-4" /></IconBtn>}
                      <IconBtn label="Delete order" onClick={() => setDeleteConfirmId(o.id)} danger><Trash2 className="w-4 h-4" /></IconBtn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-5 py-3.5 border-t k-rule flex items-center justify-between text-sm">
            <span className="k-muted">{filtered.length === 0 ? '0 orders' : `${(current - 1) * PAGE + 1}–${Math.min(current * PAGE, filtered.length)} of ${filtered.length.toLocaleString('en-IN')}`}</span>
            <div className="flex items-center gap-2">
              <span className="k-muted hidden sm:inline">Page {current} of {totalPages}</span>
              <button disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page" className="k-btn k-btn-ghost w-9 h-9"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={current === totalPages} onClick={() => setPage(current + 1)} aria-label="Next page" className="k-btn k-btn-ghost w-9 h-9"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </section>
      </div>

      {/* selection bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 k-card flex items-center gap-2 p-2 pl-5 shadow-2xl k-rise" style={{ borderRadius: 999, ['--i' as string]: 0 }} role="region" aria-label="Selected orders">
          <span className="text-sm font-semibold whitespace-nowrap">{selected.size} selected</span>
          <button onClick={() => onAddToQueue(selectedList)} className="k-btn k-btn-ink px-4 h-10 text-sm"><ListPlus className="w-4 h-4" /> Add to queue</button>
          <button onClick={() => onDownloadBulkPDF(selectedList)} className="k-btn k-btn-ghost px-4 h-10 text-sm hidden sm:inline-flex"><FileDown className="w-4 h-4" /> PDF</button>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="k-btn k-btn-ghost w-10 h-10"><X className="w-4 h-4" /></button>
        </div>
      )}

      {overlay}

      {editOrder && (
        <OrderEditModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSave={async (changes) => {
            const ok = await onEditOrder(editOrder.id, changes);
            if (ok) setEditedId(editOrder.id);
            return ok;
          }}
          onSavedAndPrint={(updated) => onNavigateToGenerator(updated)}
        />
      )}

      {editedId && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] k-card flex items-center gap-3 px-4 py-3 shadow-2xl k-rise" role="status" style={{ ['--i' as string]: 0 }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 18%, var(--card2))' }}><CheckCircle2 className="w-5 h-5 k-lime-text" /></span>
          <p className="text-sm font-semibold">Order <span className="font-mono">{editedId}</span> updated</p>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label="Delete order">
          <div className="k-card p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-11 h-11 rounded-full flex items-center justify-center k-card2" style={{ color: 'var(--bad)' }}><Trash2 className="w-5 h-5" /></span>
              <div>
                <h3 className="font-bold text-lg leading-tight">Delete this order?</h3>
                <p className="text-sm k-muted">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm mb-6">Order <span className="font-mono font-bold">{deleteConfirmId}</span> will be removed for good.</p>
            <div className="flex gap-3">
              <button autoFocus onClick={() => setDeleteConfirmId(null)} className="flex-1 k-btn k-btn-ghost py-2.5 text-sm">Keep it</button>
              <button onClick={() => { onDeleteOrder(deleteConfirmId); setDeleteConfirmId(null); }} className="flex-1 k-btn py-2.5 text-sm text-white" style={{ background: 'var(--bad)' }}><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}

      <TrackingModal
        isOpen={!!trackingOrder}
        onClose={() => setTrackingOrder(null)}
        order={trackingOrder}
        onSubmit={(trackingNumber, shippingLabelUrl) => {
          if (trackingOrder) {
            onUpdateStatus(trackingOrder.id, 'Shipped');
            onUpdateTracking(trackingOrder.id, trackingNumber, shippingLabelUrl);
            setToast({ orderId: trackingOrder.id, customerName: trackingOrder.customer.name, trackingNumber: trackingNumber.toUpperCase() });
            setTrackingOrder(null);
          }
        }}
      />

      <TrackingScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        orders={orders}
        onUpdateStatus={onUpdateStatus}
        onUpdateTracking={(id, trackingNumber, url) => {
          onUpdateTracking(id, trackingNumber, url);
          const target = orders.find((o) => o.id === id);
          if (target) setToast({ orderId: id, customerName: target.customer.name, trackingNumber: trackingNumber.toUpperCase() });
        }}
      />

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] k-card flex items-center gap-3 px-4 py-3 shadow-2xl k-rise" role="status" style={{ ['--i' as string]: 0 }}>
          <span className="w-9 h-9 rounded-xl k-card2 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 k-lime-text" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Marked as shipped</p>
            <p className="text-xs k-muted truncate">{toast.orderId} · {toast.customerName} · <span className="font-mono">{toast.trackingNumber}</span></p>
          </div>
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-2 k-muted"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};
