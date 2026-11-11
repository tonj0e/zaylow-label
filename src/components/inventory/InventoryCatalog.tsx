import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, Package, Layers, MapPin, ArrowRight, Box } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { useCached } from '../../hooks/useCached';

type Tab = 'products' | 'cartons';
type PFilter = 'all' | 'healthy' | 'low' | 'out';
type CFilter = 'all' | 'stocked' | 'empty';

interface StockItem { product_name: string; sku?: string; total_in: number; sold: number; returns: number; available: number }
interface CartonRow { id: string; location?: string | null; created_at: string; totalUnits: number; contents: { name: string; count: number }[] }

const stateOf = (n: number) => (n > 20 ? 'healthy' : n > 0 ? 'low' : 'out');
const STATE_LABEL = { healthy: 'In stock', low: 'Running low', out: 'Out of stock' } as const;
const STATE_COLOR = { healthy: 'var(--lime)', low: 'var(--warn)', out: 'var(--bad)' } as const;

const SEGMENTS = ['var(--lime)', 'var(--ink)', 'var(--muted)', 'var(--warn)', '#4f9bff'];

export const InventoryCatalog: React.FC<{ initialTab: Tab; autoFocusSearch?: boolean }> = ({ initialTab, autoFocusSearch }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [pf, setPf] = useState<PFilter>('all');
  const [cf, setCf] = useState<CFilter>('all');
  const [sort, setSort] = useState<'new' | 'units'>('new');
  const q = useDeferredValue(search.trim().toLowerCase());
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: overview, loading: firstLoad, refreshing, refresh } = useCached('inventory-overview', () => DataService.getInventoryOverview());
  const stock = useMemo(() => (overview?.stock ?? []) as StockItem[], [overview]);
  const cartons = useMemo(() => (overview?.cartons ?? []) as CartonRow[], [overview]);
  const loading = firstLoad;
  const load = refresh;

  useEffect(() => { if (autoFocusSearch && window.matchMedia('(min-width: 768px)').matches) searchRef.current?.focus(); }, [autoFocusSearch]);

  const totalUnits = useMemo(() => cartons.reduce((s, c) => s + c.totalUnits, 0), [cartons]);
  const available = useMemo(() => stock.reduce((s, r) => s + (r.available || 0), 0), [stock]);

  const products = useMemo(() => stock
    .filter((s) => (pf === 'all' || stateOf(s.available || 0) === pf) && (!q || s.product_name.toLowerCase().includes(q) || (s.sku || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.available || 0) - (a.available || 0)), [stock, q, pf]);

  const cartonRows = useMemo(() => [...cartons].sort((a, b) => sort === 'units' ? b.totalUnits - a.totalUnits : +new Date(b.created_at) - +new Date(a.created_at)).filter((c) => {
    if (cf === 'stocked' && c.totalUnits === 0) return false;
    if (cf === 'empty' && c.totalUnits > 0) return false;
    if (!q) return true;
    return c.id.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q) || c.contents.some((x) => x.name.toLowerCase().includes(q));
  }), [cartons, q, cf, sort]);

  const pCounts = { all: stock.length, healthy: stock.filter((s) => stateOf(s.available) === 'healthy').length, low: stock.filter((s) => stateOf(s.available) === 'low').length, out: stock.filter((s) => stateOf(s.available) === 'out').length };
  const emptyCartons = cartons.filter((c) => c.totalUnits === 0).length;

  const seeCartons = (name: string) => { setSearch(name); setTab('cartons'); setCf('all'); };

  // share of ready-to-sell stock by product, for the band at the top
  const shareRows = useMemo(() => [...stock].filter((s) => (s.available || 0) > 0).sort((a, b) => b.available - a.available), [stock]);
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="k-rise flex flex-col lg:flex-row lg:items-center justify-between gap-4" style={{ ['--i' as string]: 0 }}>
          <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Inventory</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
              <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search inventory" placeholder={tab === 'products' ? 'Search product or SKU' : 'Search carton, location or product'} className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999 }} />
            </div>
            <button onClick={load} disabled={refreshing} aria-label="Refresh" className="k-btn k-btn-ghost w-11 h-11 shrink-0"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          </div>
        </header>

        {/* Stock band: one dark hero tile and two quiet ones */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 k-rise" style={{ ['--i' as string]: 1 }} aria-label="Stock summary">
          <div className="md:col-span-2 k-card p-4 sm:p-6">
            <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-8">
              <div className="shrink-0">
                <p className="text-sm k-muted">Ready to sell</p>
                <p className="text-5xl sm:text-7xl font-bold k-display leading-none mt-1.5 sm:mt-2 tabular-nums">{available.toLocaleString('en-IN')}</p>
                <p className="text-xs sm:text-sm k-muted mt-1.5 sm:mt-2">units · {shareRows.length} product{shareRows.length === 1 ? '' : 's'}</p>
              </div>
              {shareRows.length > 0 && (
                <>
                  <svg viewBox="0 0 120 120" className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 -rotate-90 sm:ml-auto" role="img" aria-label="Share of ready stock by product">
                    <circle cx="60" cy="60" r="46" fill="none" strokeWidth="16" className="k-stroke-line" />
                    {(() => { const C = 2 * Math.PI * 46; let off = 0; return shareRows.map((x, k) => { const len = (x.available / Math.max(1, available)) * C; const el = <circle key={x.product_name} cx="60" cy="60" r="46" fill="none" strokeWidth="16" stroke={SEGMENTS[k % SEGMENTS.length]} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} />; off += len; return el; }); })()}
                  </svg>
                  <ul className="hidden sm:block space-y-2 min-w-0">
                    {shareRows.map((x, k) => (
                      <li key={x.product_name} className="flex items-center gap-2 text-sm min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEGMENTS[k % SEGMENTS.length] }} />
                        <span className="font-semibold tabular-nums">{x.available}</span>
                        <span className="truncate capitalize k-muted">{x.product_name.toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {shareRows.length > 0 && (
              <ul className="sm:hidden mt-3 pt-3 border-t k-rule grid gap-1.5">
                {shareRows.map((x, k) => (
                  <li key={x.product_name} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEGMENTS[k % SEGMENTS.length] }} />
                    <span className="capitalize k-muted truncate flex-1">{x.product_name.toLowerCase()}</span>
                    <span className="font-semibold tabular-nums">{x.available}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            <div className="k-card p-4 sm:p-5 flex flex-col justify-between">
              <p className="text-sm k-muted">In cartons</p>
              <p className="text-3xl sm:text-5xl font-bold k-display leading-none mt-2 sm:mt-3 tabular-nums">{totalUnits.toLocaleString('en-IN')}</p>
              <p className="text-xs k-muted mt-2">{cartons.length} cartons</p>
            </div>
            <div className="k-card p-4 sm:p-5 flex flex-col justify-between">
              <p className="text-sm k-muted">Products</p>
              <p className="text-3xl sm:text-5xl font-bold k-display leading-none mt-2 sm:mt-3 tabular-nums">{stock.length}</p>
              <p className="text-xs k-muted mt-2">{pCounts.low + pCounts.out > 0 ? `${pCounts.low + pCounts.out} need restocking` : 'all well stocked'}</p>
            </div>
          </div>
        </section>

        <div className="k-rise flex items-center justify-between gap-3 flex-wrap" style={{ ['--i' as string]: 2 }}>
          <div role="tablist" aria-label="Inventory view" className="k-card p-1 flex" style={{ borderRadius: 999 }}>
            {([['products', 'Products', Package, stock.length], ['cartons', 'Cartons', Layers, cartons.length]] as const).map(([id, label, Icon, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === id ? 'k-btn-ink' : 'k-muted'}`}>
                <Icon className="w-4 h-4" /> {label} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-3 px-3 sm:mx-0 sm:px-0 w-[calc(100%+1.5rem)] sm:w-auto pb-1 sm:pb-0 [scrollbar-width:none] [&>*]:shrink-0" role="group" aria-label="Filter">
            {tab === 'products'
              ? ([['all', `All ${pCounts.all}`], ['healthy', `In stock ${pCounts.healthy}`], ['low', `Running low ${pCounts.low}`], ['out', `Out ${pCounts.out}`]] as const).map(([id, label]) => (
                  <button key={id} className="k-chip" aria-pressed={pf === id} onClick={() => setPf(id)}>{label}</button>))
              : <>
                  {([['all', `All ${cartons.length}`], ['stocked', `With stock ${cartons.length - emptyCartons}`], ['empty', `Empty ${emptyCartons}`]] as const).map(([id, label]) => (
                    <button key={id} className="k-chip" aria-pressed={cf === id} onClick={() => setCf(id)}>{label}</button>))}
                  <span className="hidden sm:block w-px h-5 mx-1" style={{ background: 'var(--line)' }} aria-hidden />
                  {([['new', 'Newest'], ['units', 'Most units']] as const).map(([id, label]) => (
                    <button key={id} className="k-chip" aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>))}
                </>}
          </div>
        </div>

        {tab === 'products' && (
          loading && stock.length === 0 ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="k-card h-56 k-skel animate-pulse" />)}</ul>
          ) : products.length === 0 ? (
            <div className="k-card py-16 text-center k-muted text-sm"><Package className="w-10 h-10 mx-auto mb-3 opacity-30" />No product matches. Clear the search or pick another filter.</div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {products.map((s, i) => {
                const st = stateOf(s.available || 0);
                const tone = i === 0 ? { background: 'var(--lime)', color: 'var(--on-lime)' } : undefined;
                const pct = s.total_in > 0 ? Math.round(((s.available || 0) / s.total_in) * 100) : 0;
                return (
                  <li key={s.product_name} className={`${tone ? 'rounded-[28px]' : 'k-card'} p-4 sm:p-6 flex flex-col k-rise`} style={{ ...tone, ['--i' as string]: Math.min(i, 8) + 2 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-lg capitalize leading-tight">{s.product_name.toLowerCase()}</p>
                        <p className="font-mono text-xs opacity-60 mt-0.5 truncate">{s.sku || 'No SKU'}</p>
                      </div>
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: 'rgba(128,128,128,.22)' }}>
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: tone ? 'currentColor' : STATE_COLOR[st] }} />{STATE_LABEL[st]}
                      </span>
                    </div>
                    <p className="mt-4 sm:mt-6 text-5xl sm:text-6xl font-bold k-display leading-none tabular-nums">{s.available || 0}<span className="text-sm font-medium opacity-60 ml-2 font-sans tracking-normal">ready</span></p>
                    <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(128,128,128,.28)' }} role="img" aria-label={`${pct}% of what was received is still here`}>
                      <span className="block h-full rounded-full bar-grow" style={{ width: `${Math.max(pct, s.available ? 3 : 0)}%`, background: tone ? 'currentColor' : STATE_COLOR[st] }} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      {([['Received', s.total_in], ['Sold', s.sold], ['Returned', s.returns]] as const).map(([l, v]) => (
                        <div key={l} className="rounded-2xl px-3 py-2" style={{ background: 'rgba(128,128,128,.16)' }}><dt className="text-[11px] opacity-65">{l}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
                      ))}
                    </dl>
                    <button onClick={() => seeCartons(s.product_name)} className="mt-5 text-sm font-semibold flex items-center gap-1.5 hover:gap-2.5 transition-all self-start">See its cartons <ArrowRight className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'cartons' && (
          loading && cartons.length === 0 ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="k-card h-48 k-skel animate-pulse" />)}</ul>
          ) : cartonRows.length === 0 ? (
            <div className="k-card py-16 text-center k-muted text-sm"><Box className="w-10 h-10 mx-auto mb-3 opacity-30" />{cartons.length === 0 ? 'No cartons yet. Create one from the Cartons page.' : 'No carton matches your search.'}</div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {cartonRows.map((c, i) => {
                // one square = 10 units, coloured by product, so a carton reads at a glance
                const squares = c.contents.flatMap((x, k) => Array.from({ length: Math.max(1, Math.round(x.count / 10)) }, () => k));
                return (
                  <li key={c.id} className="k-card p-5 flex flex-col k-rise" style={{ ['--i' as string]: Math.min(i, 8) + 2 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-base tracking-tight">{c.id.substring(0, 8).toUpperCase()}</p>
                        <p className="text-xs k-muted mt-1 flex items-center gap-1.5 min-w-0"><span className="whitespace-nowrap">{fmt(c.created_at)}</span><span aria-hidden>·</span><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{c.location || 'No location'}</span></p>
                      </div>
                      <p className="text-4xl font-bold k-display leading-none tabular-nums text-right">{c.totalUnits}<span className="block text-xs font-medium k-muted mt-1 font-sans tracking-normal">units</span></p>
                    </div>
                    {squares.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-1.5" role="img" aria-label="Each square is about 10 units">
                        {squares.map((k, n) => <span key={n} className="w-[18px] h-[18px] rounded-md" style={{ background: SEGMENTS[k % SEGMENTS.length] }} />)}
                      </div>
                    ) : <p className="mt-5 text-sm k-muted">Empty carton</p>}
                    {c.contents.length > 0 && (
                      <ul className="mt-auto pt-4 space-y-1">
                        {c.contents.map((x, k) => (
                          <li key={x.name} className="flex items-center gap-2 text-sm min-w-0">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SEGMENTS[k % SEGMENTS.length] }} />
                            <span className="font-semibold tabular-nums">{x.count}</span>
                            <span className="truncate capitalize k-muted">{x.name.toLowerCase()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
};
