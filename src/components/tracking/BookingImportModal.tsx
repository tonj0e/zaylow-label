import React, { useMemo, useRef, useState } from 'react';
import { X, FileSpreadsheet, Loader2, Check, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Order, OrderStatus } from '../../types';
import { BulkImporterService } from '../../services/bulkImporter';
import type { ParsedSpreadsheet } from '../../services/bulkImporter';
import { detectColumns, matchBookings, rowsToBookings, looksLikeArticle, findStatusUpdates, classifyStatus } from '../../utils/bookingMatcher';
import type { ColumnPick, MatchResult } from '../../utils/bookingMatcher';

interface Props {
  orders: Order[];
  onClose: () => void;
  onApply: (
    pairs: { id: string; awb: string; status: OrderStatus; next?: OrderStatus; setTracking?: boolean }[],
    onProgress: (done: number, total: number) => void,
  ) => Promise<{ saved: number; failed: string[] }>;
}

type Bucket = 'sure' | 'check' | 'none' | 'status';

const PAGE = 25;
const FIELDS: { key: keyof ColumnPick; label: string; needed?: boolean }[] = [
  { key: 'article', label: 'Article number', needed: true },
  { key: 'name', label: 'Receiver name', needed: true },
  { key: 'pin', label: 'Receiver PIN code', needed: true },
  { key: 'phone', label: 'Receiver mobile (optional)' },
  { key: 'date', label: 'Booking date (optional)' },
  { key: 'status', label: 'India Post status (optional)' },
  { key: 'cod', label: 'COD amount (optional)' },
];

