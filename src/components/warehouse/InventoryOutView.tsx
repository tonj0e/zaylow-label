import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useCached } from '../../hooks/useCached';
import { CACHE } from '../../services/prefetch';

interface OutItem {
  id: string;
  sku?: string;
  product_name?: string;
  carton_id?: string | null;
  order_id?: string | null;
  customer_name?: string | null;
  status?: string;
  reserved_at?: string | null;
  updated_at?: string;
  created_at?: string;
}

interface OrderGroup {
  key: string;
  orderId: string | null;
  customer: string | null;
  at: number;
  items: OutItem[];
}

type Filter = 'all' | 'shipped' | 'reserved';

const PAGE_SIZE = 10;
/** When the unit was scanned into the order. updated_at changes on bulk fixes, so it is only the fallback. */
const when = (it: OutItem) => new Date(it.reserved_at || it.updated_at || it.created_at || 0).getTime();
const dayKey = (t: number) => new Date(t).toDateString();

const dayTitle = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
};

const time = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const isShipped = (s?: string) => s === 'Shipped' || s === 'Delivered';
const short = (id?: string | null, n = 6) => (id ? id.slice(-n).toUpperCase() : '');

/** 1 2 3 … 7: first and last page, plus the pages next to the current one. */
const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

export const InventoryOutView = () => {
  const historyC = useCached<OutItem[]>(CACHE.inventoryOut.key, CACHE.inventoryOut.fetch);
  const history = useMemo(() => historyC.data ?? [], [historyC.data]);
  const loading = historyC.loading;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const todayStr = new Date().toDateString();

  // one row per order (a 3-unit order is one row, not three)
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byOrder = new Map<string, OrderGroup>();
    history.forEach((it) => {
      if (filter === 'shipped' && !isShipped(it.status)) return;
      if (filter === 'reserved' && isShipped(it.status)) return;
      if (q && ![it.product_name, it.sku, it.id, it.order_id, it.carton_id, it.customer_name].some((v) => v?.toLowerCase().includes(q))) return;
      const key = it.order_id || `loose-${it.id}`;
      const g = byOrder.get(key) || { key, orderId: it.order_id || null, customer: it.customer_name || null, at: 0, items: [] };
      g.items.push(it);
      g.at = Math.max(g.at, when(it));
      byOrder.set(key, g);
    });
    return [...byOrder.values()].sort((a, b) => b.at - a.at);
  }, [history, search, filter]);

  const stats = useMemo(() => {
    const byProduct = new Map<string, number>();
    let shipped = 0;
    let today = 0;
    const shown = new Map<string, string>(); // lower-case key -> first spelling seen
    history.forEach((it) => {
      const raw = (it.product_name || 'Unnamed product').trim();
      const key = raw.toLowerCase().replace(/\s+/g, ' ');
      if (!shown.has(key)) shown.set(key, raw);
      byProduct.set(key, (byProduct.get(key) || 0) + 1);
      if (isShipped(it.status)) shipped += 1;
      if (dayKey(when(it)) === todayStr) today += 1;
    });
    return { today, total: history.length, shipped, products: [...byProduct.entries()].map(([k, n]) => [shown.get(k) || k, n] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 6) };
  }, [history, todayStr]);

  const lastPage = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const rows = groups.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reserved', label: 'Reserved' },
    { key: 'shipped', label: 'Shipped' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header>
        <h2 className="text-2xl font-bold k-display">Inventory out</h2>
        <p className="text-sm k-muted mt-1">Every order that took units out of a carton, newest first.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
        <section aria-label="Orders that took stock" className="min-w-0">
          <div className="flex gap-3 flex-wrap items-center mb-3">
            <div className="relative flex-1 min-w-[14rem] max-w-md">
              <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search customer, order, product or SKU" aria-label="Search inventory out" className="k-field" style={{ paddingLeft: '2.4rem' }} />
            </div>
            <div className="flex gap-2" role="group" aria-label="Filter by status">
              {filters.map((f) => <button key={f.key} className="k-chip" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setPage(1); }}>{f.label}</button>)}
            </div>
          </div>

          <div className="k-card overflow-hidden">
            {/* column names: only on wide screens, where the row has room for columns */}
            <div className="hidden md:grid grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem_6rem_3rem_6.5rem] gap-4 px-5 py-3 text-xs font-semibold k-muted border-b k-rule" aria-hidden="true">
              <span>Time</span><span>Customer</span><span>Product</span><span>Order</span><span>Carton</span><span className="text-right">Units</span><span className="text-center">Status</span>
            </div>

            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="k-skel h-12 rounded-2xl animate-pulse" />)}</div>
            ) : rows.length === 0 ? (
              <div className="py-14 px-6 text-center">
                <p className="font-bold">{history.length === 0 ? 'Nothing has gone out yet' : 'No order matches that search'}</p>
                <p className="text-sm k-muted mt-1">{history.length === 0 ? 'Units show here once they are scanned into an order.' : 'Try a different search or clear the filter.'}</p>
              </div>
            ) : (
              <ul>
                {rows.map((g, i) => {
                  const shipped = g.items.every((x) => isShipped(x.status));
                  const products = [...new Set(g.items.map((x) => x.product_name).filter(Boolean))].join(', ');
                  const cartons = [...new Set(g.items.map((x) => short(x.carton_id)).filter(Boolean))].join(', ');
                  const newDay = i === 0 || dayKey(rows[i - 1].at) !== dayKey(g.at);
                  return (
                    <li key={g.key}>
                      {newDay && (
                        <p className="px-5 py-2 text-sm font-bold k-card2 border-t k-rule first:border-t-0">
                          {dayTitle(g.at)}
                        </p>
                      )}
                      <div className="k-row border-t k-rule px-5 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem_6rem_3rem_6.5rem] gap-x-4 gap-y-1 items-center">
                        <span className="hidden md:block text-sm k-muted tabular-nums">{time(g.at)}</span>
                        <div className="min-w-0">
                          <p className="font-bold truncate" title={g.customer || undefined}>{g.customer || 'No customer'}</p>
                          <p className="md:hidden text-xs k-muted">{time(g.at)} · <span className="font-mono">{g.orderId || 'No order'}</span> · × {g.items.length}</p>
                        </div>
                        <p className="hidden md:block text-sm truncate" title={products || undefined}>{products || 'Unnamed product'}</p>
                        <p className="hidden md:block text-sm font-mono truncate">{g.orderId || '–'}</p>
                        <p className="hidden md:block text-sm font-mono k-muted truncate">{cartons || '–'}</p>
                        <p className="hidden md:block text-sm font-bold text-right tabular-nums">{g.items.length}</p>
                        <span className="justify-self-end rounded-full px-3 py-1 text-xs font-bold text-center w-24 md:w-full" style={shipped ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { background: 'var(--card2)' }}>
                          {shipped ? 'Shipped' : 'Reserved'}
                        </span>
                        <p className="md:hidden col-span-2 text-sm k-muted truncate">{products || 'Unnamed product'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {groups.length > PAGE_SIZE && (
            <nav className="flex items-center justify-between gap-3 flex-wrap mt-4" aria-label="Pages">
              <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, groups.length)} of {groups.length} orders</p>
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

        <aside className="space-y-4 xl:sticky xl:top-28" aria-label="Inventory out at a glance">
          <div className="k-card p-5">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-3xl font-bold k-display leading-none">{loading ? '…' : stats.today.toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1.5">units out today</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{loading ? '…' : stats.total.toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1.5">units out in total</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{loading ? '…' : stats.shipped.toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1.5">already shipped</p></div>
              <div><p className="text-3xl font-bold k-display leading-none">{loading ? '…' : (stats.total - stats.shipped).toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1.5">reserved, not shipped</p></div>
            </div>
          </div>

          <div className="k-card p-5">
            <h3 className="font-bold k-display">What went out most</h3>
            {stats.products.length === 0 ? (
              <p className="text-sm k-muted mt-3">Products show here after the first scan.</p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {stats.products.map(([name, n]) => (
                  <li key={name}>
                    <div className="flex justify-between gap-3 text-sm"><span className="truncate">{name}</span><span className="font-bold tabular-nums">{n}</span></div>
                    <div className="h-1.5 rounded-full k-track mt-1.5 overflow-hidden"><div className="h-full rounded-full k-bar" style={{ width: `${(n / stats.products[0][1]) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
