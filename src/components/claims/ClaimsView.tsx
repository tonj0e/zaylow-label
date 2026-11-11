import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { OrderLookup } from '../common/OrderLookup';
import type { Order } from '../../types';

interface ClaimsViewProps {
  /** Orders the app already holds, so the page opens at once. */
  orders: Order[];
  onRefreshOrders: () => Promise<void> | void;
}

type ClaimStatus = 'Open' | 'In review' | 'Approved' | 'Rejected' | 'Resolved';
const STATUSES: ClaimStatus[] = ['Open', 'In review', 'Approved', 'Rejected', 'Resolved'];
const REASONS = ['Not working', 'Damaged in transit', 'Wrong product', 'Missing parts', 'Stopped charging', 'Other'];
const PAGE_SIZE = 6;

/** The next sensible steps from each status, so you tap a button instead of picking from a menu. */
const NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  Open: ['In review', 'Rejected'],
  'In review': ['Approved', 'Rejected'],
  Approved: ['Resolved'],
  Rejected: ['In review'],
  Resolved: [],
};

const statusOf = (o: Order): ClaimStatus => (STATUSES.find((s) => s.toLowerCase() === (o.claimStatus || '').trim().toLowerCase()) ?? 'Open');
const isClaim = (o: Order) => o.status === 'Claims' || !!(o.claimStatus || o.claimReason || o.claimDate);

const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const pill = (s: ClaimStatus): React.CSSProperties =>
  s === 'Approved' || s === 'Resolved' ? { background: 'var(--lime)', color: 'var(--on-lime)' }
  : s === 'Rejected' ? { background: 'color-mix(in srgb, var(--bad) 15%, transparent)', color: 'var(--bad)' }
  : s === 'In review' ? { background: 'color-mix(in srgb, var(--warn) 17%, transparent)', color: 'var(--warn)' }
  : { background: 'var(--card2)', color: 'var(--ink)' };

const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

const warranty = (o: Order) => {
  if (!o.warrantyEnd) return null;
  const left = Math.ceil((new Date(o.warrantyEnd).getTime() - Date.now()) / 86400000);
  return left > 0 ? { covered: true, text: `Under warranty, ${left} day${left === 1 ? '' : 's'} left` } : { covered: false, text: `Warranty ended ${day(o.warrantyEnd)}` };
};

