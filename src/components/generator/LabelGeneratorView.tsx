import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Order, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import { PDFGeneratorService } from '../../services/pdfGenerator';
import { ThermalPrinterService } from '../../services/thermalPrinter';
import { LABEL_SIZES, DEFAULT_LABEL_SIZE } from '../../constants/labelSizes';
import type { LabelSize } from '../../constants/labelSizes';
import { Printer, FileDown, Copy, ListPlus, ChevronLeft, ChevronRight, Search, Minus, Plus, Check } from 'lucide-react';

interface LabelGeneratorViewProps {
  selectedOrder: Order | null;
  allOrders: Order[];
  settings: CompanySettings;
  onSelectOrder: (order: Order) => void;
  onAddToQueue: (orders: Order[]) => void;
  onDuplicateOrder: (order: Order) => void;
}

type Filter = 'all' | 'todo' | 'printed';

const MM_TO_PX = 3.779527;
const ROW = 66;
const TO_PRINT = ['Pending', 'Processing', 'Label Generated'];
const DOT: Record<string, string> = {
  Pending: '#f5a623', Processing: '#4f9bff', 'Label Generated': '#a78bfa', Printed: '#22c55e',
  Shipped: '#22d3ee', Delivered: '#3fb950', Cancelled: '#ff5a45', Claims: '#f472b6', Returned: '#fb923c',
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-2.5 border-t k-rule first:border-t-0">
    <dt className="k-muted shrink-0">{label}</dt>
    <dd className="min-w-0 text-right truncate">{children}</dd>
  </div>
);

