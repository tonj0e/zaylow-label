import { canonicalProduct } from '../../utils/productNames';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, CompanySettings, OrderStatus } from '../../types';
import { DataService } from '../../services/dataService';
import { useCached } from '../../hooks/useCached';
import { TrackingScannerModal } from '../orders/TrackingScannerModal';
import { orderValue } from '../../utils/orderValue';
import {
  Printer,
  ArrowRight,
  ArrowUpRight,
  Zap,
  MapPin,
  PackageCheck,
  PackageX,
  IndianRupee,
  Layers,
  AlertTriangle,
  ScanLine,
  Search,
  Target,
  Undo2,
  Timer,
  Truck,
  Hourglass,
  X,
} from 'lucide-react';

interface DashboardViewProps {
  orders: Order[];
  settings: CompanySettings;
  onNavigateToOrders: () => void;
  onNavigateToGenerator: (order?: Order) => void;
  onNavigateToBulk: () => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateTracking: (id: string, trackingNumber: string, shippingLabelUrl: string | null) => void;
}

interface StockRow {
  product_name: string;
  available: number;
  total_in: number;
  sold: number;
}

type Tab = 'overview' | 'sales' | 'stock';
type Range = 7 | 30;

const STATUS_DOT: Record<string, string> = {
  Pending: '#f5a623',
  Processing: '#8d9690',
  'Label Generated': '#b4bdb6',
  Printed: '#86efac',
  Shipped: '#22c55e',
  Delivered: '#15803d',
  Cancelled: '#ff5a45',
  Claims: '#fbbf24',
  Returned: '#fb923c',
};

const DAY = 86_400_000;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const norm = (s: string) => (s || '').trim().toLowerCase();
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const useCountUp = (target: number, ms = 900) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
};

const Count: React.FC<{ value: number; money?: boolean }> = ({ value, money }) => {
  const v = useCountUp(value);
  return <>{money ? inr(v) : Math.round(v).toLocaleString('en-IN')}</>;
};

const smoothPath = (pts: [number, number][]) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
};

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const max = Math.max(1, ...values);
  const pts: [number, number][] = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * 100, 26 - (v / max) * 22]);
  const line = smoothPath(pts);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-24 h-8" aria-hidden>
      <path d={`${line} L100,30 L0,30 Z`} className="k-fill-lime" opacity="0.14" />
      <path d={line} fill="none" strokeWidth="1.8" vectorEffect="non-scaling-stroke" className="k-stroke-lime dash-draw" pathLength={1} />
    </svg>
  );
};

