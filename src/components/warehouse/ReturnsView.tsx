import React, { useCallback, useMemo, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, PackageCheck, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { ScannerDisplay } from './ScannerDisplay';
import { DataService } from '../../services/dataService';
import { supabase } from '../../services/supabase';
import { useCached } from '../../hooks/useCached';
import { CACHE } from '../../services/prefetch';

type ReturnItem = {
  id: number;
  order_id: string;
  customer: string;
  mobile?: string;
  product: string;
  product_id?: string;
  return_reason: string;
  courier?: string;
  tracking_id?: string;
  status: string;
  date_received: string;
  week_label?: string;
  created_at?: string;
};

const anySupabase = supabase as any;

const RETURN_REASONS = [
  'Customer Return',
  'Damaged in Transit',
  'Wrong Product Delivered',
  'Product Defective',
  'Customer Refused Delivery',
  'Address Not Found',
  'Other',
];

type Filter = 'all' | 'waiting' | 'restocked' | 'written-off';
const FILTERS: { key: Filter; label: string; status: string }[] = [
  { key: 'all', label: 'Everything', status: '' },
  { key: 'waiting', label: 'Waiting for check', status: 'Pending Inspection' },
  { key: 'restocked', label: 'Back in stock', status: 'Restocked' },
  { key: 'written-off', label: 'Written off', status: 'Rejected' },
];

const weekLabel = (date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const PAGE_SIZE = 5;

/** 1 2 3 … 7: always the first and last page, plus the pages next to the current one. */
const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

const niceDay = (v: string) => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** A QR may hold plain text or JSON like {"id":"ZYL-1"}. */
const readScanned = (text: string): string => {
  try { const p = JSON.parse(text); if (p && typeof p === 'object' && p.id) return String(p.id); } catch { /* plain text */ }
  return text.trim();
};

export const ReturnsView = () => {
  const returnsC = useCached<ReturnItem[]>(CACHE.returns.key, CACHE.returns.fetch);
  const list = useMemo(() => returnsC.data ?? [], [returnsC.data]);
  const loadingList = returnsC.loading;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [found, setFound] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [logging, setLogging] = useState(false);
  const [camera, setCamera] = useState(false);
  const [note, setNote] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<{ id: number; action: 'restock' | 'writeoff' } | null>(null);
  const [working, setWorking] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => { try { await returnsC.refresh(); } catch (err) { console.error(err); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const search = useCallback(async (raw: string) => {
    const value = readScanned(raw);
    if (!value) return;
    setSearching(true); setFound(null); setNote(null);
    try {
      const orders = await DataService.getOrders();
      const q = value.replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
      const withPrefix = q.startsWith('zyl-') ? q : `zyl-${q}`;
      const order = orders.find((o) => {
        const id = (o.id || '').toLowerCase();
        return id === q || id === withPrefix || id.replace(/^zyl-/, '') === q || (o.trackingNumber || '').replace(/\s+/g, '').toLowerCase() === q;
      });
      if (!order) setNote({ kind: 'error', text: `No order matches "${value}". Use the order ID from the label, like ZYL-406419, or the tracking number.` });
      else {
        // Only block when this parcel is really logged here already. The order status alone is not enough:
        // India Post tracking marks an order "Returned" before the parcel reaches the warehouse.
        const { data: rows, error } = await anySupabase.from('returns').select('status, date_received').eq('order_id', order.id).order('id', { ascending: false }).limit(1);
        if (error) throw error;
        const prev = (rows || [])[0] as { status: string; date_received: string } | undefined;
        if (prev) {
          const where = prev.status === 'Pending Inspection' ? 'is already in the list below, waiting for a check' : prev.status === 'Restocked' ? 'was already logged and put back in stock' : 'was already logged and written off';
          setNote({ kind: 'error', text: `${order.id} ${where} (${niceDay(prev.date_received)}).` });
        } else setFound(order);
      }
    } catch {
      setNote({ kind: 'error', text: 'Could not load orders. Check your connection and try again.' });
    } finally {
      setSearching(false);
    }
  }, []);

  const onScan = useCallback((text: string) => {
    const v = readScanned(text);
    setQuery(v); setCamera(false);
    void search(v);
  }, [search]);

  const logReturn = async () => {
    if (!found) return;
    setLogging(true); setNote(null);
    try {
      const now = new Date();
      const { error } = await anySupabase.from('returns').insert({
        order_id: found.id,
        customer: found.customer.name,
        mobile: found.customer.phone,
        product: found.item.productName,
        product_id: found.item.sku,
        return_reason: reason,
        courier: found.courier,
        tracking_id: found.trackingNumber || '',
        status: 'Pending Inspection',
        date_received: now.toISOString().split('T')[0],
        week_label: weekLabel(now),
      });
      if (error) throw error;
      await DataService.updateOrderStatus(found.id, 'Claims');
      setNote({ kind: 'success', text: `Return saved for ${found.customer.name} (${found.id}). It is waiting for a check.` });
      setQuery(''); setFound(null); setFilter('waiting');
      await load();
    } catch (err: any) {
      setNote({ kind: 'error', text: `Could not save the return. ${err?.message || ''}`.trim() });
    } finally {
      setLogging(false);
    }
  };

  const decide = async (ret: ReturnItem, action: 'restock' | 'writeoff') => {
    setWorking(true); setNote(null);
    try {
      await DataService.releaseProductsForOrder(ret.order_id, action === 'restock' ? 'In Stock' : 'Damaged');
      await DataService.updateOrderStatus(ret.order_id, 'Returned');
      const { error } = await anySupabase.from('returns').update({ status: action === 'restock' ? 'Restocked' : 'Rejected' }).eq('id', ret.id);
      if (error) throw error;
      setConfirming(null);
      await load();
    } catch (err: any) {
      setNote({ kind: 'error', text: `Could not update ${ret.order_id}. ${err?.message || ''}`.trim() });
    } finally {
      setWorking(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: list.length, waiting: 0, restocked: 0, 'written-off': 0 };
    list.forEach((r) => { const f = FILTERS.find((x) => x.status && x.status === r.status); if (f) c[f.key] += 1; });
    return c;
  }, [list]);

  const shown = useMemo(() => {
    if (filter === 'all') {
      // waiting parcels first: they are the ones that need a decision
      return [...list].sort((a, b) => Number(b.status === 'Pending Inspection') - Number(a.status === 'Pending Inspection'));
    }
    const status = FILTERS.find((f) => f.key === filter)!.status;
    return list.filter((r) => r.status === status);
  }, [list, filter]);

  const lastPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((r) => m.set(r.return_reason, (m.get(r.return_reason) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  const week = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return list.filter((r) => new Date(r.date_received).getTime() >= cutoff).length;
  }, [list]);

  const decided = counts.restocked + counts['written-off'];
  const restockRate = decided > 0 ? Math.round((counts.restocked / decided) * 100) : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold k-display">Returns</h2>
          <p className="text-sm k-muted mt-1">Log a parcel that came back, check it, then put it back in stock or write it off.</p>
        </div>
        <button onClick={() => void load()} aria-label="Refresh returns" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><RefreshCw className="w-4 h-4" /></button>
      </header>

      {/* Intake: one wide panel, steps run left to right */}
      <section className="k-card p-5 sm:p-6" aria-label="Log a return">
        <form onSubmit={(e) => { e.preventDefault(); void search(query); }}>
          <label htmlFor="return-search" className="k-label">Which parcel came back? Order ID or tracking number</label>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input id="return-search" value={query} onChange={(e) => { setQuery(e.target.value); setFound(null); if (note) setNote(null); }} placeholder="e.g. ZYL-406419 or CL431677163IN" autoComplete="off" className="k-field font-mono" />
            <button type="button" onClick={() => setCamera((v) => !v)} aria-pressed={camera} className="k-btn k-btn-soft px-4 text-sm shrink-0">
              {camera ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />} {camera ? 'Close camera' : 'Scan'}
            </button>
            <button type="submit" disabled={!query.trim() || searching} className="k-btn k-btn-lime px-5 py-3 text-sm shrink-0">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find order
            </button>
          </div>
        </form>

        {camera && <div className="mt-4"><ScannerDisplay label="order label" onScan={onScan} /></div>}

        {note && (
          <p role={note.kind === 'error' ? 'alert' : 'status'} className="text-sm font-medium mt-4 flex items-start gap-2" style={note.kind === 'error' ? { color: 'var(--bad)' } : undefined}>
            {note.kind === 'success' && <Check className="w-4 h-4 mt-0.5 shrink-0 k-lime-text" />}
            {note.text}
          </p>
        )}

        {found && (
          <div className="mt-5 grid md:grid-cols-[1.2fr_1fr] gap-5 k-rise" style={{ ['--i' as string]: 0 }}>
            <div className="k-card2 rounded-2xl p-4">
              <p className="text-lg font-bold k-display">{found.customer.name}</p>
              <p className="text-sm k-muted">{found.customer.phone}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2"><dt className="text-xs k-muted">Product</dt><dd className="font-semibold">{found.item.productName}</dd></div>
                <div><dt className="text-xs k-muted">Order</dt><dd className="font-mono font-semibold">{found.id}</dd></div>
                <div><dt className="text-xs k-muted">Payment</dt><dd className="font-semibold">{found.paymentType}{found.paymentType === 'COD' ? ` ₹${found.codAmount}` : ''}</dd></div>
              </dl>
            </div>
            <div className="flex flex-col">
              <p className="k-label">Why did it come back?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Return reason">
                {RETURN_REASONS.map((r) => (
                  <button key={r} type="button" className="k-chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <button onClick={() => void logReturn()} disabled={logging} className="k-btn k-btn-lime px-6 py-3 text-sm self-start" style={{ marginTop: "1rem" }}>
                {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Save return
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
        {/* Returns list */}
        <section aria-label="Returns" className="min-w-0">
          <div className="flex gap-2 flex-wrap mb-3" role="group" aria-label="Filter returns">
            {FILTERS.map((f) => (
              <button key={f.key} aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setPage(1); setConfirming(null); }} className="k-chip">
                {f.label} <span className="ml-1 opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <div className="k-card overflow-hidden">
            {loadingList ? (
              <div className="p-4 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="k-skel h-14 rounded-2xl animate-pulse" />)}</div>
            ) : shown.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <PackageCheck className="w-8 h-8 mx-auto k-muted mb-2" />
                <p className="font-bold">{filter === 'waiting' ? 'Nothing waiting for a check' : filter === 'restocked' ? 'Nothing restocked yet' : filter === 'written-off' ? 'Nothing written off' : 'No returns yet'}</p>
                <p className="text-sm k-muted mt-1">{filter === 'waiting' ? 'When a parcel comes back, find it above and save the return.' : 'Returns you log show up here.'}</p>
              </div>
            ) : (
              <ul>
                {pageRows.map((r) => {
                  const asking = confirming?.id === r.id ? confirming.action : null;
                  return (
                    <li key={r.id} className="k-row border-t k-rule first:border-t-0 px-4 sm:px-5 py-4">
                      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                        <div className="w-14 shrink-0 text-sm font-semibold k-muted pt-0.5">{niceDay(r.date_received)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{r.customer}</p>
                          <p className="text-sm k-muted truncate">{r.product}</p>
                          <p className="text-xs k-muted mt-1"><span className="font-mono">{r.order_id}</span> · {r.return_reason}</p>
                        </div>
                        {r.status === 'Pending Inspection' && !asking && (
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setConfirming({ id: r.id, action: 'restock' })} className="k-btn k-btn-outline-green px-4 py-2 text-sm"><Check className="w-4 h-4" /> Restock</button>
                            <button onClick={() => setConfirming({ id: r.id, action: 'writeoff' })} className="k-btn k-btn-soft px-4 py-2 text-sm">Write off</button>
                          </div>
                        )}
                        {r.status !== 'Pending Inspection' && (
                          <span className="rounded-full px-3 py-1 text-xs font-bold shrink-0" style={r.status === 'Restocked' ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { background: 'var(--card2)' }}>
                            {r.status === 'Restocked' ? 'Back in stock' : 'Written off'}
                          </span>
                        )}
                      </div>

                      {asking && (
                        <div className="mt-3 ml-0 sm:ml-[4.5rem] k-card2 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-sm">
                            {asking === 'restock' ? 'Put this product back in stock?' : 'Write off this product as damaged? It will not return to stock.'}
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setConfirming(null)} className="k-btn k-btn-ghost px-4 py-2 text-sm">Cancel</button>
                            <button onClick={() => void decide(r, asking)} disabled={working} className={`k-btn px-4 py-2 text-sm ${asking === 'restock' ? 'k-btn-lime' : 'k-btn-ink'}`}>
                              {working && <Loader2 className="w-4 h-4 animate-spin" />} {asking === 'restock' ? 'Yes, restock' : 'Yes, write off'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {shown.length > PAGE_SIZE && (
            <nav className="flex items-center justify-between gap-3 flex-wrap mt-4" aria-label="Returns pages">
              <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, shown.length)} of {shown.length}</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { setPage(current - 1); setConfirming(null); }} disabled={current === 1} aria-label="Previous page" className="k-btn k-btn-ghost w-10 h-10"><ChevronLeft className="w-4 h-4" /></button>
                {pageList(current, lastPage).map((n, i) => n === '…'
                  ? <span key={`gap-${i}`} className="w-6 text-center k-muted" aria-hidden="true">…</span>
                  : <button key={n} onClick={() => { setPage(n); setConfirming(null); }} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} className={`k-btn w-10 h-10 text-sm ${n === current ? 'k-btn-ink' : 'k-btn-ghost'}`}>{n}</button>)}
                <button onClick={() => { setPage(current + 1); setConfirming(null); }} disabled={current === lastPage} aria-label="Next page" className="k-btn k-btn-ghost w-10 h-10"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </nav>
          )}
        </section>

        {/* Side panel: the numbers that explain the list */}
        <aside className="space-y-4 xl:sticky xl:top-28" aria-label="Returns at a glance">
          <div className="k-card p-5">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-3xl font-bold k-display leading-none">{counts.waiting}</p><p className="text-xs k-muted mt-1.5">waiting for a check</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{week}</p><p className="text-xs k-muted mt-1.5">came back in 7 days</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{counts.all}</p><p className="text-xs k-muted mt-1.5">returns in total</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{restockRate === null ? '–' : `${restockRate}%`}</p><p className="text-xs k-muted mt-1.5">went back in stock</p></div>
            </div>
          </div>

          <div className="k-card p-5">
            <h3 className="font-bold k-display">Why parcels come back</h3>
            {reasons.length === 0 ? (
              <p className="text-sm k-muted mt-3">Reasons show here after you log a return.</p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {reasons.map(([name, n]) => (
                  <li key={name}>
                    <div className="flex justify-between gap-3 text-sm"><span className="truncate">{name}</span><span className="font-bold tabular-nums">{n}</span></div>
                    <div className="h-1.5 rounded-full k-track mt-1.5 overflow-hidden"><div className="h-full rounded-full k-bar" style={{ width: `${(n / reasons[0][1]) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="k-card p-5">
            <h3 className="font-bold k-display">How a return works</h3>
            <ol className="mt-3 space-y-2.5 text-sm">
              <li className="flex gap-3"><span className="font-bold w-4">1</span><span><span className="font-semibold">Find the order</span> <span className="k-muted">and pick a reason.</span></span></li>
              <li className="flex gap-3"><span className="font-bold w-4">2</span><span><span className="font-semibold">Check the parcel</span> <span className="k-muted">when it arrives.</span></span></li>
              <li className="flex gap-3"><span className="font-bold w-4">3</span><span><span className="font-semibold">Restock or write off.</span> <span className="k-muted">Restock puts it back in inventory.</span></span></li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
};
