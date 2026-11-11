import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useCached } from '../../hooks/useCached';
import { DataService } from '../../services/dataService';

const LOW = 20;

interface StockRow { product_name: string; sku: string; total_in: number; sold: number; returns: number; available: number }
type Filter = 'all' | 'low' | 'out';
type Health = 'healthy' | 'low' | 'out';

const healthOf = (n: number): Health => (n <= 0 ? 'out' : n <= LOW ? 'low' : 'healthy');

const HEALTH: Record<Health, { label: string; color: string; pill: React.CSSProperties }> = {
  healthy: { label: 'Healthy', color: 'var(--lime)', pill: { background: 'color-mix(in srgb, var(--lime) 18%, transparent)', color: 'var(--lime-text)' } },
  low: { label: 'Running low', color: 'var(--warn)', pill: { background: 'color-mix(in srgb, var(--warn) 17%, transparent)', color: 'var(--warn)' } },
  out: { label: 'Out of stock', color: 'var(--bad)', pill: { background: 'color-mix(in srgb, var(--bad) 15%, transparent)', color: 'var(--bad)' } },
};

/** Green shades for the donut: biggest product is the strongest green, the rest fade. */
const SHADES = [1, 0.72, 0.52, 0.36, 0.24];

const Donut = ({ parts, total }: { parts: { name: string; value: number }[]; total: number }) => {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="w-40 h-40 shrink-0 -rotate-90" role="img" aria-label={`${total} units in stock, split by product`}>
      <circle cx="70" cy="70" r={R} fill="none" strokeWidth="18" className="k-stroke-line" />
      {parts.map((p, i) => {
        const len = total > 0 ? (p.value / total) * C : 0;
        const el = (
          <circle key={p.name} cx="70" cy="70" r={R} fill="none" strokeWidth="18" strokeLinecap="butt"
            stroke={i < SHADES.length ? 'var(--lime)' : 'var(--muted)'} strokeOpacity={i < SHADES.length ? SHADES[i] : 0.4}
            strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-offset} />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
};

export const StockSummary = () => {
  const { data: overview, loading } = useCached('inventory-overview', () => DataService.getInventoryOverview());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const stock = useMemo<StockRow[]>(() => overview?.stock ?? [], [overview]);

  const { totals, rows, donut } = useMemo(() => {
    const counts: Record<Health, number> = { healthy: 0, low: 0, out: 0 };
    let units = 0;
    stock.forEach((s) => { counts[healthOf(s.available || 0)] += 1; units += Math.max(s.available || 0, 0); });

    const term = q.trim().toLowerCase();
    const rows = stock
      .filter((s) => (!term || `${s.product_name} ${s.sku}`.toLowerCase().includes(term)) && (filter === 'all' || healthOf(s.available || 0) === filter))
      .sort((a, b) => (a.available || 0) - (b.available || 0)); // what needs restocking first

    const inStock = stock.filter((s) => (s.available || 0) > 0).sort((a, b) => b.available - a.available);
    const top = inStock.slice(0, SHADES.length).map((s) => ({ name: s.product_name, value: s.available }));
    const rest = inStock.slice(SHADES.length).reduce((n, s) => n + s.available, 0);
    return { totals: { counts, units }, rows, donut: rest > 0 ? [...top, { name: 'Other products', value: rest }] : top };
  }, [stock, q, filter]);

  const { counts, units } = totals;
  const n = stock.length;
  const headline = loading ? 'Counting stock…'
    : n === 0 ? 'No products yet'
    : counts.out + counts.low === 0 ? `All ${n} products are well stocked`
    : `${counts.out > 0 ? `${counts.out} out of stock` : ''}${counts.out > 0 && counts.low > 0 ? ' and ' : ''}${counts.low > 0 ? `${counts.low} running low` : ''}`;

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All products', n },
    { key: 'low', label: 'Running low', n: counts.low },
    { key: 'out', label: 'Out of stock', n: counts.out },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header>
        <h2 className="text-2xl font-bold k-display">Stock summary</h2>
        <p className="text-sm k-muted mt-1">What you received, sold and still have, product by product.</p>
      </header>

      {/* Overview: the answer first, then where the stock sits */}
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4">
        <section className="k-card p-6 flex flex-col justify-between gap-6 k-rise" style={{ ['--i' as string]: 0 }} aria-label="Stock health">
          <div>
            <p className="text-sm k-muted">Units ready to ship</p>
            <p className="text-6xl font-bold k-display leading-none mt-2 tabular-nums">{loading ? '…' : units.toLocaleString('en-IN')}</p>
            <p className="text-lg font-semibold mt-3">{headline}</p>
          </div>
          <div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5" role="img" aria-label={`${counts.healthy} healthy, ${counts.low} running low, ${counts.out} out of stock`}>
              {(['healthy', 'low', 'out'] as Health[]).map((h) => counts[h] > 0 && (
                <div key={h} style={{ flex: counts[h], background: HEALTH[h].color }} />
              ))}
              {n === 0 && <div className="flex-1 k-track" />}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm">
              {(['healthy', 'low', 'out'] as Health[]).map((h) => (
                <li key={h} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: HEALTH[h].color }} /> <span className="font-bold tabular-nums">{counts[h]}</span> <span className="k-muted">{HEALTH[h].label.toLowerCase()}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="k-card p-6 k-rise" style={{ ['--i' as string]: 1 }} aria-label="Where the stock sits">
          <h3 className="font-bold k-display">Where the stock sits</h3>
          {donut.length === 0 ? (
            <p className="text-sm k-muted mt-4">Nothing in stock right now.</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
              <div className="relative">
                <Donut parts={donut} total={units} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold k-display tabular-nums">{units}</span>
                  <span className="text-xs k-muted">units</span>
                </div>
              </div>
              <ul className="space-y-2 min-w-0 flex-1 w-full">
                {donut.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2.5 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: i < SHADES.length ? 'var(--lime)' : 'var(--muted)', opacity: i < SHADES.length ? SHADES[i] : 0.4 }} />
                    <span className="truncate flex-1">{p.name}</span>
                    <span className="font-bold tabular-nums">{p.value}</span>
                    <span className="w-10 text-right text-xs k-muted tabular-nums">{units > 0 ? Math.round((p.value / units) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Product cards, lowest stock first */}
      <section aria-label="Products">
        <div className="flex gap-3 flex-wrap items-center mb-4">
          <div className="relative flex-1 min-w-[14rem] max-w-sm">
            <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or SKU" aria-label="Search products" className="k-field" style={{ paddingLeft: '2.4rem' }} />
          </div>
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter products">
            {chips.map((c) => <button key={c.key} className="k-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>{c.label} <span className="ml-1 opacity-70">{c.n}</span></button>)}
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="k-skel h-52 rounded-3xl animate-pulse" />)}<span className="sr-only"><Loader2 /> Counting stock</span></div>
        ) : rows.length === 0 ? (
          <div className="k-card py-14 px-6 text-center">
            <p className="font-bold">{stock.length === 0 ? 'No products yet' : 'No product matches'}</p>
            <p className="text-sm k-muted mt-1">{stock.length === 0 ? 'Add products inside a carton to see stock here.' : 'Try another search or switch the filter.'}</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((s, i) => {
              const avail = Math.max(s.available || 0, 0);
              const h = healthOf(s.available || 0);
              const pct = s.total_in > 0 ? Math.min(100, (avail / s.total_in) * 100) : 0;
              return (
                <li key={s.product_name} className="k-card p-5 flex flex-col gap-4 k-rise" style={{ ['--i' as string]: Math.min(i, 8) }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 sm:min-h-[4.1rem]">
                      <p className="font-bold leading-snug">{s.product_name}</p>
                      <p className="text-xs k-muted font-mono mt-0.5">{s.sku}</p>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0" style={HEALTH[h].pill}>{HEALTH[h].label}</span>
                  </div>

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-5xl font-bold k-display leading-none tabular-nums">{avail}</p>
                      <p className="text-xs k-muted mt-1.5">in stock now</p>
                    </div>
                    <p className="text-sm k-muted pb-1 tabular-nums">{Math.round(pct)}% of {s.total_in} left</p>
                  </div>

                  <div className="h-2 rounded-full k-track overflow-hidden" role="img" aria-label={`${avail} of ${s.total_in} received still in stock`}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: HEALTH[h].color }} />
                  </div>

                  <dl className="grid grid-cols-3 gap-2 text-center pt-1 border-t k-rule">
                    {[['Received', s.total_in], ['Sold', s.sold], ['Returned', s.returns]].map(([label, v]) => (
                      <div key={label as string} className="pt-3">
                        <dd className="font-bold tabular-nums">{v as number}</dd>
                        <dt className="text-xs k-muted">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
