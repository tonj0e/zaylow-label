import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Order } from '../../types';
import { orderValue } from '../../utils/orderValue';
import { useCached } from '../../hooks/useCached';
import { DataService } from '../../services/dataService';
import { STATUS_DOT, STATUS_ORDER } from '../orders/orderUi';
import { canonicalProduct } from '../../utils/productNames';

interface ReportsViewProps {
  /** Orders the app already holds in memory: the report never downloads them again. */
  orders: Order[];
  loading?: boolean;
  onOpenOrders?: () => void;
}

type Preset = '7' | '30' | '90' | 'month' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Pick dates' },
];

const LOW_STOCK = 20;
const CW = 1000;
const CH = 240;
const PAGE_SIZE = 8;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day, so an order placed at 7 am India time lands on that day, not the day before. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const niceDay = (k: string) => fromKey(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const rangeFor = (preset: Preset, custom: { start: string; end: string }) => {
  const end = new Date();
  if (preset === 'custom') return custom;
  const start = new Date();
  if (preset === 'month') start.setDate(1);
  else start.setDate(end.getDate() - (parseInt(preset, 10) - 1));
  return { start: dayKey(start), end: dayKey(end) };
};

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (orders: Order[], start: string, end: string) => {
  const head = ['Order ID', 'Date', 'Customer', 'Phone', 'Product', 'Quantity', 'Payment', 'Amount', 'Status', 'Tracking number'];
  const lines = orders.map((o) => [o.id, dayKey(new Date(o.createdAt)), o.customer.name, o.customer.phone, o.item.productName, o.item.quantity, o.paymentType, orderValue(o), o.status, o.trackingNumber || ''].map(csvCell).join(','));
  const blob = new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `orders-${start}-to-${end}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

/** 1 2 3 … 7: first and last page, plus the pages next to the current one. */
const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

const statusPill = (s: string): React.CSSProperties =>
  s === 'Delivered' || s === 'Shipped' ? { background: 'var(--lime)', color: 'var(--on-lime)' }
  : s === 'Cancelled' || s === 'Returned' ? { background: 'color-mix(in srgb, var(--bad) 15%, transparent)', color: 'var(--bad)' }
  : s === 'Pending' || s === 'Claims' ? { background: 'color-mix(in srgb, var(--warn) 17%, transparent)', color: 'var(--warn)' }
  : { background: 'var(--card2)', color: 'var(--ink)' };

const ReportsView = ({ orders: allOrders = [], loading, onOpenOrders }: ReportsViewProps) => {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState(() => rangeFor('30', { start: '', end: '' }));
  const [page, setPage] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: overview } = useCached('inventory-overview', () => DataService.getInventoryOverview());

  const { start, end } = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const today = dayKey(new Date());

  const report = useMemo(() => {
    const from = fromKey(start).getTime();
    const to = fromKey(end).getTime() + 86400000 - 1;
    // cancelled orders are not sales
    const inRange = allOrders
      .filter((o) => o.status !== 'Cancelled' && new Date(o.createdAt).getTime() >= from && new Date(o.createdAt).getTime() <= to)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const days = new Map<string, { sales: number; orders: number }>();
    for (let t = fromKey(start); t.getTime() <= fromKey(end).getTime(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) days.set(dayKey(t), { sales: 0, orders: 0 });

    const status = new Map<string, number>();
    const products = new Map<string, { name: string; units: number }>();
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // Monday first
    const valued: number[] = [];
    let totalUnits = 0;
    let sales = 0, cod = 0;
    inRange.forEach((o) => {
      const v = orderValue(o);
      sales += v;
      if (v > 0) valued.push(v);
      weekdayCounts[(new Date(o.createdAt).getDay() + 6) % 7] += 1;
      totalUnits += o.item.quantity || 1;
      if (o.paymentType === 'COD') cod += 1;
      const d = days.get(dayKey(new Date(o.createdAt)));
      if (d) { d.sales += v; d.orders += 1; }
      status.set(o.status, (status.get(o.status) || 0) + 1);
      const real = canonicalProduct(o.item.productName);
      const pk = real.toLowerCase();
      const p = products.get(pk) || { name: real, units: 0 };
      p.units += o.item.quantity || 1;
      products.set(pk, p);
    });

    const series = [...days.entries()].map(([date, v]) => ({ date, ...v }));
    const best = series.reduce((b, d) => (d.sales > b.sales ? d : b), { date: '', sales: 0, orders: 0 });
    const minValue = valued.length ? Math.min(...valued) : 0;
    const maxValue = valued.length ? Math.max(...valued) : 0;
    const statusRank = (l: string) => { const i = (STATUS_ORDER as string[]).indexOf(l); return i === -1 ? 99 : i; };
    return {
      orders: inRange,
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ label, count: weekdayCounts[i] })),
      maxWeekday: Math.max(...weekdayCounts, 1),
      minValue, maxValue, sizeSpan: maxValue - minValue, valued: valued.length,
      totalUnits: Math.max(totalUnits, 1),
      sales,
      count: inRange.length,
      cod,
      avg: inRange.length ? sales / inRange.length : 0,
      series,
      maxSales: Math.max(...series.map((d) => d.sales), 1),
      best,
      status: [...status.entries()].map(([label, value]) => ({ label, value, color: STATUS_DOT[label] || 'var(--muted)' })).sort((a, b) => statusRank(a.label) - statusRank(b.label)),
      products: [...products.values()].sort((a, b) => b.units - a.units).slice(0, 6),
    };
  }, [allOrders, start, end]);

  // line chart geometry: one point per day, drawn in a 1000 x 240 box that stretches to fit
  const chart = useMemo(() => {
    const n = report.series.length;
    const xs = report.series.map((_, i) => (n === 1 ? CW / 2 : (i / (n - 1)) * CW));
    const ys = report.series.map((d) => CH - 6 - (d.sales / report.maxSales) * (CH - 24));
    const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
    const area = n ? `${line} L${xs[n - 1].toFixed(1)} ${CH} L${xs[0].toFixed(1)} ${CH} Z` : '';
    return { xs, ys, line, area };
  }, [report.series, report.maxSales]);

  const onChartMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = chartRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const f = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    setHover(Math.round(f * Math.max(report.series.length - 1, 0)));
  };

  const stock = useMemo(() => {
    const rows: { available: number }[] = overview?.stock ?? [];
    return {
      units: rows.reduce((n, r) => n + Math.max(r.available || 0, 0), 0),
      low: rows.filter((r) => (r.available || 0) > 0 && (r.available || 0) <= LOW_STOCK).length,
      out: rows.filter((r) => (r.available || 0) <= 0).length,
    };
  }, [overview]);

  const lastPage = Math.max(1, Math.ceil(report.orders.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const rows = report.orders.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const maxUnits = report.products[0]?.units || 1;
  const codShare = report.count ? Math.round((report.cod / report.count) * 100) : 0;
  const days = report.series.length;

  if (loading && allOrders.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto pb-24 md:pb-6" aria-busy="true" aria-label="Loading reports">
        <div><h2 className="text-2xl font-bold k-display">Reports</h2><p className="text-sm k-muted mt-1">Loading your orders…</p></div>
        <div className="k-skel h-44 rounded-3xl animate-pulse" />
        <div className="k-skel h-64 rounded-3xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-4 max-md:flex-nowrap md:flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Reports</h2>
          <p className="text-sm k-muted mt-1">{niceDay(start)} to {niceDay(end)} · {days} day{days === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => downloadCsv(report.orders, start, end)} disabled={report.count === 0} className="k-btn k-btn-soft px-5 py-3 text-sm max-md:w-11 max-md:h-11 max-md:p-0 max-md:shrink-0" aria-label="Download orders as CSV">
          <Download className="w-4 h-4" /> <span className="max-md:hidden">Download orders (CSV)</span>
        </button>
      </header>

      {/* Period */}
      <div className="flex gap-3 flex-wrap items-center">
        <div role="group" aria-label="Report period" className="flex gap-2 md:flex-wrap max-md:overflow-x-auto max-md:snap-row max-md:-mx-4 max-md:px-4 max-md:w-[calc(100%+2rem)] [&>button]:whitespace-nowrap [&>button]:shrink-0">
          {PRESETS.map((p) => <button key={p.key} className="k-chip" aria-pressed={preset === p.key} onClick={() => { setPreset(p.key); setPage(1); setHover(null); if (p.key === 'custom') setCustom(rangeFor('30', { start: '', end: '' })); }}>{p.label}</button>)}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-2 items-center flex-wrap">
            <label className="sr-only" htmlFor="rep-start">Start date</label>
            <input id="rep-start" type="date" value={custom.start} max={custom.end || today} onChange={(e) => { setCustom((c) => ({ ...c, start: e.target.value })); setPage(1); }} className="k-field w-auto" />
            <span className="k-muted text-sm">to</span>
            <label className="sr-only" htmlFor="rep-end">End date</label>
            <input id="rep-end" type="date" value={custom.end} min={custom.start} max={today} onChange={(e) => { setCustom((c) => ({ ...c, end: e.target.value })); setPage(1); }} className="k-field w-auto" />
          </div>
        )}
      </div>

      {/* Hero: the headline number with the whole period drawn beside it */}
      <section className="rep-hero p-5 sm:p-8 grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-5 md:gap-8 items-stretch k-rise" style={{ ['--i' as string]: 0 }} aria-label="Total sales">
        <div className="flex flex-col justify-between gap-6 min-w-0">
          <div>
            <p className="text-sm rep-muted" title="COD balance plus advance paid. Older orders without an advance count only their COD amount.">Total sales</p>
            <p className="text-5xl sm:text-6xl font-bold k-display leading-none mt-2 md:mt-3 tabular-nums">{inr(report.sales)}</p>
          </div>
          <dl className="grid grid-cols-3 lg:grid-cols-1 gap-4 text-sm">
            <div><dt className="rep-muted">Orders</dt><dd className="text-xl font-bold tabular-nums">{report.count}</dd></div>
            <div><dt className="rep-muted">Average order</dt><dd className="text-xl font-bold tabular-nums">{inr(report.avg)}</dd></div>
            <div><dt className="rep-muted">Best day</dt><dd className="text-xl font-bold tabular-nums">{report.best.sales > 0 ? niceDay(report.best.date) : 'None yet'}</dd></div>
          </dl>
        </div>

        {report.count === 0 ? (
          <p className="rep-muted text-sm self-center">No orders in this period. Try a longer one.</p>
        ) : (
          <div className="min-w-0">
            <div ref={chartRef} className="relative h-36 sm:h-64 select-none" onPointerMove={onChartMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Daily sales for ${days} days, highest ${inr(report.maxSales)}`}>
              <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="repArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--hl)" stopOpacity="0.38" /><stop offset="100%" stopColor="var(--hl)" stopOpacity="0" /></linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={CW} y1={CH * f} y2={CH * f} stroke="currentColor" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />)}
                <path d={chart.area} fill="url(#repArea)" />
                <path d={chart.line} fill="none" stroke="var(--hl)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {hover !== null && (
                <>
                  <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${chart.xs[hover] / CW * 100}%`, background: 'currentColor', opacity: 0.35 }} />
                  <div className="absolute w-3 h-3 rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ left: `${chart.xs[hover] / CW * 100}%`, top: `${chart.ys[hover] / CH * 100}%`, background: 'var(--hl)', boxShadow: '0 0 0 4px var(--hl-soft)' }} />
                  <div className="absolute z-10 pointer-events-none rounded-xl px-3 py-2 text-xs shadow-lg whitespace-nowrap" style={{ top: 0, left: `${chart.xs[hover] / CW * 100}%`, transform: `translateX(${hover / Math.max(days - 1, 1) > 0.75 ? '-105%' : hover / Math.max(days - 1, 1) < 0.25 ? '5%' : '-50%'})`, background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                    <p className="font-bold">{niceDay(report.series[hover].date)}</p>
                    <p className="tabular-nums">{inr(report.series[hover].sales)} · {report.series[hover].orders} order{report.series[hover].orders === 1 ? '' : 's'}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-between text-xs rep-muted mt-2 tabular-nums">
              <span>{niceDay(report.series[0].date)}</span>
              {days > 2 && <span>{niceDay(report.series[Math.floor(days / 2)].date)}</span>}
              <span>{niceDay(report.series[days - 1].date)}</span>
            </div>
          </div>
        )}
      </section>

      {/* Three different views of the same orders */}
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="k-card p-6" aria-label="Orders by weekday">
          <h3 className="font-bold k-display">Busiest days of the week</h3>
          <p className="text-xs k-muted mt-0.5">Orders placed on each weekday</p>
          <div className="flex items-end gap-2 h-36 mt-5" role="img" aria-label={report.weekdays.map((d) => `${d.label} ${d.count}`).join(', ')}>
            {report.weekdays.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5" title={`${d.label}: ${d.count} orders`}>
                <span className="text-xs font-bold tabular-nums">{d.count}</span>
                <div className="w-full rounded-t-lg" style={{ height: `${Math.max((d.count / report.maxWeekday) * 100, d.count > 0 ? 6 : 1.5)}%`, background: d.count === report.maxWeekday && d.count > 0 ? 'var(--lime)' : 'var(--card2)', border: d.count === report.maxWeekday ? 'none' : '1px solid var(--line)' }} />
                <span className="text-xs k-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="k-card2 rounded-[28px] p-6 flex flex-col" aria-label="How customers paid">
          <h3 className="font-bold k-display">How customers paid</h3>
          <p className="text-xs k-muted mt-0.5">Cash on delivery against prepaid</p>
          <div className="relative mx-auto mt-4 w-44 h-24 overflow-hidden" role="img" aria-label={`${report.cod} cash on delivery, ${report.count - report.cod} prepaid`}>
            <svg viewBox="0 0 120 64" className="w-full h-full">
              <path d="M10 60 A50 50 0 0 1 110 60" fill="none" strokeWidth="14" className="k-stroke-line" />
              <path d="M10 60 A50 50 0 0 1 110 60" fill="none" strokeWidth="14" stroke="var(--lime)" strokeDasharray={`${(codShare / 100) * 157} 157`} />
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center"><span className="text-3xl font-bold k-display tabular-nums">{codShare}%</span></div>
          </div>
          <dl className="grid grid-cols-2 gap-3 mt-auto pt-5 text-sm">
            <div><dd className="text-2xl font-bold k-display tabular-nums">{report.cod}</dd><dt className="text-xs k-muted">cash on delivery</dt></div>
            <div><dd className="text-2xl font-bold k-display tabular-nums">{report.count - report.cod}</dd><dt className="text-xs k-muted">prepaid</dt></div>
          </dl>
        </section>

        <section className="k-card p-6" aria-label="Order sizes">
          <h3 className="font-bold k-display">Order size</h3>
          <p className="text-xs k-muted mt-0.5">Smallest, average and biggest order</p>
          <div className="mt-6 relative h-12">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full k-track" />
            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full k-bar" style={{ left: '0%', right: '0%' }} />
            <span className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full" style={{ left: '0%', background: 'var(--ink)' }} />
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full" style={{ left: `${report.sizeSpan > 0 ? ((report.avg - report.minValue) / report.sizeSpan) * 100 : 50}%`, background: 'var(--lime)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--lime) 28%, transparent)' }} />
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-full w-3.5 h-3.5 rounded-full" style={{ left: '100%', background: 'var(--ink)' }} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm mt-1">
            <div><dd className="font-bold tabular-nums">{inr(report.minValue)}</dd><dt className="text-xs k-muted">smallest</dt></div>
            <div className="text-center"><dd className="font-bold tabular-nums">{inr(report.avg)}</dd><dt className="text-xs k-muted">average</dt></div>
            <div className="text-right"><dd className="font-bold tabular-nums">{inr(report.maxValue)}</dd><dt className="text-xs k-muted">biggest</dt></div>
          </dl>
          <p className="text-xs k-muted mt-5">Based on {report.valued} order{report.valued === 1 ? '' : 's'} with an amount saved.</p>
        </section>
      </div>

      {/* Pipeline: where every order is right now */}
      <section className="k-card p-6" aria-label="Orders by status">
        <div className="flex items-baseline justify-between gap-3 flex-wrap"><h3 className="font-bold k-display">Where the orders stand</h3><p className="text-sm k-muted tabular-nums">{report.count} orders</p></div>
        {report.status.length === 0 ? <p className="text-sm k-muted mt-4">No orders in this period.</p> : (
          <>
            <div className="flex h-11 rounded-2xl overflow-hidden gap-1 mt-5" role="img" aria-label={report.status.map((x) => `${x.value} ${x.label}`).join(', ')}>
              {report.status.map((x) => (
                <div key={x.label} className="flex items-center justify-center text-xs font-bold overflow-hidden px-1" style={{ flex: x.value, background: x.color, color: '#0b0d0a', minWidth: x.value > 0 ? 6 : 0 }} title={`${x.label}: ${x.value}`}>
                  {x.value / report.count > 0.07 && <span className="truncate tabular-nums">{x.value}</span>}
                </div>
              ))}
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 mt-5">
              {report.status.map((x) => (
                <li key={x.label} className="flex items-start gap-2 text-sm min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: x.color }} />
                  <span className="min-w-0"><span className="block truncate">{x.label}</span><span className="block text-xs k-muted tabular-nums">{x.value} · {Math.round((x.value / report.count) * 100)}%</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Best sellers: ranked tiles */}
      <section aria-label="Best sellers">
        <h3 className="font-bold k-display mb-3 px-1">Best sellers</h3>
        {report.products.length === 0 ? <div className="k-card p-6 text-sm k-muted">No sales in this period.</div> : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.products.map((p, i) => (
              <li key={p.name} className={`relative overflow-hidden p-5 ${i === 0 ? 'k-card' : 'k-card2 rounded-[24px]'}`}>
                <span className="absolute -right-1 -top-4 text-8xl font-bold k-display leading-none select-none pointer-events-none" style={{ color: 'var(--ink)', opacity: 0.06 }} aria-hidden="true">{i + 1}</span>
                <p className="text-sm k-muted">#{i + 1}</p>
                <p className="font-bold text-lg leading-snug mt-1 pr-8">{p.name}</p>
                <p className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-bold k-display tabular-nums leading-none">{p.units}</span><span className="text-sm k-muted">units · {Math.round((p.units / report.totalUnits) * 100)}% of sales</span></p>
                <div className="h-1.5 rounded-full k-track mt-3 overflow-hidden"><div className="h-full rounded-full k-bar" style={{ width: `${(p.units / maxUnits) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stock now */}
      <section className="k-card2 rounded-[28px] px-6 py-5 flex flex-wrap items-center gap-x-10 gap-y-4" aria-label="Stock right now">
        <p className="font-bold k-display">Stock right now</p>
        <p className="text-sm"><span className="text-2xl font-bold k-display tabular-nums mr-2">{stock.units.toLocaleString('en-IN')}</span><span className="k-muted">units ready</span></p>
        <p className="text-sm"><span className="text-2xl font-bold k-display tabular-nums mr-2">{stock.low}</span><span className="k-muted">running low ({LOW_STOCK} or fewer)</span></p>
        <p className="text-sm"><span className="text-2xl font-bold k-display tabular-nums mr-2">{stock.out}</span><span className="k-muted">out of stock</span></p>
      </section>

      {/* Latest orders */}
      <section className="k-card overflow-hidden" aria-label="Orders in this period">
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b k-rule">
          <h3 className="font-bold k-display">Orders in this period <span className="k-muted font-normal">{report.count}</span></h3>
          {onOpenOrders && <button onClick={onOpenOrders} className="k-btn k-btn-soft px-4 py-2 text-sm">Open all orders</button>}
        </div>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm k-muted">No orders in this period.</p>
        ) : (
          <ul>
            {rows.map((o) => (
              <li key={o.id} className="k-row border-t k-rule first:border-t-0 px-5 py-3 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[6rem_minmax(0,1.3fr)_minmax(0,1.3fr)_6rem_6.5rem] gap-x-4 gap-y-1 items-center">
                <span className="hidden md:block text-sm k-muted tabular-nums">{niceDay(dayKey(new Date(o.createdAt)))}</span>
                <div className="min-w-0"><p className="font-semibold truncate">{o.customer.name}</p><p className="text-xs k-muted font-mono truncate">{o.id}</p></div>
                <p className="hidden md:block text-sm truncate" title={o.item.productName}>{o.item.productName}</p>
                <p className="text-sm font-bold tabular-nums md:text-right">{orderValue(o) > 0 ? inr(orderValue(o)) : o.paymentType === 'COD' ? inr(0) : <span className="k-muted font-semibold">Prepaid</span>}</p>
                <span className="justify-self-end md:justify-self-center rounded-full px-3 py-1 text-xs font-bold text-center" style={statusPill(o.status)}>{o.status}</span>
              </li>
            ))}
          </ul>
        )}
        {report.count > PAGE_SIZE && (
          <nav className="px-5 py-3 border-t k-rule flex items-center justify-between gap-3 flex-wrap" aria-label="Order pages">
            <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, report.count)} of {report.count}</p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className="k-btn k-btn-ghost w-9 h-9"><ChevronLeft className="w-4 h-4" /></button>
              {pageList(current, lastPage).map((n, i) => n === '…'
                ? <span key={`gap-${i}`} className="w-6 text-center k-muted" aria-hidden="true">…</span>
                : <button key={n} onClick={() => setPage(n)} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} className={`k-btn w-9 h-9 text-sm ${n === current ? 'k-btn-ink' : 'k-btn-ghost'}`}>{n}</button>)}
              <button onClick={() => setPage(current + 1)} disabled={current === lastPage} aria-label="Next page" className="k-btn k-btn-ghost w-9 h-9"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
};

export default ReportsView;