export const ClaimsView: React.FC<ClaimsViewProps> = ({ orders, onRefreshOrders }) => {
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [found, setFound] = useState<Order | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const claims = useMemo(() => orders.filter(isClaim).sort((a, b) => new Date(b.claimDate || b.createdAt).getTime() - new Date(a.claimDate || a.createdAt).getTime()), [orders]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: claims.length };
    STATUSES.forEach((s) => { c[s] = 0; });
    claims.forEach((o) => { c[statusOf(o)] += 1; });
    return c;
  }, [claims]);

  const shown = useMemo(() => (filter === 'all' ? claims : claims.filter((o) => statusOf(o) === filter)), [claims, filter]);
  const lastPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const move = async (o: Order, next: ClaimStatus) => {
    setBusyId(o.id); setNote(null);
    const ok = await DataService.updateClaim(o.id, { status: next, ...(o.claimDate ? {} : { date: new Date().toISOString() }) });
    if (ok) await onRefreshOrders();
    else setNote({ ok: false, text: `Could not update ${o.id}. Check your connection and try again.` });
    setBusyId(null);
  };

  const open = async () => {
    if (!found) return;
    setOpening(true); setNote(null);
    const ok = await DataService.updateClaim(found.id, { status: 'Open', reason, date: new Date().toISOString(), markOrder: true });
    if (ok) {
      await onRefreshOrders();
      setNote({ ok: true, text: `Claim opened for ${found.customer.name} (${found.id}).` });
      setFound(null); setFilter('all'); setPage(1);
    } else setNote({ ok: false, text: 'Could not open the claim. Check your connection and try again.' });
    setOpening(false);
  };

  const alreadyClaim = found ? isClaim(found) : false;
  const foundWarranty = found ? warranty(found) : null;
  const chips: { key: ClaimStatus | 'all'; label: string }[] = [{ key: 'all', label: 'All' }, ...STATUSES.map((s) => ({ key: s as ClaimStatus | 'all', label: s }))];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Claims</h2>
          <p className="text-sm k-muted mt-1">Customers who say their product has a problem. Move each claim along until it is resolved.</p>
        </div>
        <div className="flex gap-6">
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{counts.Open + counts['In review']}</p><p className="text-xs k-muted mt-1">need action</p></div>
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{counts.Resolved + counts.Approved}</p><p className="text-xs k-muted mt-1">approved or resolved</p></div>
        </div>
      </header>

      {note && <p role={note.ok ? 'status' : 'alert'} className="text-sm font-medium flex items-center gap-2" style={note.ok ? undefined : { color: 'var(--bad)' }}>{note.ok && <Check className="w-4 h-4 k-lime-text" />}{note.text}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
        {/* Claims list */}
        <section className="min-w-0" aria-label="Claims">
          <div className="flex gap-2 flex-wrap mb-3" role="group" aria-label="Filter claims">
            {chips.map((c) => <button key={c.key} className="k-chip" aria-pressed={filter === c.key} onClick={() => { setFilter(c.key); setPage(1); }}>{c.label} <span className="ml-1 opacity-70">{counts[c.key]}</span></button>)}
          </div>

          <div className="k-card overflow-hidden">
            {rows.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <ShieldCheck className="w-8 h-8 mx-auto k-muted mb-2" />
                <p className="font-bold">{claims.length === 0 ? 'No claims yet' : 'No claims here'}</p>
                <p className="text-sm k-muted mt-1">{claims.length === 0 ? 'When a customer reports a problem, find their order on the right and open a claim.' : 'Try another filter.'}</p>
              </div>
            ) : (
              <ul>
                {rows.map((o) => {
                  const st = statusOf(o);
                  const w = warranty(o);
                  return (
                    <li key={o.id} className="k-row border-t k-rule first:border-t-0 px-5 py-4">
                      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold truncate">{o.customer.name}</p>
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={pill(st)}>{st}</span>
                          </div>
                          <p className="text-sm k-muted truncate">{o.item.productName} · <span className="font-mono">{o.id}</span></p>
                          <p className="text-sm mt-1.5">{o.claimReason || o.returnReason || 'No reason written'}</p>
                          <p className="text-xs k-muted mt-1 flex items-center gap-1.5 flex-wrap">
                            {o.claimDate && <span>Opened {day(o.claimDate)}</span>}
                            {w && <span className="inline-flex items-center gap-1" style={w.covered ? { color: 'var(--lime-text)' } : undefined}>{o.claimDate && '·'} {w.covered ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />} {w.text}</span>}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap shrink-0">
                          {NEXT[st].map((n) => (
                            <button key={n} onClick={() => void move(o, n)} disabled={busyId === o.id} className={`k-btn px-4 py-2 text-sm ${n === 'Approved' || n === 'Resolved' ? 'k-btn-outline-green' : 'k-btn-soft'}`}>
                              {busyId === o.id && <Loader2 className="w-4 h-4 animate-spin" />}{st === 'Rejected' ? 'Reopen' : ({ 'In review': 'Start review', Approved: 'Approve', Rejected: 'Reject', Resolved: 'Mark resolved', Open: 'Reopen' } as Record<ClaimStatus, string>)[n]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {shown.length > PAGE_SIZE && (
            <nav className="flex items-center justify-between gap-3 flex-wrap mt-4" aria-label="Claim pages">
              <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, shown.length)} of {shown.length}</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className="k-btn k-btn-ghost w-10 h-10"><ChevronLeft className="w-4 h-4" /></button>
                {pageList(current, lastPage).map((n, i) => n === '…'
                  ? <span key={`gap-${i}`} className="w-6 text-center k-muted" aria-hidden="true">…</span>
                  : <button key={n} onClick={() => setPage(n)} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} className={`k-btn w-10 h-10 text-sm ${n === current ? 'k-btn-ink' : 'k-btn-ghost'}`}>{n}</button>)}
                <button onClick={() => setPage(current + 1)} disabled={current === lastPage} aria-label="Next page" className="k-btn k-btn-ghost w-10 h-10"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </nav>
          )}
        </section>

        {/* Open a claim */}
        <aside className="space-y-3 min-w-0 xl:sticky xl:top-28" aria-label="Open a claim">
          <h3 className="font-bold k-display px-1">Open a claim</h3>
          <OrderLookup buttonLabel="Find order" onFound={(o) => { setFound(o); setNote(null); }} />
          {found && (
            <div className="k-card p-5 space-y-4 k-rise" style={{ ['--i' as string]: 0 }}>
              <div>
                <p className="text-lg font-bold k-display">{found.customer.name}</p>
                <p className="text-sm k-muted">{found.item.productName} · <span className="font-mono">{found.id}</span></p>
                {foundWarranty && <p className="text-sm mt-2 flex items-center gap-1.5" style={foundWarranty.covered ? { color: 'var(--lime-text)' } : undefined}>{foundWarranty.covered ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}{foundWarranty.text}</p>}
                {!foundWarranty && <p className="text-sm k-muted mt-2">No warranty on this order.</p>}
              </div>
              {alreadyClaim ? (
                <p className="text-sm k-card2 rounded-2xl px-4 py-3">This order already has a claim ({statusOf(found)}). Find it in the list.</p>
              ) : (
                <>
                  <div>
                    <p className="k-label">What is wrong?</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Claim reason">
                      {REASONS.map((r) => <button key={r} type="button" className="k-chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
                    </div>
                  </div>
                  <button onClick={() => void open()} disabled={opening} className="k-btn k-btn-lime px-6 py-3 text-sm">{opening && <Loader2 className="w-4 h-4 animate-spin" />} Open claim</button>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
