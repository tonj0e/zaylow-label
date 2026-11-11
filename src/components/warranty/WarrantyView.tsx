import React, { useMemo, useState } from 'react';
import { Award, Camera, ChevronLeft, ChevronRight, Phone, Search, ShieldCheck, X } from 'lucide-react';
import { ScannerDisplay } from '../warehouse/ScannerDisplay';
import type { Order } from '../../types';

interface WarrantyViewProps {
  /** Orders the app already holds, so the page opens at once. */
  orders: Order[];
  onNavigateToWarrantyCard?: (order?: Order) => void;
}

type State = 'active' | 'ending' | 'expired' | 'waiting' | 'none';
type Filter = State | 'all';

const DAY = 86400000;
const SOON_DAYS = 30;
const PAGE_SIZE = 7;

const LABEL: Record<State, string> = { active: 'Active', ending: 'Ending soon', expired: 'Expired', waiting: 'Waiting for delivery', none: 'No warranty' };

interface Row {
  order: Order;
  state: State;
  total: number; // days in the warranty
  used: number;
  left: number;
}

const classify = (o: Order): Row => {
  const start = o.warrantyStart ? new Date(o.warrantyStart).getTime() : NaN;
  const end = o.warrantyEnd ? new Date(o.warrantyEnd).getTime() : NaN;
  const hasDates = !Number.isNaN(start) && !Number.isNaN(end);
  const total = hasDates ? Math.max(Math.round((end - start) / DAY), 1) : 0;
  const left = hasDates ? Math.ceil((end - Date.now()) / DAY) : 0;
  const used = hasDates ? Math.min(Math.max(Math.round((Date.now() - start) / DAY), 0), total) : 0;
  let state: State;
  if (!hasDates) state = 'none';
  else if (o.status !== 'Delivered') state = 'waiting';
  else if (left <= 0) state = 'expired';
  else if (left <= SOON_DAYS) state = 'ending';
  else state = 'active';
  return { order: o, state, total, used, left };
};

const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set');

const pillStyle = (s: State): React.CSSProperties =>
  s === 'active' ? { background: 'var(--lime)', color: 'var(--on-lime)' }
  : s === 'ending' ? { background: 'color-mix(in srgb, var(--warn) 17%, transparent)', color: 'var(--warn)' }
  : s === 'expired' ? { background: 'color-mix(in srgb, var(--bad) 15%, transparent)', color: 'var(--bad)' }
  : { background: 'var(--card2)', color: 'var(--ink)' };

const barColor = (s: State) => (s === 'active' ? 'var(--lime)' : s === 'ending' ? 'var(--warn)' : s === 'expired' ? 'var(--bad)' : 'var(--muted)');

const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

