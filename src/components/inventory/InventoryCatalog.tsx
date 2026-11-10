import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, Package, Layers, MapPin, Calendar, ArrowRight, Box } from 'lucide-react';
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

/* quiet, tonal tiles so a name gets a stable colour without a photo */
const TONES = ['#dcebe1', '#e6e9df', '#dfe8ec', '#ece6dc', '#e5e1ee'];
const TONES_DARK = ['#1d2a22', '#23261f', '#1e272b', '#2a2620', '#25222f'];
const toneIndex = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % TONES.length; };
const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const SEGMENTS = ['var(--lime)', 'var(--ink)', 'var(--muted)', 'var(--warn)', '#4f9bff'];

const Ring: React.FC<{ value: number; max: number; color: string; label: string }> = ({ value, max, color, label }) => {
  const R = 30, C = 2 * Math.PI * R;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative w-[76px] h-[76px] shrink-0" role="img" aria-label={`${value} of ${max} ${label}`}>
      <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="7" className="k-stroke-line" />
        <circle cx="38" cy="38" r={R} fill="none" strokeWidth="7" strokeLinecap="round" stroke={color} strokeDasharray={`${pct * C} ${C}`} style={{ transition: 'stroke-dasharray .9s cubic-bezier(.22,1,.36,1)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-bold k-display">{value}</span>
    </div>
  );
};

export const InventoryCatalog: React.FC<{ initialTab: Tab; autoFocusSearch?: boolean }> = ({ initialTab, autoFocusSearch }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [pf, setPf] = useState<PFilter>('all');
  const [cf, setCf] = useState<CFilter>('all');
  const q = useDeferredValue(search.trim().toLowerCase());
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: overview, loading: firstLoad, refreshing, refresh } = useCached('inventory-overview', () => DataService.getInventoryOverview());
  const stock = useMemo(() => (overview?.stock ?? []) as StockItem[], [overview]);
  const cartons = useMemo(() => (overview?.cartons ?? []) as CartonRow[], [overview]);
  const loading = firstLoad;
  const load = refresh;

  useEffect(() => { if (autoFocusSearch) searchRef.current?.focus(); }, [autoFocusSearch]);

  const totalUnits = useMemo(() => cartons.reduce((s, c) => s + c.totalUnits, 0), [cartons]);
  const available = useMemo(() => stock.reduce((s, r) => s + (r.available || 0), 0), [stock]);

  const products = useMemo(() => stock
    .filter((s) => (pf === 'all' || stateOf(s.available || 0) === pf) && (!q || s.product_name.toLowerCase().includes(q) || (s.sku || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.available || 0) - (a.available || 0)), [stock, q, pf]);

  const cartonRows = useMemo(() => cartons.filter((c) => {
    if (cf === 'stocked' && c.totalUnits === 0) return false;
    if (cf === 'empty' && c.totalUnits > 0) return false;
    if (!q) return true;
    return c.id.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q) || c.contents.some((x) => x.name.toLowerCase().includes(q));
  }), [cartons, q, cf]);

  const pCounts = { all: stock.length, healthy: stock.filter((s) => stateOf(s.available) === 'healthy').length, low: stock.filter((s) => stateOf(s.available) === 'low').length, out: stock.filter((s) => stateOf(s.available) === 'out').length };
  const emptyCartons = cartons.filter((c) => c.totalUnits === 0).length;

  const seeCartons = (name: string) => { setSearch(name); setTab('cartons'); setCf('all'); };

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="k-rise" style={{ ['--i' as string]: 0 }}>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Inventory</h2>
              <p className="text-sm k-muted mt-2">
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{available.toLocaleString('en-IN')}</span> units ready to sell ·{' '}
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{totalUnits.toLocaleString('en-IN')}</span> in {cartons.length} cartons · {stock.length} products
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
                <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search inventory" placeholder={tab === 'products' ? 'Search product or SKU' : 'Search carton, location or product'} className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999 }} />
              </div>
              <button onClick={load} disabled={refreshing} aria-label="Refresh" className="k-btn k-btn-ghost w-11 h-11 shrink-0"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>
        </header>

        <div className="k-rise flex items-center justify-between gap-3 flex-wrap" style={{ ['--i' as string]: 1 }}>
          <div role="tablist" aria-label="Inventory view" className="k-card p-1 flex" style={{ borderRadius: 999 }}>
            {([['products', 'Products', Package, stock.length], ['cartons', 'Cartons', Layers, cartons.length]] as const).map(([id, label, Icon, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === id ? 'k-btn-ink' : 'k-muted'}`}>
                <Icon className="w-4 h-4" /> {label} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter">
            {tab === 'products'
              ? ([['all', `All ${pCounts.all}`], ['healthy', `In stock ${pCounts.healthy}`], ['low', `Running low ${pCounts.low}`], ['out', `Out ${pCounts.out}`]] as const).map(([id, label]) => (
                  <button key={id} className="k-chip" aria-pressed={pf === id} onClick={() => setPf(id)}>{label}</button>))
              : ([['all', `All ${cartons.length}`], ['stocked', `With stock ${cartons.length - emptyCartons}`], ['empty', `Empty ${emptyCartons}`]] as const).map(([id, label]) => (
                  <button key={id} className="k-chip" aria-pressed={cf === id} onClick={() => setCf(id)}>{label}</button>))}
          </div>
        </div>

        {tab === 'products' && (
          loading && stock.length === 0 ? (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className="k-card h-44 k-skel animate-pulse" />)}
            </ul>
          ) : products.length === 0 ? (
            <div className="k-card py-16 text-center k-muted text-sm"><Package className="w-10 h-10 mx-auto mb-3 opacity-30" />No product matches. Clear the search or pick another filter.</div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {products.map((s, i) => {
                const st = stateOf(s.available || 0);
                const ti = toneIndex(s.product_name);
                return (
                  <li key={s.product_name} className="k-card p-5 k-rise" style={{ ['--i' as string]: Math.min(i, 8) + 2 }}>
                    <div className="flex items-start gap-3">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 inv-tone" style={{ ['--t' as string]: TONES[ti], ['--td' as string]: TONES_DARK[ti] }}>{initials(s.product_name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold capitalize truncate">{s.product_name.toLowerCase()}</p>
                        <p className="font-mono text-xs k-muted truncate">{s.sku || 'No SKU'}</p>
                      </div>
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: 'var(--card2)', color: 'var(--ink)' }}>
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: STATE_COLOR[st] }} />{STATE_LABEL[st]}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center gap-5">
                      <Ring value={s.available || 0} max={s.total_in} color={STATE_COLOR[st]} label="available" />
                      <dl className="grid grid-cols-3 gap-4 flex-1 text-sm">
                        <div><dt className="text-xs k-muted">Received</dt><dd className="font-bold mt-0.5">{s.total_in}</dd></div>
                        <div><dt className="text-xs k-muted">Sold</dt><dd className="font-bold mt-0.5">{s.sold}</dd></div>
                        <div><dt className="text-xs k-muted">Returned</dt><dd className="font-bold mt-0.5">{s.returns}</dd></div>
                      </dl>
                    </div>
                    <button onClick={() => seeCartons(s.product_name)} className="mt-4 text-sm font-semibold flex items-center gap-1.5 hover:gap-2.5 transition-all">See its cartons <ArrowRight className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'cartons' && (
          loading && cartons.length === 0 ? (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <li key={i} className="k-card h-36 k-skel animate-pulse" />)}</ul>
          ) : cartonRows.length === 0 ? (
            <div className="k-card py-16 text-center k-muted text-sm"><Box className="w-10 h-10 mx-auto mb-3 opacity-30" />{cartons.length === 0 ? 'No cartons yet. Create one from the Cartons page.' : 'No carton matches your search.'}</div>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {cartonRows.map((c, i) => (
                <li key={c.id} className="k-card p-5 k-rise" style={{ ['--i' as string]: Math.min(i, 8) + 2 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono font-bold text-lg tracking-tight">{c.id.substring(0, 8).toUpperCase()}</p>
                      <p className="text-xs k-muted flex items-center gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location || 'No location'}</span>
                      </p>
                    </div>
                    <p className="text-3xl font-bold k-display leading-none text-right">{c.totalUnits}<span className="block text-xs font-medium k-muted mt-1 font-sans tracking-normal">units</span></p>
                  </div>

                  {c.contents.length > 0 ? (
                    <>
                      <div className="mt-4 h-2.5 rounded-full overflow-hidden flex k-track" role="img" aria-label="Share of each product in this carton">
                        {c.contents.map((x, k) => <span key={x.name} className="h-full bar-grow" style={{ width: `${(x.count / c.totalUnits) * 100}%`, background: SEGMENTS[k % SEGMENTS.length] }} />)}
                      </div>
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {c.contents.map((x, k) => (
                          <li key={x.name} className="flex items-center gap-2 text-sm min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEGMENTS[k % SEGMENTS.length] }} />
                            <span className="font-semibold">{x.count}×</span>
                            <span className="truncate capitalize k-muted">{x.name.toLowerCase()}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-4 text-sm k-muted">Empty carton</p>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
      <style>{`.kdash .inv-tone{background:var(--t);color:#14211a}.dark .kdash .inv-tone{background:var(--td);color:#f2f5f1}`}</style>
    </div>
  );
};