export const BookingImportModal: React.FC<Props> = ({ orders, onClose, onApply }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [cols, setCols] = useState<ColumnPick>({ article: '', name: '', pin: '', phone: '', date: '', status: '', cod: '' });
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [bucket, setBucket] = useState<Bucket>('sure');
  const [page, setPage] = useState(1);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [override, setOverride] = useState<Record<number, string>>({}); // booking row -> chosen order id ('' = skip)
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ saved: number; failed: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const eligible = useMemo(() => orders.filter((o) => o.courier === 'India Post'), [orders]);
  const taken = useMemo(() => new Set(orders.map((o) => (o.trackingNumber || '').toUpperCase()).filter(Boolean)), [orders]);
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const bookings = useMemo(() => (parsed && cols.article ? rowsToBookings(parsed.rows, cols) : []), [parsed, cols]);
  const results: MatchResult[] = useMemo(() => {
    if (!parsed || !cols.article || !cols.name || !cols.pin) return [];
    return matchBookings(bookings, eligible, taken);
  }, [parsed, cols, bookings, eligible, taken]);
  const updates = useMemo(() => (cols.status ? findStatusUpdates(bookings, orders) : []), [bookings, orders, cols.status]);
  const alreadySaved = results.filter((r) => r.note?.includes('already saved')).length;

  // "sure" matches start ticked; everything else waits for a person
  const initialTicks = (list: MatchResult[], ups: { booking: { row: number } }[] = []) =>
    new Set<number>([...list.filter((r) => r.confidence === 'sure').map((r) => r.booking.row), ...ups.map((u) => u.booking.row)]);

  const load = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f); setReading(true); setError(''); setResult(null);
    try {
      const data = await BulkImporterService.parseFile(f);
      const detected = detectColumns(data.headers);
      setParsed(data);
      setCols(detected);
      setOverride({});
      setPage(1);
      setBucket('sure');
      if (detected.article && detected.name && detected.pin) {
        const bk = rowsToBookings(data.rows, detected);
        setTicked(initialTicks(matchBookings(bk, eligible, taken), detected.status ? findStatusUpdates(bk, orders) : []));
      } else setTicked(new Set());
    } catch (e: any) {
      setError(e?.message || 'That file could not be read. Use an .xlsx or .csv download from India Post.');
      setFile(null);
    } finally {
      setReading(false);
    }
  };

  const changeCol = (key: keyof ColumnPick, value: string) => {
    const next = { ...cols, [key]: value };
    setCols(next);
    setOverride({});
    if (parsed && next.article && next.name && next.pin) {
      const bk = rowsToBookings(parsed.rows, next);
      setTicked(initialTicks(matchBookings(bk, eligible, taken), next.status ? findStatusUpdates(bk, orders) : []));
    }
  };

  const chosenOf = (r: MatchResult) => (r.booking.row in override ? override[r.booking.row] : r.chosen || '');
  const counts = { sure: 0, check: 0, none: 0, status: updates.length } as Record<Bucket, number>;
  results.forEach((r) => { if (!r.note?.includes('already saved')) counts[r.confidence] += 1; });

  const list: MatchResult[] = bucket === 'status'
    ? []
    : results.filter((r) => r.confidence === bucket && !r.note?.includes('already saved'));
  const statusList = bucket === 'status' ? updates : [];
  const listLength = bucket === 'status' ? statusList.length : list.length;
  const totalPages = Math.max(1, Math.ceil(listLength / PAGE));
  const current = Math.min(page, totalPages);
  const rows = list.slice((current - 1) * PAGE, current * PAGE);
  const statusRows = statusList.slice((current - 1) * PAGE, current * PAGE);

  // Final pairs: ticked rows with a chosen order; an order is saved once, and an article once.
  const nextFor = (statusText: string | undefined, current: OrderStatus): OrderStatus => {
    const kind = classifyStatus(statusText);
    if (kind === 'delivered') return 'Delivered';
    if (kind === 'returned') return 'Returned';
    return ['Pending', 'Processing', 'Label Generated', 'Printed'].includes(current) ? 'Shipped' : current;
  };
  const pairs = useMemo(() => {
    const seenOrder = new Set<string>();
    const seenArticle = new Set<string>();
    const out: { id: string; awb: string; status: OrderStatus; next: OrderStatus; setTracking: boolean }[] = [];
    results.forEach((r) => {
      if (!ticked.has(r.booking.row) || r.note?.includes('already saved')) return;
      const id = r.booking.row in override ? override[r.booking.row] : r.chosen || '';
      const order = id ? byId.get(id) : undefined;
      if (!order || seenOrder.has(id) || seenArticle.has(r.booking.article)) return;
      seenOrder.add(id); seenArticle.add(r.booking.article);
      out.push({ id, awb: r.booking.article, status: order.status, next: nextFor(r.booking.status, order.status), setTracking: true });
    });
    updates.forEach((u) => {
      if (!ticked.has(u.booking.row) || seenOrder.has(u.order.id)) return;
      seenOrder.add(u.order.id);
      out.push({ id: u.order.id, awb: u.booking.article, status: u.order.status, next: u.next, setTracking: false });
    });
    return out;
  }, [results, updates, ticked, override, byId]);

  const toggle = (row: number) => setTicked((t) => { const n = new Set(t); if (n.has(row)) n.delete(row); else n.add(row); return n; });

  const save = async () => {
    if (!pairs.length || saving) return;
    setSaving({ done: 0, total: pairs.length });
    const res = await onApply(pairs, (done, total) => setSaving({ done, total }));
    setSaving(null);
    setResult(res);
  };

  const ready = !!parsed && !!cols.article && !!cols.name && !!cols.pin;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label="Import India Post bookings" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="k-card w-full max-w-5xl shadow-2xl my-auto k-rise" style={{ ['--i' as string]: 0 }}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h3 className="text-2xl font-bold k-display">Import India Post bookings</h3>
            <p className="text-sm k-muted mt-1">Download your list from <strong>My Booking</strong> on the India Post site, then drop it here. Each booking is matched to an order by name and PIN code, and nothing is saved until you press Save.</p>
          </div>
          <button onClick={onClose} disabled={!!saving} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <p role="alert" className="text-sm font-medium flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 k-bad" /> {error}</p>}

          {result ? (
            <div className="text-center py-10">
              <span className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'color-mix(in srgb, var(--lime) 18%, var(--card2))' }}><Check className="w-7 h-7 k-lime-text" /></span>
              <h4 className="text-2xl font-bold k-display">{result.saved.toLocaleString('en-IN')} orders updated</h4>
              {result.failed.length > 0 && <p className="text-sm k-warn mt-2">{result.failed.length} could not be saved: {result.failed.slice(0, 6).join(', ')}{result.failed.length > 6 ? '…' : ''}</p>}
              <p className="text-sm k-muted mt-2">Orders with a new tracking number are under “On the way” or “Delivered”. Use the WhatsApp button to tell each customer.</p>
              <button onClick={onClose} className="k-btn k-btn-ink px-7 py-3 text-sm mt-6">Done</button>
            </div>
          ) : !parsed ? (
            <div
              className="rounded-2xl text-center px-6 py-14 transition-colors"
              style={{ border: `2px dashed ${dragging ? 'var(--ink)' : 'var(--line)'}`, background: dragging ? 'var(--card2)' : undefined }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files?.[0]); }}
            >
              <span className="w-16 h-16 rounded-3xl k-card2 mx-auto flex items-center justify-center mb-4">{reading ? <Loader2 className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}</span>
              <p className="text-xl font-bold k-display">{reading ? 'Reading the file…' : 'Drop the My Booking download here'}</p>
              <p className="text-sm k-muted mt-1">.xlsx, .xls or .csv</p>
              <button onClick={() => input.current?.click()} disabled={reading} className="k-btn k-btn-ink px-7 py-3 text-sm mt-5">Choose a file</button>
              <input ref={input} type="file" accept=".csv,.xlsx,.xls" className="hidden" aria-label="Choose the My Booking file" onChange={(e) => load(e.target.files?.[0])} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm"><span className="font-semibold">{file?.name}</span> <span className="k-muted">· {parsed.totalRows.toLocaleString('en-IN')} bookings</span></p>
                <button onClick={() => { setParsed(null); setFile(null); setTicked(new Set()); setOverride({}); }} className="text-sm font-semibold underline">Choose a different file</button>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Which column is which?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="k-label">{f.label}</span>
                      <select className="k-field" style={{ padding: '.5rem .8rem', borderRadius: 12 }} value={cols[f.key]} onChange={(e) => changeCol(f.key, e.target.value)}>
                        <option value="">{f.needed ? 'Choose a column' : 'Not in the file'}</option>
                        {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {!ready && <p className="text-sm k-warn mt-3">Choose the article number, receiver name and PIN code columns to find matches.</p>}
              </div>

              {ready && (
                <>
                  <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {([['sure', 'New tracking numbers', 'sure matches, ticked'], ['check', 'Please check', 'pick the right order'], ['none', 'No match', 'no order found'], ['status', 'Delivery updates', 'delivered or returned']] as const).map(([id, label, hint]) => (
                      <li key={id}>
                        <button onClick={() => { setBucket(id); setPage(1); }} aria-pressed={bucket === id} className="w-full text-left k-card p-4" style={{ borderColor: bucket === id ? 'var(--ink)' : undefined }}>
                          <p className="text-xs k-muted">{label}</p>
                          <p className="text-3xl font-bold k-display leading-none mt-1.5">{counts[id].toLocaleString('en-IN')}</p>
                          <p className="text-xs k-muted mt-1">{hint}</p>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="rounded-2xl overflow-hidden border k-rule">
                    {bucket === 'status' ? (
                      statusRows.length === 0 ? <p className="p-10 text-center text-sm k-muted">No parcel needs a status change. {cols.status ? '' : 'Choose the India Post status column above to see delivery updates.'}</p> : (
                        <ul>
                          {statusRows.map((u) => {
                            const on = ticked.has(u.booking.row);
                            return (
                              <li key={u.booking.row} className="px-4 py-3 border-t k-rule first:border-t-0 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: on ? 'var(--card2)' : undefined }}>
                                <input type="checkbox" checked={on} onChange={() => toggle(u.booking.row)} aria-label={`Mark ${u.order.id} ${u.next}`} className="w-4 h-4" style={{ accentColor: 'var(--lime)' }} />
                                <div className="min-w-0 basis-[13rem] flex-1">
                                  <p className="font-mono text-sm font-semibold">{u.booking.article}</p>
                                  <p className="text-xs k-muted truncate">India Post: {u.booking.status}</p>
                                </div>
                                <p className="text-sm flex-1 basis-[16rem] min-w-0 truncate"><span className="font-semibold">{u.order.customer.name}</span> <span className="k-muted">· {u.order.id} · now {u.order.status}</span></p>
                                <span className="text-xs font-bold rounded-full px-3 py-1 k-card2">{u.next === 'Delivered' ? 'Mark Delivered' : 'Mark Returned'}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )
                    ) : rows.length === 0 ? <p className="p-10 text-center text-sm k-muted">Nothing in this list.</p> : (
                      <ul>
                        {rows.map((r) => {
                          const chosen = chosenOf(r);
                          const order = chosen ? byId.get(chosen) : undefined;
                          const on = ticked.has(r.booking.row) && !!order;
                          return (
                            <li key={r.booking.row} className="px-4 py-3 border-t k-rule first:border-t-0 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: on ? 'var(--card2)' : undefined }}>
                              {r.confidence !== 'none' && (
                                <input type="checkbox" checked={on} disabled={!order} onChange={() => toggle(r.booking.row)} aria-label={`Save article ${r.booking.article}`} className="w-4 h-4" style={{ accentColor: 'var(--lime)' }} />
                              )}
                              <div className="min-w-0 basis-[13rem] flex-1">
                                <p className="font-mono text-sm font-semibold">{r.booking.article || '—'}{r.booking.status ? <span className="font-sans font-normal text-xs k-muted"> · {r.booking.status}</span> : null}</p>
                                {r.booking.article && !looksLikeArticle(r.booking.article) && <p className="text-xs k-warn">Unusual number format</p>}
                                <p className="text-xs k-muted truncate">{r.booking.name} · {r.booking.pin}{r.booking.date ? ` · ${r.booking.date}` : ''}</p>
                              </div>
                              {r.confidence === 'none' ? (
                                <p className="text-sm k-muted flex-1 basis-[14rem]">{r.note}</p>
                              ) : (
                                <div className="flex-1 basis-[18rem] min-w-0">
                                  {r.confidence === 'check' && r.candidates.length > 0 ? (
                                    <select className="k-field" style={{ padding: '.45rem .8rem', borderRadius: 12, fontSize: '.85rem' }} value={chosen} onChange={(e) => { setOverride((o) => ({ ...o, [r.booking.row]: e.target.value })); setTicked((t) => { const n = new Set(t); if (e.target.value) n.add(r.booking.row); else n.delete(r.booking.row); return n; }); }} aria-label="Which order is this booking for">
                                      <option value="">Skip this booking</option>
                                      {r.candidates.map((c) => { const o = byId.get(c.orderId); return o ? <option key={c.orderId} value={c.orderId}>{o.customer.name} · {o.id} · {o.customer.city} ({c.reasons.join(', ')})</option> : null; })}
                                    </select>
                                  ) : order ? (
                                    <p className="text-sm truncate"><span className="font-semibold">{order.customer.name}</span> <span className="k-muted">· {order.id} · {order.customer.city} · {order.status}</span></p>
                                  ) : null}
                                  {r.note && <p className="text-xs k-warn mt-1">{r.note}</p>}
                                  {r.confidence === 'sure' && r.candidates[0] && <p className="text-xs k-muted mt-1">{r.candidates[0].reasons.join(', ')}</p>}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {listLength > PAGE && (
                      <div className="px-4 py-3 border-t k-rule flex items-center justify-between text-sm">
                        <span className="k-muted">{(current - 1) * PAGE + 1}–{Math.min(current * PAGE, listLength)} of {listLength.toLocaleString('en-IN')}</span>
                        <div className="flex gap-2">
                          <button disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page" className="k-btn k-btn-ghost w-9 h-9"><ChevronLeft className="w-4 h-4" /></button>
                          <button disabled={current === totalPages} onClick={() => setPage(current + 1)} aria-label="Next page" className="k-btn k-btn-ghost w-9 h-9"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {parsed && !result && (
          <div className="px-6 pb-6 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm k-muted">{saving ? `Saving ${saving.done} of ${saving.total}…` : `${pairs.filter((p) => p.setTracking).length.toLocaleString('en-IN')} tracking numbers and ${pairs.filter((p) => p.next === 'Delivered').length.toLocaleString('en-IN')} deliveries will be saved${alreadySaved ? ` (${alreadySaved} articles were already saved)` : ''}.`}</p>
            <div className="flex gap-3">
              <button onClick={onClose} disabled={!!saving} className="k-btn k-btn-ghost px-5 py-3 text-sm">Cancel</button>
              <button onClick={save} disabled={!pairs.length || !!saving} className="k-btn k-btn-lime px-6 py-3 text-sm">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : `Save ${pairs.length.toLocaleString('en-IN')} changes`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