const AreaChart: React.FC<{
  current: { label: string; value: number }[];
  previous: number[];
  unit: string;
  money?: boolean;
}> = ({ current, previous, unit, money }) => {
  const W = 720, H = 240, PL = 36, PB = 26, PT = 12, PR = 8;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const max = Math.max(1, ...current.map((c) => c.value), ...previous);
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const x = (i: number) => PL + (i / Math.max(1, current.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / niceMax) * (H - PT - PB);
  const cur: [number, number][] = current.map((c, i) => [x(i), y(c.value)]);
  const prev: [number, number][] = previous.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(cur);
  const step = Math.ceil(current.length / 6);
  const fmt = (n: number) => (money ? inr(n) : n.toLocaleString('en-IN'));

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PL) / (W - PL - PR)) * (current.length - 1));
    setHover(Math.max(0, Math.min(current.length - 1, i)));
  };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${unit} per day, current period against previous period`}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--lime)', stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: 'var(--lime)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={y(niceMax * f)} y2={y(niceMax * f)} className="k-stroke-line" strokeDasharray="2 4" />
            <text x={PL - 8} y={y(niceMax * f) + 3} textAnchor="end" className="k-fill-muted text-[10px]">{Math.round(niceMax * f)}</text>
          </g>
        ))}
        <path d={`${line} L${x(current.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#areaFill)" className="fade-in" />
        <path d={smoothPath(prev)} fill="none" strokeWidth="1.5" strokeDasharray="4 4" className="k-stroke-muted" />
        <path d={line} fill="none" strokeWidth="2.6" strokeLinecap="round" pathLength={1} className="k-stroke-lime dash-draw" />
        {current.map((c, i) => (i % step === 0 || i === current.length - 1) && (
          <text key={c.label} x={x(i)} y={H - 6} textAnchor={i === current.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="k-fill-muted text-[10px]">{c.label}</text>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} className="k-stroke-lime" strokeOpacity="0.4" />
            <circle cx={x(hover)} cy={y(current[hover].value)} r="5" className="k-fill-card k-stroke-lime" strokeWidth="2.6" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 rounded-xl px-3 py-2 text-xs shadow-lg whitespace-nowrap k-tip"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="font-bold">{current[hover].label}</p>
          <p>{fmt(current[hover].value)} {money ? '' : unit}</p>
          <p className="opacity-60">Before: {fmt(previous[hover] ?? 0)}</p>
        </div>
      )}
    </div>
  );
};

const Gauge: React.FC<{ pct: number }> = ({ pct }) => {
  const R = 70, C = Math.PI * R;
  const shown = useCountUp(pct);
  return (
    <div className="relative w-full max-w-[220px] mx-auto">
      <svg viewBox="0 0 180 100" className="w-full" aria-hidden>
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" strokeWidth="14" strokeLinecap="round" className="k-stroke-line" />
        <path d="M20,90 A70,70 0 0 1 160,90" fill="none" strokeWidth="14" strokeLinecap="round" className="k-stroke-lime" strokeDasharray={`${(shown / 100) * C} ${C}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <p className="k-display text-4xl font-bold">{shown.toFixed(1)}%</p>
      </div>
    </div>
  );
};

const GoalRing: React.FC<{ done: number; goal: number; onGoal: (n: number) => void }> = ({ done, goal, onGoal }) => {
  const R = 52, C = 2 * Math.PI * R;
  const pct = Math.min(1, done / Math.max(1, goal));
  const shown = useCountUp(pct * 100);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(goal));
  return (
    <div className="flex items-center gap-5">
      <div className="relative w-32 h-32 shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="11" className="k-stroke-line" />
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="11" strokeLinecap="round" className="k-stroke-lime" strokeDasharray={`${(shown / 100) * C} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="k-display text-3xl font-bold leading-none">{done}</p>
          <p className="text-xs k-muted">of {goal}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm k-muted">{done >= goal ? 'Goal reached. Everything from here is extra.' : `${goal - done} more to reach today's goal.`}</p>
        {editing ? (
          <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseInt(val, 10); if (n > 0) onGoal(n); setEditing(false); }}>
            <input autoFocus type="number" min={1} value={val} onChange={(e) => setVal(e.target.value)} aria-label="Daily order goal" className="w-20 rounded-lg px-2 py-1 text-sm k-input" />
            <button className="k-btn-lime rounded-lg px-3 py-1 text-xs font-bold">Save</button>
          </form>
        ) : (
          <button onClick={() => { setVal(String(goal)); setEditing(true); }} className="mt-3 text-sm font-semibold k-lime-text flex items-center gap-1">Change goal <ArrowUpRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
};

const DONUT_COLORS = ['var(--lime)', 'var(--ink)', '#4f9bff', 'var(--warn)', '#a78bfa', 'var(--muted)'];

/* ring chart: slices draw in once; numbers in the middle stay plain text */
const Donut: React.FC<{ parts: { label: string; value: number; color: string }[]; center: string; caption: string }> = ({ parts, center, caption }) => {
  const R = 52, C = 2 * Math.PI * R, GAP = 3;
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  let offset = 0;
  return (
    <div className="relative w-40 h-40 shrink-0" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="16" className="k-stroke-line" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = Math.max(0, (p.value / total) * C - (parts.length > 1 ? GAP : 0));
          const el = (
            <circle key={p.label} cx="70" cy="70" r={R} fill="none" strokeWidth="16" stroke={p.color}
              strokeDasharray={`${ready ? len : 0} ${C}`} strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray .9s cubic-bezier(.22,1,.36,1)' }} />
          );
          offset += (p.value / total) * C;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="k-display text-3xl font-bold leading-none">{center}</p>
        <p className="text-xs k-muted mt-1">{caption}</p>
      </div>
    </div>
  );
};

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`rounded-lg k-skel animate-pulse ${className}`} />;

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  settings,
  onNavigateToOrders,
  onNavigateToGenerator,
  onNavigateToBulk,
  onUpdateStatus,
  onUpdateTracking,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>(30);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [goal, setGoalState] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('zaylow_daily_goal') || '', 10) || 20; } catch { return 20; }
  });
  const setGoal = (n: number) => {
    setGoalState(n);
    try { localStorage.setItem('zaylow_daily_goal', String(n)); } catch { /* storage unavailable */ }
  };

  const { data: overview } = useCached('inventory-overview', () => DataService.getInventoryOverview());
  const stock: StockRow[] | null = overview ? (overview.stock as StockRow[]) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const m = useMemo(() => {
    const now = Date.now();
    const live = orders.filter((o) => o.status !== 'Cancelled');
    const count = (...s: string[]) => orders.filter((o) => s.includes(o.status)).length;
    const today = new Date();

    const build = (offset: number, len: number) => {
      const rows: { key: string; label: string; orders: number; cod: number; sales: number }[] = [];
      for (let i = len - 1 + offset; i >= offset; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        rows.push({ key: dayKey(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), orders: 0, cod: 0, sales: 0 });
      }
      const map = new Map(rows.map((r) => [r.key, r]));
      live.forEach((o) => {
        const r = map.get(dayKey(new Date(o.createdAt)));
        if (r) { r.orders += 1; r.sales += orderValue(o); if (o.paymentType === 'COD') r.cod += o.codAmount; }
      });
      return rows;
    };

    const cur = build(0, range);
    const prev = build(range, range);
    const spark = build(0, 14);
    const inRange = new Set(cur.map((c) => c.key));
    const rangeOrders = live.filter((o) => inRange.has(dayKey(new Date(o.createdAt))));
    const allInRange = orders.filter((o) => inRange.has(dayKey(new Date(o.createdAt))));

    const byState: Record<string, { n: number; cod: number }> = {};
    rangeOrders.forEach((o) => {
      const s = (o.customer.state || 'Unknown').trim() || 'Unknown';
      byState[s] = byState[s] || { n: 0, cod: 0 };
      byState[s].n += 1;
      if (o.paymentType === 'COD') byState[s].cod += o.codAmount;
    });

    const statusCounts: Record<string, number> = {};
    orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
    const courier: Record<string, number> = {};
    rangeOrders.forEach((o) => { courier[o.courier] = (courier[o.courier] || 0) + 1; });

    // Return rate and delivery speed per courier (range orders, including returned)
    const perCourier: Record<string, { delivered: number; returned: number; days: number[] }> = {};
    allInRange.forEach((o) => {
      const c = (perCourier[o.courier] = perCourier[o.courier] || { delivered: 0, returned: 0, days: [] });
      if (o.status === 'Delivered') {
        c.delivered += 1;
        if (o.warrantyStart) {
          const d = (new Date(o.warrantyStart).getTime() - new Date(o.createdAt).getTime()) / DAY;
          if (d >= 0 && d <= 60) c.days.push(d);
        }
      }
      if (o.status === 'Returned') c.returned += 1;
    });
    const returnRows = Object.entries(perCourier)
      .map(([name, v]) => ({ name, delivered: v.delivered, returned: v.returned, rate: v.delivered + v.returned > 0 ? v.returned / (v.delivered + v.returned) : null }))
      .filter((r) => r.delivered + r.returned > 0)
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
    const speedRows = Object.entries(perCourier)
      .filter(([, v]) => v.days.length > 0)
      .map(([name, v]) => ({ name, avg: v.days.reduce((s, n) => s + n, 0) / v.days.length, n: v.days.length }))
      .sort((a, b) => a.avg - b.avg);

    // COD money tracker
    const codOf = (list: Order[]) => list.filter((o) => o.paymentType === 'COD').reduce((s, o) => s + o.codAmount, 0);
    const onTheRoad = codOf(orders.filter((o) => o.status === 'Shipped'));
    const waiting = codOf(orders.filter((o) => ['Pending', 'Processing', 'Label Generated', 'Printed'].includes(o.status)));
    const collected = codOf(allInRange.filter((o) => o.status === 'Delivered'));
    const lost = codOf(allInRange.filter((o) => o.status === 'Returned'));

    // Problems
    const stuckPrinted = orders.filter((o) => o.status === 'Printed' && now - new Date(o.printedAt || o.createdAt).getTime() > 2 * DAY).length;
    const longTransit = orders.filter((o) => o.status === 'Shipped' && now - new Date(o.createdAt).getTime() > 10 * DAY).length;
    const claimsReturns = count('Claims', 'Returned');

    // 7-day product demand for stock runway
    const demand: Record<string, number> = {};
    live.forEach((o) => {
      if (now - new Date(o.createdAt).getTime() <= 7 * DAY) {
        const k = norm(canonicalProduct(o.item.productName));
        demand[k] = (demand[k] || 0) + (o.item.quantity || 1);
      }
    });

    const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
    const curTotal = sum(cur.map((c) => c.orders));
    const prevTotal = sum(prev.map((c) => c.orders));
    const cod = rangeOrders.filter((o) => o.paymentType === 'COD');

    return {
      toPrint: count('Pending', 'Processing', 'Label Generated'),
      readyToShip: count('Printed'),
      inTransit: count('Shipped'),
      cur, prev, spark,
      today: cur[cur.length - 1],
      curTotal,
      trend: prevTotal > 0 ? Math.round(((curTotal - prevTotal) / prevTotal) * 100) : null,
      codTotal: sum(cur.map((c) => c.cod)),
      salesTotal: sum(cur.map((c) => c.sales)),
      avgCod: cod.length ? sum(cod.map((o) => o.codAmount)) / cod.length : 0,
      prepaid: rangeOrders.length - cod.length,
      codCount: cod.length,
      states: Object.entries(byState).sort((a, b) => b[1].n - a[1].n).slice(0, 5),
      statusCounts: Object.entries(statusCounts).sort((a, b) => b[1] - a[1]),
      courier: Object.entries(courier).sort((a, b) => b[1] - a[1]),
      rangeCount: rangeOrders.length,
      returnRows, speedRows, onTheRoad, waiting, collected, lost,
      stuckPrinted, longTransit, claimsReturns, demand,
    };
  }, [orders, range]);

  const totalIn = (stock || []).reduce((s, r) => s + r.total_in, 0);
  const totalAvail = (stock || []).reduce((s, r) => s + r.available, 0);
  const healthPct = totalIn > 0 ? (totalAvail / totalIn) * 100 : 0;
  const outOfStock = (stock || []).filter((s) => s.available === 0).length;
  const stockSlices = useMemo(() => {
    const live = (stock || []).filter((s) => s.available > 0).sort((a, b) => b.available - a.available);
    const top = live.slice(0, 5).map((s, i) => ({ label: s.product_name, value: s.available, color: DONUT_COLORS[i] }));
    const rest = live.slice(5).reduce((n, s) => n + s.available, 0);
    return rest > 0 ? [...top, { label: 'Other products', value: rest, color: DONUT_COLORS[5] }] : top;
  }, [stock]);

  const runway = useMemo(() => {
    return (stock || [])
      .map((s) => {
        const sold7 = m.demand[norm(s.product_name)] || 0;
        const perDay = sold7 / 7;
        return { ...s, perDay, days: perDay > 0 ? s.available / perDay : null as number | null };
      })
      .sort((a, b) => {
        if (a.available === 0 && b.available !== 0) return -1;
        if (b.available === 0 && a.available !== 0) return 1;
        if (a.days === null && b.days === null) return a.available - b.available;
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });
  }, [stock, m.demand]);

  const problems = [
    { n: m.stuckPrinted, text: 'printed more than 2 days ago, not shipped', icon: Printer },
    { n: m.longTransit, text: 'shipped over 10 days ago, not delivered', icon: Truck },
    { n: m.claimsReturns, text: 'claims or returns to handle', icon: Undo2 },
    { n: outOfStock, text: 'products out of stock', icon: PackageX },
  ].filter((p) => p.n > 0);

  const recent = orders.slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return orders.slice(0, 6);
    return orders
      .filter((o) => [o.id, o.customer.name, o.customer.phone, o.customer.city, o.trackingNumber || ''].some((f) => norm(f).includes(q)))
      .slice(0, 8);
  }, [orders, query]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sales', label: 'Sales' },
    { id: 'stock', label: 'Stock health' },
  ];

  const rangeToggle = (
    <div className="flex rounded-full p-0.5 k-card2">
      {([7, 30] as Range[]).map((r) => (
        <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={`px-3 py-1 rounded-full text-xs font-semibold ${range === r ? 'k-btn-lime' : 'k-muted'}`}>{r} days</button>
      ))}
    </div>
  );

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 space-y-5 pb-12 select-none">

      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="k-display text-2xl sm:text-4xl font-bold">{greeting}, {settings.companyName || 'ZAYLOW'}</h2>
          <p className="text-sm k-muted mt-1">
            {m.toPrint > 0
              ? `${m.toPrint} ${m.toPrint === 1 ? 'order needs' : 'orders need'} a label. ${m.readyToShip} ${m.readyToShip === 1 ? 'parcel is' : 'parcels are'} ready to ship.`
              : `No labels waiting. ${m.readyToShip} ${m.readyToShip === 1 ? 'parcel is' : 'parcels are'} ready to ship.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap max-md:grid max-md:grid-cols-2">
          <div role="tablist" aria-label="Dashboard sections" className="k-card p-1 flex rounded-full max-md:col-span-2" style={{ borderRadius: 999 }}>
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap max-md:flex-1 max-md:px-2 ${tab === t.id ? 'k-btn-lime' : 'k-muted hover:opacity-80'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={() => setSearchOpen(true)} className="k-btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-2 max-md:justify-center">
            <Search className="w-4 h-4" /> Search <kbd className="hidden sm:inline text-[10px] k-muted rounded px-1.5 py-0.5 k-card2">Ctrl K</kbd>
          </button>
          <button onClick={onNavigateToBulk} className="k-btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 max-md:justify-center">
            <Zap className="w-4 h-4 k-lime-text" /> Bulk import
          </button>
          <button onClick={() => setScannerOpen(true)} className="k-btn-lime rounded-full px-5 py-3 text-sm font-bold flex items-center gap-2 shadow-lg max-md:col-span-2 max-md:justify-center" style={{ boxShadow: '0 8px 24px -8px var(--lime)' }}>
            <ScanLine className="w-4 h-4" /> Scan to ship
          </button>
        </div>
      </header>

      {/* problems strip */}
      {tab === 'overview' && (
      <section aria-label="Things that need attention" className="hidden md:block k-card p-4 md:p-5 k-hot">
        {problems.length === 0 ? (
          <p className="text-sm font-semibold k-lime-text flex items-center gap-2"><PackageCheck className="w-4 h-4" /> Nothing is stuck. No delays, claims or empty shelves.</p>
        ) : (
          <>
            <p className="k-display text-xl font-bold mb-3">Needs attention</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {problems.map((p) => (
                <li key={p.text}>
                  <button onClick={onNavigateToOrders} className="w-full text-left rounded-2xl k-card2 p-3 flex items-center gap-3 hover:opacity-85">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center k-btn-ghost k-warn"><p.icon className="w-5 h-5" /></span>
                    <span className="min-w-0"><span className="k-display text-2xl font-bold k-warn block leading-none">{p.n}</span><span className="text-xs k-muted block mt-0.5">{p.text}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      )}

      <div key={tab} className="tab-panel space-y-5">
        {tab === 'overview' && (<>
          <div className="md:hidden space-y-3">
            <section className="grid grid-cols-2 gap-3" aria-label="Today and sales">
              <div className="k-card p-4">
                <p className="text-xs k-muted flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Orders today</p>
                <p className="k-display text-5xl font-bold leading-none mt-3"><Count value={m.today.orders} /></p>
                <p className="text-xs k-muted mt-2">{inr(m.today.sales)} in sales</p>
              </div>
              <div className="k-card p-4">
                <p className="text-xs k-muted flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5" /> Sales, last {range} days</p>
                <p className="k-display text-3xl font-bold leading-none mt-3"><Count value={m.salesTotal} money /></p>
                <p className="text-xs k-muted mt-2">{inr(m.codTotal)} to collect</p>
              </div>
            </section>
            <section className="k-card p-4" aria-label="Orders per day">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div>
                  <h3 className="k-display text-xl font-bold">Orders per day</h3>
                  <p className="text-xs k-muted">{m.curTotal} orders{m.trend !== null && <span className={`font-semibold ${m.trend >= 0 ? 'k-lime-text' : 'k-bad'}`}> {m.trend >= 0 ? '+' : ''}{m.trend}%</span>}</p>
                </div>
                {rangeToggle}
              </div>
              <AreaChart key={range} current={m.cur.map((c) => ({ label: c.label, value: c.orders }))} previous={m.prev.map((c) => c.orders)} unit="orders" />
            </section>
            {problems.length > 0 && (
              <section aria-label="Things that need attention">
                <p className="text-sm font-semibold mb-2 px-1">Needs a look</p>
                <ul className="flex gap-2 overflow-x-auto snap-x scroll-pl-3 -mx-3 px-3 pb-1 snap-row">
                  {problems.map((p) => (
                    <li key={p.text} className="snap-start shrink-0">
                      <button onClick={onNavigateToOrders} className="k-card rounded-2xl px-3 py-2.5 flex items-center gap-2.5 min-w-[11rem] text-left">
                        <p.icon className="w-5 h-5 k-warn shrink-0" />
                        <span><span className="k-display text-xl font-bold k-warn block leading-none">{p.n}</span><span className="text-[11px] k-muted block mt-0.5 leading-tight">{p.text}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <section className="hidden md:grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4" aria-label="Key numbers">
            <div className="k-card p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm k-muted"><Layers className="w-4 h-4" /> Orders today</div>
              <div className="flex items-end justify-between mt-3 gap-2">
                <p className="k-display text-5xl font-bold leading-none"><Count value={m.today.orders} /></p>
                <Sparkline values={m.spark.map((s) => s.orders)} />
              </div>
              <p className="text-xs k-muted mt-2">{inr(m.today.sales)} in sales</p>
            </div>
            <div className="k-card p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm k-muted"><Printer className="w-4 h-4" /> Labels to print</div>
              <p className="k-display text-5xl font-bold leading-none mt-3"><Count value={m.toPrint} /></p>
              <p className="text-xs k-muted mt-2">Pending, processing, label generated</p>
            </div>
            <div className="k-card p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm k-muted"><PackageCheck className="w-4 h-4" /> Ready to ship</div>
              <p className="k-display text-5xl font-bold leading-none mt-3 k-lime-text"><Count value={m.readyToShip} /></p>
              <p className="text-xs k-muted mt-2">{m.inTransit} already with the courier</p>
            </div>
            <div className="k-card p-4 md:p-5">
              <div className="flex items-center gap-2 text-sm k-muted"><IndianRupee className="w-4 h-4" /> Sales, last {range} days</div>
              <p className="k-display text-4xl font-bold leading-none mt-3"><Count value={m.salesTotal} money /></p>
              <p className="text-xs k-muted mt-2">{inr(m.codTotal)} still to collect on delivery</p>
            </div>
          </section>
        </>)}

        {tab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="k-card p-5 xl:col-span-2 max-md:hidden">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div>
                  <h3 className="k-display text-2xl font-bold">Orders per day</h3>
                  <p className="text-sm k-muted">
                    {m.curTotal} orders
                    {m.trend !== null && <span className={`font-semibold ${m.trend >= 0 ? 'k-lime-text' : 'k-bad'}`}> {m.trend >= 0 ? '+' : ''}{m.trend}% </span>}
                    {m.trend !== null && 'against the previous period'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden sm:flex items-center gap-1.5 text-xs k-muted"><span className="w-4 h-0.5 rounded k-bar" /> This period <span className="w-4 border-t border-dashed ml-2 k-rule" /> Before</span>
                  {rangeToggle}
                </div>
              </div>
              <AreaChart key={range} current={m.cur.map((c) => ({ label: c.label, value: c.orders }))} previous={m.prev.map((c) => c.orders)} unit="orders" />
            </section>

            <div className="space-y-4">
              <section className="k-card p-5">
                <h3 className="k-display text-2xl font-bold flex items-center gap-2"><Target className="w-5 h-5 k-lime-text" /> Today's goal</h3>
                <div className="mt-3"><GoalRing done={m.today.orders} goal={goal} onGoal={setGoal} /></div>
              </section>
              <section className="k-card p-5">
                <h3 className="k-display text-2xl font-bold">Stock on the shelf</h3>
                {stock === null ? <Skeleton className="h-24 w-full mt-3" /> : <div className="mt-2"><Gauge pct={healthPct} /></div>}
                <div className="flex justify-between text-sm mt-3">
                  <span className="k-muted">{totalAvail.toLocaleString('en-IN')} in stock of {totalIn.toLocaleString('en-IN')} received</span>
                  <button onClick={() => setTab('stock')} className="font-semibold k-lime-text flex items-center gap-1">Details <ArrowUpRight className="w-4 h-4" /></button>
                </div>
              </section>
            </div>

            <section className="k-card p-5 xl:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="k-display text-2xl font-bold">Latest orders</h3>
                <button onClick={onNavigateToOrders} className="text-sm font-semibold k-lime-text flex items-center gap-1">View all <ArrowUpRight className="w-4 h-4" /></button>
              </div>
              {recent.length === 0 ? (
                <p className="text-sm k-muted py-8 text-center">No orders yet. Press New Order to add the first one.</p>
              ) : (
                <ul>
                  {recent.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-3 border-t k-rule first:border-t-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT[o.status] || '#94a3b8' }} title={o.status} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{o.customer.name} <span className="font-normal k-muted ml-1">{o.id}</span></p>
                        <p className="text-xs k-muted flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{o.customer.city}, {o.customer.pinCode} · {o.courier} · {o.status}</p>
                      </div>
                      <p className="text-sm font-semibold hidden sm:block">{o.paymentType === 'COD' ? inr(o.codAmount) : 'Prepaid'}</p>
                      <button onClick={() => onNavigateToGenerator(o)} aria-label={`Print label for ${o.id}`} className="w-9 h-9 rounded-full flex items-center justify-center k-card2 k-lime-text hover:opacity-80">
                        <Printer className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold">Where orders go</h3>
              <p className="text-sm k-muted mb-4">Top states, last {range} days</p>
              {m.states.length === 0 && <p className="text-sm k-muted">No orders in this period.</p>}
              <ol className="space-y-4">
                {m.states.map(([state, v], i) => (
                  <li key={state}>
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'k-btn-lime' : 'k-card2 k-muted'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{state}</p><p className="text-xs k-muted">{v.n} orders</p></div>
                      <p className="text-sm font-semibold">{inr(v.cod)}</p>
                    </div>
                    <div className="h-1 rounded-full k-track mt-2 overflow-hidden"><div className="h-full rounded-full k-bar bar-grow" style={{ width: `${(v.n / m.states[0][1].n) * 100}%` }} /></div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}

        {tab === 'sales' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="k-card p-5 xl:col-span-3">
              <h3 className="k-display text-2xl font-bold mb-1">Where your COD money is</h3>
              <p className="text-sm k-muted mb-4">Cash-on-delivery amounts only. On the road is all-time; the rest are orders from the last {range} days.</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Waiting to ship', value: m.waiting, icon: Hourglass, cls: '' },
                  { label: 'On the road', value: m.onTheRoad, icon: Truck, cls: '' },
                  { label: 'Delivered, collectable', value: m.collected, icon: PackageCheck, cls: 'k-lime-text' },
                  { label: 'Lost to returns', value: m.lost, icon: Undo2, cls: 'k-bad' },
                ].map((c) => (
                  <div key={c.label} className="rounded-2xl k-card2 p-4">
                    <div className="flex items-center gap-2 text-sm k-muted"><c.icon className="w-4 h-4" /> {c.label}</div>
                    <p className={`k-display text-3xl font-bold mt-2 ${c.cls}`}><Count value={c.value} money /></p>
                  </div>
                ))}
              </div>
            </section>

            <section className="k-card p-5 xl:col-span-2">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div>
                  <h3 className="k-display text-2xl font-bold">Sales per day</h3>
                  <p className="text-sm k-muted">COD balance plus advance paid. Orders placed before advances were recorded count only their COD balance.</p>
                </div>
                {rangeToggle}
              </div>
              <AreaChart key={`sales${range}`} current={m.cur.map((c) => ({ label: c.label, value: c.sales }))} previous={m.prev.map((c) => c.sales)} unit="sales" money />
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold mb-4">Payment mix</h3>
              <div className="flex items-center gap-5 flex-wrap justify-center sm:justify-start">
                <Donut
                  parts={[{ label: 'COD', value: m.codCount, color: 'var(--warn)' }, { label: 'Prepaid', value: m.prepaid, color: 'var(--lime)' }]}
                  center={String(m.codCount + m.prepaid)}
                  caption="orders"
                />
                <dl className="space-y-4 text-sm min-w-[8rem]">
                  <div><dt className="flex items-center gap-1.5 k-muted"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--warn)' }} />COD</dt><dd className="k-display text-2xl font-bold mt-0.5">{m.codCount} <span className="text-xs k-muted font-sans font-medium">{m.codCount + m.prepaid ? Math.round((m.codCount / (m.codCount + m.prepaid)) * 100) : 0}%</span></dd><dd className="text-xs k-muted">average {inr(m.avgCod)}</dd></div>
                  <div><dt className="flex items-center gap-1.5 k-muted"><span className="w-2.5 h-2.5 rounded-full k-bar" />Prepaid</dt><dd className="k-display text-2xl font-bold mt-0.5">{m.prepaid} <span className="text-xs k-muted font-sans font-medium">{m.codCount + m.prepaid ? Math.round((m.prepaid / (m.codCount + m.prepaid)) * 100) : 0}%</span></dd></div>
                </dl>
              </div>
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold flex items-center gap-2"><Undo2 className="w-5 h-5 k-bad" /> Return rate by courier</h3>
              <p className="text-sm k-muted mb-4">Returned out of delivered plus returned, last {range} days</p>
              {m.returnRows.length === 0 && <p className="text-sm k-muted">No delivered or returned orders in this period yet.</p>}
              <ul className="space-y-4">
                {m.returnRows.map((r) => (
                  <li key={r.name}>
                    <div className="flex justify-between text-sm font-semibold"><span>{r.name}</span><span className={(r.rate ?? 0) > 0.2 ? 'k-bad' : 'k-muted'}>{Math.round((r.rate ?? 0) * 100)}% <span className="font-normal k-muted">({r.returned} of {r.delivered + r.returned})</span></span></div>
                    <div className="h-1.5 rounded-full k-track mt-1.5 overflow-hidden"><div className="h-full rounded-full bar-grow" style={{ width: `${Math.max(2, (r.rate ?? 0) * 100)}%`, background: (r.rate ?? 0) > 0.2 ? 'var(--bad)' : 'var(--lime)' }} /></div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold flex items-center gap-2"><Timer className="w-5 h-5 k-lime-text" /> Delivery speed</h3>
              <p className="text-sm k-muted mb-4">Average days from order to delivery</p>
              {m.speedRows.length === 0 ? (
                <p className="text-sm k-muted">Not enough delivery dates yet. This fills in as couriers report deliveries.</p>
              ) : (
                <ul className="space-y-3">
                  {m.speedRows.map((r) => (
                    <li key={r.name} className="flex items-center justify-between text-sm"><span className="font-semibold">{r.name}</span><span><span className="k-display text-2xl font-bold">{r.avg.toFixed(1)}</span> <span className="k-muted">days · {r.n} parcels</span></span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold mb-4">By courier</h3>
              <ul className="space-y-4">
                {m.courier.length === 0 && <li className="text-sm k-muted">No orders in this period.</li>}
                {m.courier.map(([c, n]) => (
                  <li key={c}>
                    <div className="flex justify-between text-sm font-semibold"><span>{c}</span><span className="k-muted font-normal">{n} orders</span></div>
                    <div className="h-1.5 rounded-full k-track mt-1.5 overflow-hidden"><div className="h-full rounded-full k-bar bar-grow" style={{ width: `${(n / m.courier[0][1]) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="k-card p-5 xl:col-span-2">
              <h3 className="k-display text-2xl font-bold mb-4">Orders by status</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {m.statusCounts.map(([s, n]) => (
                  <div key={s} className="rounded-2xl k-card2 p-3 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_DOT[s] || '#94a3b8' }} />
                    <div><p className="text-xs k-muted">{s}</p><p className="k-display text-2xl font-bold leading-tight">{n}</p></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'stock' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="space-y-4">
            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold">Units on the shelf</h3>
              <p className="text-sm k-muted mb-3">Share of received units still in stock</p>
              {stock === null ? <Skeleton className="h-28 w-full" /> : <Gauge pct={healthPct} />}
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div><p className="text-xs k-muted">In stock</p><p className="k-display text-2xl font-bold">{totalAvail.toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs k-muted">Received</p><p className="k-display text-2xl font-bold">{totalIn.toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs k-muted">Out of stock</p><p className={`k-display text-2xl font-bold ${outOfStock ? 'k-bad' : ''}`}>{outOfStock}</p></div>
              </div>
            </section>

            <section className="k-card p-5">
              <h3 className="k-display text-2xl font-bold">Where your stock sits</h3>
              <p className="text-sm k-muted mb-4">Units ready to sell, by product</p>
              {stock === null ? <Skeleton className="h-40 w-full" /> : stockSlices.length === 0 ? (
                <p className="text-sm k-muted">Nothing is in stock right now.</p>
              ) : (
                <div className="flex items-center gap-5 flex-wrap justify-center sm:justify-start">
                  <Donut parts={stockSlices} center={totalAvail.toLocaleString('en-IN')} caption="units" />
                  <ul className="space-y-2 text-sm min-w-[8rem] flex-1">
                    {stockSlices.map((p) => (
                      <li key={p.label} className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                        <span className="truncate capitalize">{p.label.toLowerCase()}</span>
                        <span className="ml-auto font-semibold">{p.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            </div>

            <section className="k-card p-5 xl:col-span-2">
              <h3 className="k-display text-2xl font-bold flex items-center gap-2">How long each product will last {runway.some((r) => r.available === 0 || (r.days !== null && r.days <= 7)) && <AlertTriangle className="w-5 h-5 k-warn" />}</h3>
              <p className="text-sm k-muted mb-3">Estimated from the last 7 days of orders. Shortest first.</p>
              {stock === null ? (
                <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
              ) : runway.length === 0 ? (
                <p className="text-sm k-muted">No stock recorded yet. Add products from Cartons.</p>
              ) : (
                <ul>
                  {runway.slice(0, 10).map((s) => {
                    const out = s.available === 0;
                    const urgent = out || (s.days !== null && s.days <= 3);
                    const soon = s.days !== null && s.days <= 7;
                    return (
                      <li key={s.product_name} className="flex items-center gap-3 py-3 border-t k-rule first:border-t-0">
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center k-card2 ${urgent ? 'k-bad' : soon ? 'k-warn' : 'k-lime-text'}`}>{out ? <PackageX className="w-4 h-4" /> : <PackageCheck className="w-4 h-4" />}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate capitalize">{s.product_name.toLowerCase()}</p>
                          <p className="text-xs k-muted">{s.available} in stock{s.perDay > 0 ? ` · selling about ${s.perDay.toFixed(1)} a day` : ' · no orders in the last 7 days'}</p>
                        </div>
                        <p className={`text-sm font-bold text-right ${urgent ? 'k-bad' : soon ? 'k-warn' : ''}`}>{out ? 'Out of stock' : s.days === null ? 'No recent sales' : `${Math.max(1, Math.round(s.days))} days left`}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="k-card p-5 xl:col-span-3">
              <h3 className="k-display text-2xl font-bold mb-4">All products</h3>
              {stock === null ? <Skeleton className="h-40 w-full" /> : stock.length === 0 ? (
                <p className="text-sm k-muted">No stock recorded yet. Add products from Cartons.</p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {stock.map((s) => {
                    const pct = s.total_in ? (s.available / s.total_in) * 100 : 0;
                    return (
                      <li key={s.product_name}>
                        <div className="flex justify-between text-sm"><span className="font-semibold capitalize truncate pr-3">{s.product_name.toLowerCase()}</span><span className="k-muted shrink-0">{s.available} of {s.total_in}</span></div>
                        <div className="h-1.5 rounded-full k-track mt-1.5 overflow-hidden"><div className="h-full rounded-full bar-grow" style={{ width: `${pct}%`, background: s.available <= 10 ? 'var(--warn)' : 'var(--lime)' }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setSearchOpen(false)}>
          <div className="kdash w-full max-w-xl k-card overflow-hidden shadow-2xl" style={{ minHeight: 0 }} role="dialog" aria-label="Search orders" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b k-rule">
              <Search className="w-4 h-4 k-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { onNavigateToGenerator(results[0]); setSearchOpen(false); setQuery(''); } }}
                placeholder="Order ID, name, phone, city or tracking number"
                aria-label="Search orders"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--ink)' }}
              />
              <button onClick={() => setSearchOpen(false)} aria-label="Close search" className="k-muted"><X className="w-4 h-4" /></button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto">
              {results.length === 0 && <li className="px-4 py-6 text-sm k-muted text-center">No order matches "{query}".</li>}
              {results.map((o) => (
                <li key={o.id}>
                  <button onClick={() => { onNavigateToGenerator(o); setSearchOpen(false); setQuery(''); }} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:opacity-80 border-b k-rule">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT[o.status] || '#94a3b8' }} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{o.customer.name} <span className="font-normal k-muted">{o.id}</span></span><span className="block text-xs k-muted truncate">{o.customer.phone} · {o.customer.city} · {o.status}</span></span>
                    <span className="text-xs k-lime-text font-semibold flex items-center gap-1">Open label <ArrowRight className="w-3 h-3" /></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {scannerOpen && (
        <TrackingScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          orders={orders}
          onUpdateStatus={onUpdateStatus}
          onUpdateTracking={onUpdateTracking}
        />
      )}
    </div>
  );
};