export const LabelGeneratorView: React.FC<LabelGeneratorViewProps> = ({
  selectedOrder, allOrders, settings, onSelectOrder, onAddToQueue, onDuplicateOrder,
}) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [size, setSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [copies, setCopies] = useState(1);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [dup, setDup] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(520);
  const q = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => { if (window.innerWidth < 768) setZoomScale(0.75); }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeOrder = selectedOrder || allOrders[0];

  const rows = useMemo(() => allOrders.filter((o) => {
    if (filter === 'todo' && !TO_PRINT.includes(o.status)) return false;
    if (filter === 'printed' && o.status !== 'Printed') return false;
    if (!q) return true;
    return [o.id, o.customer.name, o.customer.phone, o.customer.city, o.trackingNumber || ''].some((f) => (f || '').toLowerCase().includes(q));
  }), [allOrders, filter, q]);

  const counts = useMemo(() => ({ todo: allOrders.filter((o) => TO_PRINT.includes(o.status)).length, printed: allOrders.filter((o) => o.status === 'Printed').length }), [allOrders]);

  // keep the active order in view when it changes (prev / next, search, jumping in from other pages)
  const activeId = activeOrder?.id;
  useEffect(() => {
    const el = listRef.current;
    if (!el || !activeId) return;
    const idx = rows.findIndex((o) => o.id === activeId);
    if (idx < 0) return;
    const top = idx * ROW;
    if (top < el.scrollTop || top + ROW > el.scrollTop + el.clientHeight) el.scrollTo({ top: Math.max(0, top - ROW * 2), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  if (!activeOrder) {
    return <div className="kdash min-h-full p-12 text-center k-muted">No orders yet. Create an order and its label will appear here.</div>;
  }

  const idx = allOrders.findIndex((o) => o.id === activeOrder.id);
  const prev = () => idx > 0 && onSelectOrder(allOrders[idx - 1]);
  const next = () => idx < allOrders.length - 1 && onSelectOrder(allOrders[idx + 1]);

  const print = async () => {
    if (!labelRef.current) return;
    try {
      const html = labelRef.current.outerHTML;
      for (let i = 0; i < copies; i++) {
        ThermalPrinterService.printLabelHTML(html, activeOrder.id);
        if (i < copies - 1) await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.error('Print failed:', err);
      alert('Print failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const pdf = async () => {
    if (!labelRef.current) return;
    setPdfBusy(true);
    try {
      await PDFGeneratorService.generateSinglePDF(labelRef.current, `Label_${activeOrder.id}_${activeOrder.customer.name.replace(/\s+/g, '_')}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  const duplicate = () => { onDuplicateOrder(activeOrder); setDup(true); setTimeout(() => setDup(false), 2500); };

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allVisiblePicked = rows.length > 0 && rows.every((o) => picked.has(o.id));
  const pickVisible = () => setPicked(allVisiblePicked ? new Set() : new Set(rows.map((o) => o.id)));
  const queuePicked = () => {
    const list = allOrders.filter((o) => picked.has(o.id));
    if (list.length) { onAddToQueue(list); setPicked(new Set()); }
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW) - 6);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 6);
  const visible = rows.slice(start, end);

  const stageW = size.widthMm * MM_TO_PX * zoomScale;
  const stageH = size.heightMm * MM_TO_PX * zoomScale;

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-7">
      <div className="max-w-[1500px] mx-auto">
        <header className="k-rise mb-4 flex items-end justify-between gap-3 flex-wrap" style={{ ['--i' as string]: 0 }}>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Print labels</h2>
            <p className="text-sm k-muted mt-2">{counts.todo} waiting to print · {counts.printed} printed · {allOrders.length} orders</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_330px] gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[600px]">
          {/* order queue */}
          <section className="k-card order-2 lg:order-1 flex flex-col overflow-hidden k-rise min-h-[360px] max-h-[520px] lg:max-h-none" style={{ ['--i' as string]: 1 }} aria-label="Orders">
            <div className="p-3 space-y-3 border-b k-rule">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
                <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); listRef.current?.scrollTo({ top: 0 }); }} aria-label="Find an order" placeholder="Order, name, phone, tracking" className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999, paddingTop: '.6rem', paddingBottom: '.6rem' }} />
              </div>
              <div className="flex gap-2" role="group" aria-label="Filter orders">
                {([['all', `All ${allOrders.length}`], ['todo', `To print ${counts.todo}`], ['printed', `Printed ${counts.printed}`]] as const).map(([id, label]) => (
                  <button key={id} className="k-chip" style={{ padding: '.3rem .7rem', fontSize: '.75rem' }} aria-pressed={filter === id} onClick={() => { setFilter(id); listRef.current?.scrollTo({ top: 0 }); }}>{label}</button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <button onClick={pickVisible} className="font-semibold k-muted hover:opacity-80">{allVisiblePicked ? 'Clear selection' : `Select ${rows.length} shown`}</button>
                {picked.size > 0 && <button onClick={queuePicked} className="k-btn k-btn-lime px-3 py-1.5 text-xs"><ListPlus className="w-3.5 h-3.5" /> Queue {picked.size}</button>}
              </div>
            </div>

            <div ref={listRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="Order list">
              {rows.length === 0 ? (
                <p className="p-8 text-center text-sm k-muted">No order matches.</p>
              ) : (
                <div style={{ height: rows.length * ROW, position: 'relative' }}>
                  {visible.map((o, i) => {
                    const on = o.id === activeOrder.id;
                    const isPicked = picked.has(o.id);
                    return (
                      <div
                        key={o.id}
                        role="option"
                        aria-selected={on}
                        className="absolute left-0 right-0 flex items-center gap-3 px-3 border-b k-rule cursor-pointer"
                        style={{ top: (start + i) * ROW, height: ROW, background: on ? 'color-mix(in srgb, var(--lime) 14%, transparent)' : undefined, boxShadow: on ? 'inset 3px 0 0 var(--lime)' : undefined }}
                        onClick={() => onSelectOrder(o)}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggle(o.id); }}
                          aria-label={isPicked ? `Unselect ${o.id}` : `Select ${o.id}`}
                          aria-pressed={isPicked}
                          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border"
                          style={{ background: isPicked ? 'var(--lime)' : 'transparent', borderColor: isPicked ? 'var(--lime)' : 'var(--line)', color: 'var(--on-lime)' }}
                        >
                          {isPicked && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT[o.status] || '#94a3b8' }} title={o.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold truncate">{o.customer.name}</span>
                          <span className="block text-xs k-muted truncate">{o.id} · {o.customer.city}</span>
                        </span>
                        <span className="text-xs font-semibold shrink-0">{o.paymentType === 'COD' ? `₹${o.codAmount}` : 'Paid'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* stage */}
          <section
            className="k-card order-1 lg:order-2 flex flex-col items-center overflow-hidden relative k-rise min-h-[460px]"
            style={{ ['--i' as string]: 2, backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            aria-label="Label preview"
          >
            <div className="w-full flex items-center justify-between p-3">
              <div className="k-card flex items-center gap-1 p-1" style={{ borderRadius: 999 }}>
                <button disabled={idx <= 0} onClick={prev} aria-label="Previous order" className="k-btn w-9 h-9 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-semibold px-2 min-w-[5.5rem] text-center">{idx + 1} of {allOrders.length}</span>
                <button disabled={idx >= allOrders.length - 1} onClick={next} aria-label="Next order" className="k-btn w-9 h-9 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <p className="text-xs font-semibold rounded-full px-3 py-2 k-card" style={{ borderRadius: 999 }}>{size.widthMm}×{size.heightMm} mm</p>
            </div>

            <div className="flex-1 w-full overflow-auto flex items-start justify-center px-4 pb-24 pt-2">
              <div className="relative shrink-0" style={{ width: stageW, height: stageH }}>
                <div className="absolute top-0 left-0 bg-white origin-top-left overflow-hidden" style={{ transform: `scale(${zoomScale})`, transition: 'transform .25s cubic-bezier(.22,1,.36,1)', boxShadow: '0 30px 60px -22px rgba(0,0,0,.5)', borderRadius: 2 }}>
                  <ThermalLabel innerRef={labelRef as React.RefObject<HTMLDivElement>} order={activeOrder} settings={settings} labelSize={size} scale={1} />
                </div>
              </div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 k-card flex items-center gap-1 p-1 shadow-xl" style={{ borderRadius: 999 }}>
              <button onClick={() => setZoomScale((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} aria-label="Zoom out" className="k-btn w-9 h-9"><Minus className="w-4 h-4" /></button>
              <button onClick={() => setZoomScale(1)} aria-label="Reset zoom" className="text-xs font-semibold w-14 text-center">{Math.round(zoomScale * 100)}%</button>
              <button onClick={() => setZoomScale((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} aria-label="Zoom in" className="k-btn w-9 h-9"><Plus className="w-4 h-4" /></button>
            </div>
          </section>

          {/* actions */}
          <aside className="order-3 space-y-4 lg:overflow-y-auto lg:pr-1" aria-label="Print actions">
            <div className="k-card k-hot p-5 space-y-3 k-rise" style={{ ['--i' as string]: 3 }}>
              <div>
                <p className="text-xs k-muted">Selected order</p>
                <p className="font-semibold truncate">{activeOrder.customer.name}</p>
                <p className="text-xs k-muted font-mono">{activeOrder.id}</p>
              </div>
              <button onClick={print} className="k-btn k-btn-lime w-full py-3.5 text-sm" style={{ boxShadow: '0 10px 28px -10px var(--lime)' }}>
                <Printer className="w-5 h-5" /> Print {copies} label{copies !== 1 ? 's' : ''}
              </button>
              <button disabled={pdfBusy} onClick={pdf} className="k-btn k-btn-ghost w-full py-3 text-sm"><FileDown className="w-4 h-4" /> {pdfBusy ? 'Making PDF…' : 'Download PDF'}</button>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => onAddToQueue([activeOrder])} className="k-btn k-btn-ghost py-2.5 text-xs"><ListPlus className="w-4 h-4" /> Add to queue</button>
                <button onClick={duplicate} className="k-btn k-btn-ghost py-2.5 text-xs"><Copy className="w-4 h-4" /> {dup ? 'Duplicated' : 'Duplicate'}</button>
              </div>
              <div className="pt-3 border-t k-rule flex items-center justify-between">
                <p className="text-sm font-semibold">Copies</p>
                <div className="flex items-center gap-1 rounded-full k-card2 p-1">
                  <button onClick={() => setCopies(Math.max(1, copies - 1))} aria-label="Fewer copies" className="k-btn w-8 h-8"><Minus className="w-4 h-4" /></button>
                  <span className="w-7 text-center text-sm font-bold" aria-live="polite">{copies}</span>
                  <button onClick={() => setCopies(copies + 1)} aria-label="More copies" className="k-btn w-8 h-8"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            <div className="k-card p-5 k-rise" style={{ ['--i' as string]: 4 }}>
              <h3 className="text-sm font-semibold mb-3">Label size</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {LABEL_SIZES.map((s) => {
                  const on = size.id === s.id;
                  return (
                    <button key={s.id} onClick={() => setSize(s)} aria-pressed={on} className="w-full text-left px-3.5 py-2.5 rounded-2xl border transition-colors" style={{ borderColor: on ? 'var(--lime)' : 'var(--line)', background: on ? 'color-mix(in srgb, var(--lime) 12%, transparent)' : 'var(--card2)' }}>
                      <span className="flex items-center justify-between"><span className="font-semibold text-sm">{s.name}</span>{s.popular && <span className="text-[11px] font-bold k-btn-lime rounded-full px-2 py-0.5">Popular</span>}</span>
                      <span className="block text-xs k-muted mt-0.5">{s.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="k-card p-5 k-rise" style={{ ['--i' as string]: 5 }}>
              <h3 className="text-sm font-semibold mb-2">Order details</h3>
              <dl className="text-sm">
                <Row label="Phone"><span className="font-mono">{activeOrder.customer.phone}</span></Row>
                <Row label="City and PIN">{activeOrder.customer.city} ({activeOrder.customer.pinCode})</Row>
                <Row label="Courier"><span className="font-semibold">{activeOrder.courier}</span></Row>
                <Row label="Status"><span className="font-semibold">{activeOrder.status}</span></Row>
                <Row label="Payment">
                  <span className="font-bold">
                    {activeOrder.paymentType === 'COD' ? `COD ₹${activeOrder.codAmount}` : 'Prepaid'}
                    {(activeOrder.advancePaid || 0) > 0 && <span className="k-muted font-medium"> · advance ₹{activeOrder.advancePaid}</span>}
                  </span>
                </Row>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