export const WarrantyView: React.FC<WarrantyViewProps> = ({ orders, onNavigateToWarrantyCard }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  const rows = useMemo(() => orders.filter((o) => o.status !== 'Cancelled').map(classify).sort((a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime()), [orders]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, active: 0, ending: 0, expired: 0, waiting: 0, none: 0 };
    rows.forEach((r) => { c[r.state] += 1; });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().replace(/^#/, '').toLowerCase();
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      if (filter !== 'all' && r.state !== filter) return false;
      if (!q) return true;
      const o = r.order;
      return o.id.toLowerCase().includes(q) || o.id.toLowerCase().replace('zyl-', '') === q || o.customer.name.toLowerCase().includes(q) || (o.trackingNumber || '').toLowerCase().includes(q) || (digits.length >= 4 && o.customer.phone.replace(/\D/g, '').includes(digits));
    });
  }, [rows, filter, query]);

  const lastPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = rows.find((r) => r.order.id === selectedId) || null;

  const onScan = (text: string) => {
    let v = text.trim();
    try { const p = JSON.parse(v); if (p && typeof p === 'object' && p.id) v = String(p.id); } catch { /* plain text */ }
    setQuery(v); setPage(1); setCamera(false);
  };

  const tiles: { key: State; label: string; note: string }[] = [
    { key: 'active', label: 'Active', note: 'covered right now' },
    { key: 'ending', label: 'Ending soon', note: `within ${SOON_DAYS} days` },
    { key: 'expired', label: 'Expired', note: 'warranty is over' },
    { key: 'waiting', label: 'Waiting for delivery', note: 'starts on delivery' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Warranty</h2>
          <p className="text-sm k-muted mt-1">Find a customer and see if their product is still covered.</p>
        </div>
        {onNavigateToWarrantyCard && <button onClick={() => onNavigateToWarrantyCard()} className="k-btn k-btn-soft px-5 py-3 text-sm"><Award className="w-4 h-4" /> Print warranty cards</button>}
      </header>

      {/* The four numbers that matter, each one a filter */}
      <section className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto md:overflow-visible snap-x scroll-pl-4 -mx-4 px-4 md:mx-0 md:px-0 pb-1 snap-row" aria-label="Warranty summary">
        {tiles.map((t) => {
          const on = filter === t.key;
          return (
            <button key={t.key} onClick={() => { setFilter(on ? 'all' : t.key); setPage(1); }} aria-pressed={on} className="text-left rounded-[24px] p-4 md:p-5 transition-colors max-md:w-40 max-md:shrink-0 snap-start" style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--card)', border: '1px solid var(--line)' }}>
              <span className="block text-4xl font-bold k-display leading-none tabular-nums">{counts[t.key]}</span>
              <span className="block text-sm font-semibold mt-2">{t.label}</span>
              <span className="block text-xs mt-0.5" style={{ opacity: 0.6 }}>{t.note}</span>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_23rem] gap-6 items-start">
        <section className="min-w-0" aria-label="Customers">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Name, phone, order ID or tracking number" aria-label="Search customers" className="k-field" style={{ paddingLeft: '2.4rem' }} />
            </div>
            <button onClick={() => setCamera((v) => !v)} aria-pressed={camera} className="k-btn k-btn-soft px-4 text-sm shrink-0">{camera ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />} {camera ? 'Close' : 'Scan'}</button>
          </div>
          {camera && <div className="mb-3"><ScannerDisplay label="order" onScan={onScan} /></div>}

          <div className="flex gap-2 md:flex-wrap mb-3 max-md:overflow-x-auto max-md:snap-row max-md:-mx-4 max-md:px-4 max-md:pb-1 [&>button]:whitespace-nowrap [&>button]:shrink-0" role="group" aria-label="Filter by warranty">
            <button className="k-chip" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(1); }}>Everyone <span className="ml-1 opacity-70">{counts.all}</span></button>
            {(['active', 'ending', 'expired', 'waiting', 'none'] as State[]).map((s) => <button key={s} className="k-chip" aria-pressed={filter === s} onClick={() => { setFilter(s); setPage(1); }}>{LABEL[s]} <span className="ml-1 opacity-70">{counts[s]}</span></button>)}
          </div>

          <div className="k-card overflow-hidden">
            {pageRows.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <ShieldCheck className="w-8 h-8 mx-auto k-muted mb-2" />
                <p className="font-bold">No customer matches</p>
                <p className="text-sm k-muted mt-1">Check the spelling or number, or switch the filter.</p>
              </div>
            ) : (
              <ul>
                {pageRows.map((r) => {
                  const on = r.order.id === selectedId;
                  return (
                    <li key={r.order.id} className="border-t k-rule first:border-t-0">
                      <button onClick={() => { setSelectedId(on ? null : r.order.id); if (!on) document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-pressed={on} className="k-row w-full text-left px-5 py-3.5" style={on ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0"><span className="block font-bold truncate">{r.order.customer.name}</span><span className="block text-xs k-muted truncate">{r.order.item.productName} · <span className="font-mono">{r.order.id}</span></span></span>
                          <span className="rounded-full px-3 py-1 text-xs font-bold shrink-0" style={pillStyle(r.state)}>{LABEL[r.state]}</span>
                        </span>
                        {r.state !== 'none' && (
                          <span className="flex items-center gap-3 mt-2.5">
                            <span className="flex-1 h-1.5 rounded-full k-track overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(r.state === 'waiting' ? 0 : (r.used / r.total) * 100)}%`, background: barColor(r.state) }} /></span>
                            <span className="text-xs k-muted tabular-nums shrink-0 w-28 text-right">{r.state === 'waiting' ? `${r.total} days to come` : r.left > 0 ? `${r.left} day${r.left === 1 ? '' : 's'} left` : `ended ${day(r.order.warrantyEnd)}`}</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {shown.length > PAGE_SIZE && (
            <nav className="flex items-center justify-between gap-3 flex-wrap mt-4" aria-label="Pages">
              <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, shown.length)} of {shown.length}</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className="k-btn k-btn-ghost w-10 h-10"><ChevronLeft className="w-4 h-4" /></button>
                {pageList(current, lastPage).map((n, i) => n === '…' ? <span key={`gap-${i}`} className="w-6 text-center k-muted" aria-hidden="true">…</span> : <button key={n} onClick={() => setPage(n)} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} className={`k-btn w-10 h-10 text-sm ${n === current ? 'k-btn-ink' : 'k-btn-ghost'}`}>{n}</button>)}
                <button onClick={() => setPage(current + 1)} disabled={current === lastPage} aria-label="Next page" className="k-btn k-btn-ghost w-10 h-10"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </nav>
          )}
        </section>

        {/* The customer you picked */}
        <aside className={`min-w-0 xl:sticky xl:top-28 ${selected ? 'max-xl:order-first' : 'max-md:hidden'}`} aria-label="Customer warranty">
          {!selected ? (
            <div className="k-card2 rounded-[28px] p-6 text-center">
              <ShieldCheck className="w-8 h-8 mx-auto k-muted mb-2" />
              <p className="font-bold">Pick a customer</p>
              <p className="text-sm k-muted mt-1">Their warranty dates and status show here.</p>
            </div>
          ) : (
            <div className="k-card p-6 space-y-5 k-rise" style={{ ['--i' as string]: 0 }} aria-live="polite">
              <div>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={pillStyle(selected.state)}>{LABEL[selected.state]}</span>
                <h3 className="text-2xl font-bold k-display mt-3">{selected.order.customer.name}</h3>
                <p className="text-sm k-muted mt-0.5">{selected.order.item.productName}</p>
              </div>

              {selected.state !== 'none' ? (
                <>
                  <div>
                    <div className="flex items-baseline justify-between text-sm"><span className="k-muted">{day(selected.order.warrantyStart)}</span><span className="k-muted">{day(selected.order.warrantyEnd)}</span></div>
                    <div className="h-2.5 rounded-full k-track overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: `${selected.state === 'waiting' ? 0 : (selected.used / selected.total) * 100}%`, background: barColor(selected.state) }} /></div>
                    <p className="text-sm mt-3">
                      {selected.state === 'waiting' ? <>Starts when the parcel is delivered. Order status: <span className="font-semibold">{selected.order.status}</span>.</>
                        : selected.left > 0 ? <><span className="text-3xl font-bold k-display tabular-nums">{selected.left}</span> <span className="k-muted">days left of {selected.total}</span></>
                        : <>Ended <span className="font-semibold">{day(selected.order.warrantyEnd)}</span>, {Math.abs(selected.left)} days ago.</>}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm k-card2 rounded-2xl px-4 py-3">This order has no warranty saved. If the customer paid for one, add it from All orders: Edit, then Warranty.</p>
              )}

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs k-muted">Order</dt><dd className="font-mono font-semibold">{selected.order.id}</dd></div>
                <div><dt className="text-xs k-muted">Order status</dt><dd className="font-semibold">{selected.order.status}</dd></div>
                <div className="col-span-2"><dt className="text-xs k-muted">Phone</dt><dd className="font-semibold flex items-center gap-2"><Phone className="w-3.5 h-3.5 k-muted" />{selected.order.customer.phone}</dd></div>
              </dl>

              {onNavigateToWarrantyCard && selected.state !== 'none' && (
                <button onClick={() => onNavigateToWarrantyCard(selected.order)} className="k-btn k-btn-lime px-5 py-3 text-sm w-full"><Award className="w-4 h-4" /> Make warranty card</button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
