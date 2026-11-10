import React, { useDeferredValue, useMemo, useState } from 'react';
import type { Order, PrintQueueItem, CompanySettings } from '../../types';
import { Printer, Trash2, Play, Layers, Download, Search, Eye } from 'lucide-react';
import { useLabelDownload } from '../../hooks/useLabelDownload';

interface PrintQueueViewProps {
  queue: PrintQueueItem[];
  allOrders: Order[];
  settings: CompanySettings;
  onClearQueue: () => void;
  onNavigateToGenerator: (order: Order) => void;
  onPrintBulkOrders?: (orders: Order[]) => void;
}

const HISTORY_STEP = 40;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const dayLabel = (iso?: string) => {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const PrintQueueView: React.FC<PrintQueueViewProps> = ({ queue, allOrders, settings, onClearQueue, onNavigateToGenerator, onPrintBulkOrders }) => {
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(HISTORY_STEP);
  const q = useDeferredValue(search.trim().toLowerCase());
  const { download, downloadingId, overlay } = useLabelDownload(settings);

  const history = useMemo(() => {
    const list = allOrders
      .filter((o) => o.status === 'Printed' || o.status === 'Shipped')
      .filter((o) => !q || [o.id, o.customer.name, o.customer.city, o.customer.phone, o.trackingNumber || ''].some((f) => (f || '').toLowerCase().includes(q)));
    return list.sort((a, b) => new Date(b.printedAt || b.createdAt).getTime() - new Date(a.printedAt || a.createdAt).getTime());
  }, [allOrders, q]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: Order[] }[] = [];
    history.slice(0, shown).forEach((o) => {
      const label = dayLabel(o.printedAt || o.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(o);
      else groups.push({ label, items: [o] });
    });
    return groups;
  }, [history, shown]);

  const summary = useMemo(() => {
    const cod = queue.filter((i) => i.order.paymentType === 'COD');
    const byCourier: Record<string, number> = {};
    queue.forEach((i) => { byCourier[i.order.courier] = (byCourier[i.order.courier] || 0) + 1; });
    return {
      cod: cod.length,
      prepaid: queue.length - cod.length,
      codTotal: cod.reduce((s, i) => s + i.order.codAmount, 0),
      couriers: Object.entries(byCourier).sort((a, b) => b[1] - a[1]),
    };
  }, [queue]);

  const startPrint = () => { if (queue.length && onPrintBulkOrders) onPrintBulkOrders(queue.map((i) => i.order)); };

  const totalHistory = allOrders.filter((o) => o.status === 'Printed' || o.status === 'Shipped').length;

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="space-y-5">
        <header className="k-rise flex flex-col md:flex-row md:items-end justify-between gap-4" style={{ ['--i' as string]: 0 }}>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-2xl k-card flex items-center justify-center shrink-0"><Printer className="w-6 h-6" /></span>
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Print queue</h2>
              <p className="text-sm k-muted mt-1.5">Labels print one after another on your 4×6 thermal printer.</p>
            </div>
          </div>
          <div role="tablist" aria-label="Queue or history" className="k-card p-1 flex self-start md:self-auto" style={{ borderRadius: 999 }}>
            {([['queue', `Queue ${queue.length}`], ['history', `History ${totalHistory}`]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === id ? 'k-btn-ink' : 'k-muted'}`}>{label}</button>
            ))}
          </div>
        </header>

        {tab === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 items-start tab-panel">
            <section className="lg:col-span-8 k-card overflow-hidden k-rise" style={{ ['--i' as string]: 1 }} aria-label="Labels waiting to print">
              {queue.length === 0 ? (
                <div className="py-20 px-6 text-center">
                  <span className="w-16 h-16 rounded-3xl k-card2 flex items-center justify-center mx-auto mb-4"><Layers className="w-8 h-8 k-lime-text" /></span>
                  <h3 className="text-2xl font-bold k-display">Nothing waiting to print</h3>
                  <p className="text-sm k-muted mt-2 max-w-sm mx-auto">Pick orders on the Orders or Print labels page and choose “Add to queue”. They will line up here.</p>
                </div>
              ) : (
                <ol>
                  {queue.map((item, i) => (
                    <li key={item.id} className="flex items-center gap-4 px-4 md:px-5 py-4 border-t k-rule first:border-t-0">
                      <span className="w-9 h-9 rounded-full k-card2 flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{item.order.customer.name}</p>
                        <p className="text-xs k-muted truncate"><span className="font-mono">{item.order.id}</span> · {item.order.customer.city} · {item.order.courier}</p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold">{item.order.paymentType === 'COD' ? inr(item.order.codAmount) : 'Prepaid'}</p>
                        <p className="text-xs k-muted">added {new Date(item.addedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => onNavigateToGenerator(item.order)} aria-label={`Preview label for ${item.order.id}`} title="Preview" className="w-9 h-9 rounded-full flex items-center justify-center k-btn-soft"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => download(item.order)} disabled={downloadingId === item.order.id} aria-label={`Download PNG of ${item.order.id}`} title="Download PNG" className="w-9 h-9 rounded-full flex items-center justify-center k-btn-soft disabled:opacity-40"><Download className="w-4 h-4" /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <aside className="lg:col-span-4 lg:sticky lg:top-24 k-card k-hot p-5 md:p-6 k-rise" style={{ ['--i' as string]: 2 }} aria-live="polite">
              <p className="text-sm k-muted">Ready to print</p>
              <p className="text-6xl font-bold k-display leading-none mt-2">{queue.length}</p>
              <p className="text-sm k-muted mt-1">label{queue.length === 1 ? '' : 's'}</p>

              {queue.length > 0 && (
                <>
                  <dl className="grid grid-cols-2 gap-3 mt-5 text-sm">
                    <div className="rounded-2xl k-card2 p-3"><dt className="text-xs k-muted">COD</dt><dd className="font-bold text-lg">{summary.cod}</dd><dd className="text-xs k-muted">{inr(summary.codTotal)} to collect</dd></div>
                    <div className="rounded-2xl k-card2 p-3"><dt className="text-xs k-muted">Prepaid</dt><dd className="font-bold text-lg">{summary.prepaid}</dd></div>
                  </dl>
                  <ul className="mt-4 space-y-2">
                    {summary.couriers.map(([c, n]) => (
                      <li key={c} className="text-sm">
                        <div className="flex justify-between"><span className="font-semibold">{c}</span><span className="k-muted">{n}</span></div>
                        <div className="h-1.5 rounded-full k-track mt-1 overflow-hidden"><div className="h-full k-bar bar-grow" style={{ width: `${(n / queue.length) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button onClick={startPrint} disabled={queue.length === 0} className="k-btn k-btn-lime w-full mt-6 py-3.5 text-sm" style={{ boxShadow: queue.length ? '0 10px 28px -10px var(--lime)' : undefined }}>
                <Play className="w-4 h-4" /> Print {queue.length || ''} label{queue.length === 1 ? '' : 's'}
              </button>
              <button onClick={onClearQueue} disabled={queue.length === 0} className="k-btn k-btn-ghost w-full mt-2 py-3 text-sm"><Trash2 className="w-4 h-4" /> Clear queue</button>
            </aside>
          </div>
        )}

        {tab === 'history' && (
          <section className="tab-panel space-y-4" aria-label="Print history">
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShown(HISTORY_STEP); }} aria-label="Search print history" placeholder="Order, name, city or tracking number" className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999 }} />
            </div>

            {history.length === 0 ? (
              <div className="k-card py-16 text-center text-sm k-muted">{q ? 'No printed order matches your search.' : 'Nothing has been printed yet.'}</div>
            ) : (
              grouped.map((g) => (
                <div key={g.label} className="k-card overflow-hidden">
                  <p className="px-5 py-3 text-sm font-semibold border-b k-rule">{g.label} <span className="k-muted font-normal">· {g.items.length}</span></p>
                  <ul>
                    {g.items.map((o) => (
                      <li key={o.id} className="flex items-center gap-4 px-4 md:px-5 py-3.5 border-t k-rule first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{o.customer.name}</p>
                          <p className="text-xs k-muted truncate"><span className="font-mono">{o.id}</span> · {o.customer.city}, {o.customer.pinCode} · {o.courier}</p>
                        </div>
                        <p className="text-xs k-muted hidden sm:block">{o.printedAt ? new Date(o.printedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                        <p className="text-sm font-semibold hidden sm:block w-16 text-right">{o.paymentType === 'COD' ? inr(o.codAmount) : 'Prepaid'}</p>
                        <button onClick={() => download(o)} disabled={downloadingId === o.id} aria-label={`Download PNG of ${o.id}`} title="Download PNG" className="w-9 h-9 rounded-full flex items-center justify-center k-btn-soft disabled:opacity-40"><Download className="w-4 h-4" /></button>
                        <button onClick={() => onNavigateToGenerator(o)} className="k-btn k-btn-soft px-4 h-9 text-xs">Reprint</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            {history.length > shown && (
              <button onClick={() => setShown((n) => n + HISTORY_STEP)} className="k-btn k-btn-ghost mx-auto px-6 py-3 text-sm">Show {Math.min(HISTORY_STEP, history.length - shown)} more of {history.length - shown} left</button>
            )}
          </section>
        )}
      </div>
      {overlay}
    </div>
  );
};
