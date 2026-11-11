import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Maximize, MapPin, Move3d, Pause, Play, RotateCcw, Rotate3d, Sparkles, Truck, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import indiaStates from '../../data/indiaStates.json';
import indiaNeighbours from '../../data/indiaNeighbours.json';
import type { CompanySettings, Order } from '../../types';

interface MapViewProps { orders: Order[]; settings: CompanySettings; onRefresh?: () => void }

type Pt = [number, number];
type Period = '7' | '30' | '90' | 'all';
type Pins = Record<string, Pt>;
type Kind = 'prep' | 'ship' | 'ret';

const DAY = 86400000;
const num = (n: number) => n.toLocaleString('en-IN');

// Your hub is fixed at Cherthala, Alappuzha. It cannot be moved from the map.
const HUB: Pt = [9.6847, 76.3406];

const kindOf = (s: Order['status']): Kind | null => {
  if (s === 'Returned') return 'ret';
  if (s === 'Shipped' || s === 'Delivered' || s === 'Claims') return 'ship';
  if (s === 'Cancelled') return null;
  return 'prep';
};

const normState = (n: string) => {
  const x = (n || '').toLowerCase().replace(/\(ut\)/g, '').replace(/&/g, 'and').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (x === 'orissa') return 'odisha';
  if (x === 'uttaranchal') return 'uttarakhand';
  if (x === 'pondicherry') return 'puducherry';
  if (x === 'andaman and nicobar') return 'andaman and nicobar islands';
  if (/dadra|daman|diu/.test(x)) return 'dadra and nagar haveli and daman and diu';
  if (x === 'nct of delhi' || x === 'new delhi') return 'delhi';
  return x;
};

/** Where a pin code is: exact pin, else the average of pins that start the same way, else nothing. */
const makeLocator = (pins: Pins) => {
  const byPrefix = new Map<string, { lat: number; lng: number; n: number }>();
  Object.entries(pins).forEach(([pin, [lat, lng]]) => {
    for (const len of [4, 3]) {
      const k = pin.slice(0, len);
      const e = byPrefix.get(k) || { lat: 0, lng: 0, n: 0 };
      e.lat += lat; e.lng += lng; e.n += 1;
      byPrefix.set(k, e);
    }
  });
  return (pin: string): Pt | null => {
    const p = (pin || '').replace(/\D/g, '').slice(0, 6);
    if (pins[p]) return pins[p];
    for (const len of [4, 3]) { const e = byPrefix.get(p.slice(0, len)); if (e) return [e.lat / e.n, e.lng / e.n]; }
    return null;
  };
};

// ── A small 3D engine on a canvas: the map is a plane measured in degrees. It can be turned all the way round (yaw)
// and tilted back (tilt). The land is a slab raised above the sea, and the state you open rises higher. ──
const COSL = 0.927; // a degree of longitude is shorter than a degree of latitude
const toPlane = (lat: number, lng: number): Pt => [(lng - 82.5) * COSL, 22 - lat];
const FOCAL = 70;
const TILT_3D = (26 * Math.PI) / 180;
const TILT_MAX = (74 * Math.PI) / 180;
const H = 0.32; // height of the land above the sea
const FH = 0.95; // height of the state you open
const INDIA_VIEW = [-13.3, -14.4, 13.9, 15.1];
const SCOPE = [-17, -18, 18, 19]; // the camera stays over India and its neighbours

interface View { cx: number; cy: number; scale: number; tilt: number; yaw: number }
interface StateShape { name: string; norm: string; rings: Float32Array[]; bbox: [number, number, number, number]; center: Pt; area: number }
interface DistShape extends StateShape { state: string; stateNorm: string }
interface Node {
  pin: string; state: string; stateNorm: string; district: string; x: number; y: number;
  prep: number; ship: number; ret: number; total: number;
  arc: Float32Array; arcBack: Float32Array; phase: number; rank: number;
}

const ARC_N = 26;
const makeArc = (a: Pt, b: Pt, side: number): Float32Array => {
  const out = new Float32Array((ARC_N + 1) * 3);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy);
  const h = Math.min(7, 0.14 * dist + 0.35);
  for (let i = 0; i <= ARC_N; i++) {
    const t = i / ARC_N, s = Math.sin(Math.PI * t);
    out[i * 3] = a[0] + dx * t - dy * 0.1 * s * side;
    out[i * 3 + 1] = a[1] + dy * t + dx * 0.1 * s * side;
    out[i * 3 + 2] = h * s;
  }
  return out;
};

interface RawGeometry { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
interface RawFeature { properties: { name: string }; geometry: RawGeometry }
interface RawDistrict { properties: { d: string; s: string }; geometry: RawGeometry }

const ringCentroid = (r: Float32Array): { c: Pt; a: number } => {
  let a = 0, cx = 0, cy = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const f = r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
    a += f; cx += (r[j * 2] + r[i * 2]) * f; cy += (r[j * 2 + 1] + r[i * 2 + 1]) * f;
  }
  a /= 2;
  return Math.abs(a) < 1e-9 ? { c: [r[0], r[1]], a: 0 } : { c: [cx / (6 * a), cy / (6 * a)], a: Math.abs(a) };
};

const ringsOf = (g: RawGeometry) => {
  const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][];
  const rings: Float32Array[] = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, best = -1, anchor: Pt = [0, 0], area = 0;
  polys.forEach((poly) => poly.forEach((ring, ri) => {
    const a = new Float32Array(ring.length * 2);
    ring.forEach(([lng, lat], i) => {
      const [x, y] = toPlane(lat, lng);
      a[i * 2] = x; a[i * 2 + 1] = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    });
    rings.push(a);
    if (ri === 0) { const { c, a: ar } = ringCentroid(a); area += ar; if (ar > best) { best = ar; anchor = c; } }
  }));
  return { rings, bbox: [x0, y0, x1, y1] as [number, number, number, number], center: anchor, area };
};
const parseShapes = (): StateShape[] => (indiaStates as unknown as { features: RawFeature[] }).features.map((f) => ({ name: String(f.properties.name), norm: normState(String(f.properties.name)), ...ringsOf(f.geometry) }));
const parseDistricts = (raw: { features: RawDistrict[] }): DistShape[] => raw.features.map((f) => ({ name: f.properties.d, norm: normState(f.properties.d), state: f.properties.s, stateNorm: normState(f.properties.s), ...ringsOf(f.geometry) }));
const parseNeighbours = () => (indiaNeighbours as unknown as { features: RawFeature[] }).features.map((f) => ({ name: String(f.properties.name), ...ringsOf(f.geometry) }));

const inRing = (r: Float32Array, x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) {
    const xi = r[i * 2], yi = r[i * 2 + 1], xj = r[j * 2], yj = r[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inState = (s: StateShape, x: number, y: number) => {
  if (x < s.bbox[0] || x > s.bbox[2] || y < s.bbox[1] || y > s.bbox[3]) return false;
  let n = 0;
  for (const r of s.rings) if (inRing(r, x, y)) n += 1;
  return n % 2 === 1;
};

// ── the look: a soft political atlas. Neighbouring states never share a colour. ──
type RGB = [number, number, number];
const PALETTE: RGB[] = [[245, 217, 164], [206, 228, 172], [241, 193, 173], [188, 217, 238], [229, 200, 226], [242, 232, 156], [180, 224, 210]];
const SEA_GREY: RGB = [150, 172, 190];
const mix = (c: RGB, t: number, to: RGB = t > 0 ? [255, 255, 255] : [0, 0, 0]): string => {
  const k = Math.abs(t);
  return `rgb(${Math.round(c[0] + (to[0] - c[0]) * k)},${Math.round(c[1] + (to[1] - c[1]) * k)},${Math.round(c[2] + (to[2] - c[2]) * k)})`;
};
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** One colour per state, chosen so that states touching each other get different ones. */
const colourStates = (shapes: StateShape[]): number[] => {
  const cells = new Map<string, Set<number>>();
  shapes.forEach((s, i) => s.rings.forEach((r) => { for (let k = 0; k < r.length / 2; k++) { const key = `${Math.round(r[k * 2] * 5)},${Math.round(r[k * 2 + 1] * 5)}`; let set = cells.get(key); if (!set) { set = new Set(); cells.set(key, set); } set.add(i); } }));
  const adj: Set<number>[] = shapes.map(() => new Set());
  cells.forEach((set) => { if (set.size > 1) set.forEach((a) => set.forEach((b) => { if (a !== b) adj[a].add(b); })); });
  const order = shapes.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size);
  const out: number[] = shapes.map(() => -1);
  order.forEach((i) => {
    const used = new Set([...adj[i]].map((j) => out[j]));
    let c = 0; while (used.has(c) && c < PALETTE.length) c++;
    out[i] = c < PALETTE.length ? c : hash(shapes[i].norm) % PALETTE.length;
  });
  return out;
};

// where the names of the countries and seas around India go (latitude, longitude)
const LANDS: { name: string; at: Pt }[] = [
  { name: 'PAKISTAN', at: [29.6, 69.4] }, { name: 'AFGHANISTAN', at: [34.2, 66.4] }, { name: 'CHINA', at: [34.6, 91] }, { name: 'NEPAL', at: [28.4, 83.6] },
  { name: 'BHUTAN', at: [27.45, 90.4] }, { name: 'BANGLADESH', at: [24.1, 89.7] }, { name: 'MYANMAR', at: [22, 96.3] }, { name: 'SRI LANKA', at: [7.7, 80.8] },
];
const SEAS: { name: string; at: Pt }[] = [
  { name: 'ARABIAN SEA', at: [15, 65.5] }, { name: 'BAY OF BENGAL', at: [14, 88.6] }, { name: 'INDIAN OCEAN', at: [2.5, 79] },
];

interface Fresh { t0: number; kind: Kind }
interface Tip { x: number; y: number; title: string; lines: string[] }
interface Bucket { key: string; norm: string; fill: string; dim: string; list: DistShape[] }

export const MapView: React.FC<MapViewProps> = ({ orders, onRefresh }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState<Pins | null>(null);
  const [period, setPeriod] = useState<Period>('90');
  const [showSent, setShowSent] = useState(true);
  const [showPrep, setShowPrep] = useState(true);
  const [showReturn, setShowReturn] = useState(true);
  const [state, setStateRaw] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [dists, setDists] = useState<DistShape[] | null>(null);
  const setState = (v: string | null) => { setStateRaw(v); setDistrict(null); };
  const [flat, setFlat] = useState(false);
  const [orbit, setOrbit] = useState(false); // drag turns the map instead of moving it
  const [spin, setSpin] = useState(false);
  const hub = HUB;
  const [tip, setTip] = useState<Tip | null>(null);
  const [events, setEvents] = useState<{ id: number; text: string; kind: Kind }[]>([]);

  useEffect(() => { void import('../../data/inPincodes.json').then((m) => setPins(m.default as unknown as Pins)); }, []);
  useEffect(() => { void import('../../data/indiaDistricts.json').then((m) => setDists(parseDistricts(m.default as unknown as { features: RawDistrict[] }))); }, []);
  const locate = useMemo(() => (pins ? makeLocator(pins) : null), [pins]);
  const shapes = useMemo(parseShapes, []);
  const neighbours = useMemo(parseNeighbours, []);
  const stateColour = useMemo(() => colourStates(shapes), [shapes]);
  const stateIdx = useMemo(() => new Map(shapes.map((s, i) => [s.norm, i] as [string, number])), [shapes]);

  // every district, grouped by state and shade, so each group is painted in one go
  const buckets = useMemo<Bucket[]>(() => {
    if (!dists) return [];
    const m = new Map<string, Bucket>();
    dists.forEach((d) => {
      const si = stateIdx.get(d.stateNorm) ?? 0;
      const lv = hash(d.name) % 3;
      const key = `${d.stateNorm}|${lv}`;
      let b = m.get(key);
      if (!b) {
        const base = PALETTE[stateColour[si] ?? 0];
        const f = [-0.06, 0, 0.07][lv];
        b = { key, norm: d.stateNorm, fill: mix(base, f), dim: mix(base, 0.35, SEA_GREY), list: [] };
        m.set(key, b);
      }
      b.list.push(d);
    });
    return [...m.values()];
  }, [dists, stateColour, stateIdx]);
  const distByKey = useMemo(() => new Map((dists || []).map((d) => [`${d.stateNorm}|${d.name}`, d] as [string, DistShape])), [dists]);

  // Numbers: every pin code that has orders, grouped by state
  const data = useMemo(() => {
    if (!locate) return null;
    const cut = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
    const nodes = new Map<string, Node>();
    const states = new Map<string, { key: string; norm: string; total: number; prep: number; ship: number; ret: number; nodes: Node[] }>();
    let total = 0, delivered = 0, prep = 0, ret = 0, unplaced = 0;
    const hubP = toPlane(hub[0], hub[1]);
    orders.forEach((o) => {
      const k = kindOf(o.status);
      if (!k) return;
      if (new Date(o.createdAt).getTime() < cut) return;
      const at = locate(o.customer.pinCode);
      if (!at) { unplaced += 1; return; }
      const pin = (o.customer.pinCode || '').replace(/\D/g, '').slice(0, 6);
      const st = (o.customer.state || 'Unknown').trim() || 'Unknown';
      let n = nodes.get(pin);
      if (!n) {
        const [x, y] = toPlane(at[0], at[1]);
        n = { pin, state: st, stateNorm: normState(st), district: '', x, y, prep: 0, ship: 0, ret: 0, total: 0, arc: makeArc(hubP, [x, y], 1), arcBack: makeArc([x, y], hubP, -1), phase: (parseInt(pin.slice(-3) || '0', 10) % 100) / 100, rank: 0 };
        nodes.set(pin, n);
      }
      if (!n.district) n.district = (o.customer.district || '').trim();
      n[k] += 1; n.total += 1;
      total += 1;
      if (k === 'ret') ret += 1;
      if (k === 'prep') prep += 1;
      if (o.status === 'Delivered') delivered += 1;
    });
    // the district a pin code sits in comes from the map itself, so spelling in the orders does not matter
    if (dists) {
      const byState = new Map<string, DistShape[]>();
      dists.forEach((x) => { const l = byState.get(x.stateNorm); if (l) l.push(x); else byState.set(x.stateNorm, [x]); });
      nodes.forEach((n) => {
        let best: DistShape | null = null, bd = 1e9;
        for (const dsh of byState.get(n.stateNorm) || []) {
          if (inState(dsh, n.x, n.y)) { best = dsh; break; }
          const dd = Math.hypot(dsh.center[0] - n.x, dsh.center[1] - n.y);
          if (dd < bd) { bd = dd; best = dsh; }
        }
        if (best) n.district = best.name;
      });
    }
    nodes.forEach((n) => {
      const g = states.get(n.state) || { key: n.state, norm: n.stateNorm, total: 0, prep: 0, ship: 0, ret: 0, nodes: [] };
      g.total += n.total; g.prep += n.prep; g.ship += n.ship; g.ret += n.ret; g.nodes.push(n);
      states.set(n.state, g);
    });
    const list = [...states.values()].sort((a, b) => b.total - a.total);
    [...nodes.values()].sort((a, b) => b.total - a.total || a.pin.localeCompare(b.pin)).forEach((n, i) => { n.rank = i; });
    const distTotals = new Map<string, { total: number; ret: number }>();
    nodes.forEach((n) => { const k = `${n.stateNorm}|${n.district}`; const e = distTotals.get(k) || { total: 0, ret: 0 }; e.total += n.total; e.ret += n.ret; distTotals.set(k, e); });
    return { list, nodes: [...nodes.values()], total, delivered, prep, ret, unplaced, distTotals };
  }, [orders, locate, period, hub, dists]);

  // Everything the draw loop needs lives in a ref, so React never slows the animation
  const R = useRef({
    view: { cx: 0.2, cy: 0.2, scale: 20, tilt: TILT_3D, yaw: 0 } as View,
    target: { cx: 0.2, cy: 0.2, scale: 20, tilt: TILT_3D, yaw: 0 } as View,
    w: 800, h: 500, dpr: 1, ready: false, visible: true,
    data: null as typeof data,
    hub: hub,
    show: { ship: true, prep: true, ret: true },
    fresh: new Map<string, Fresh>(),
    hover: null as { kind: 'node' | 'hub' | 'state' | 'district'; key: string } | null,
    selectedNode: null as string | null,
    maxTotal: 1,
    focusNorm: null as string | null, district: null as string | null, dists: [] as DistShape[],
    buckets: [] as Bucket[], distByKey: new Map<string, DistShape>(),
    scopeBox: SCOPE as number[], viewBox: INDIA_VIEW as number[], fitScale: 20, minScale: 10, indiaFit: 20, zl: H,
    userTilt: TILT_3D, spin: false, orbit: false, quality: 0, resize: (() => {}) as () => void,
    zoomFn: (() => {}) as (f: number) => void,
    turnFn: (() => {}) as (yaw: number, tilt: number) => void,
    reduce: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  });
  R.current.data = data;
  R.current.hub = hub;
  R.current.show = { ship: showSent, prep: showPrep, ret: showReturn };
  R.current.maxTotal = Math.max(1, ...(data?.nodes.map((n) => n.total) || [1]));
  R.current.spin = spin;
  R.current.orbit = orbit;
  const focusNorm = state ? normState(state) : district ? district.split('|')[0] : null;
  R.current.focusNorm = focusNorm;
  R.current.district = district;
  R.current.dists = dists || [];
  R.current.buckets = buckets;
  R.current.distByKey = distByKey;

  // The box the camera stays inside, and the box it first looks at
  const viewBox = useMemo<number[]>(() => {
    if (district && dists) {
      const [sn, dn] = district.split('|');
      const d = dists.find((x) => x.stateNorm === sn && x.name === dn);
      if (d) return [d.bbox[0] - 0.12, d.bbox[1] - 0.12, d.bbox[2] + 0.12, d.bbox[3] + 0.12];
    }
    if (focusNorm) {
      const sh = shapes.find((q) => q.norm === focusNorm);
      if (sh) return sh.bbox as number[];
    }
    return INDIA_VIEW;
  }, [district, focusNorm, dists, shapes]);
  const scopeBox = focusNorm || district ? viewBox : SCOPE;
  R.current.scopeBox = scopeBox;
  R.current.viewBox = viewBox;

  const fitFor = useCallback((tilt: number, bx: number[], yaw = 0): View => {
    const { w, h } = R.current;
    const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2;
    const ct = Math.cos(tilt), st = Math.sin(tilt), cw = Math.cos(yaw), sw = Math.sin(yaw);
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    [[bx[0], bx[1]], [bx[2], bx[1]], [bx[0], bx[3]], [bx[2], bx[3]]].forEach(([x, y]) => {
      const dx0 = x - cx, dy0 = y - cy, dx = dx0 * cw - dy0 * sw, dy = dx0 * sw + dy0 * cw, k = FOCAL / (FOCAL + -dy * st);
      const sx = dx * k, sy = dy * ct * k;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    });
    const whole = bx[2] - bx[0] > 20;
    const sc = Math.min((w * (whole ? 0.99 : 0.7)) / Math.max(maxX - minX, 0.3), (h * (whole ? 0.95 : 0.64)) / Math.max(maxY - minY, 0.3));
    const mid = (minY + maxY) / 2;
    return { cx, cy: yaw === 0 ? cy + (mid * sc + h * 0.02) / (sc * Math.max(ct, 0.2)) : cy, scale: Math.min(sc, 900), tilt, yaw };
  }, []);

  // New camera target when the place you look at, or flat / 3D, changes
  useEffect(() => {
    const r = R.current;
    if (flat) r.userTilt = 0;
    else if (r.userTilt === 0) r.userTilt = TILT_3D;
    const t = fitFor(r.userTilt, viewBox, r.target.yaw);
    r.target = t; r.fitScale = t.scale;
    r.minScale = fitFor(r.userTilt, scopeBox, r.target.yaw).scale * 0.98;
    r.indiaFit = fitFor(r.userTilt, INDIA_VIEW, r.target.yaw).scale;
  }, [scopeBox, viewBox, flat, fitFor]);

  // Canvas size, and a lower resolution on slow computers
  useEffect(() => {
    const el = wrap.current, c = cv.current;
    if (!el || !c) return;
    const size = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(R.current.quality >= 1 ? 1 : 1.75, window.devicePixelRatio || 1);
      R.current.w = r.width; R.current.h = r.height; R.current.dpr = dpr;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      R.current.target = fitFor(R.current.userTilt, R.current.viewBox, R.current.target.yaw);
      R.current.fitScale = R.current.target.scale;
      R.current.minScale = fitFor(R.current.userTilt, R.current.scopeBox, R.current.target.yaw).scale * 0.98;
      R.current.indiaFit = fitFor(R.current.userTilt, INDIA_VIEW, R.current.target.yaw).scale;
      if (!R.current.ready) { R.current.view = { ...R.current.target }; R.current.ready = true; }
    };
    R.current.resize = size;
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    const io = new IntersectionObserver((e) => { R.current.visible = e[0]?.isIntersecting ?? true; });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [fitFor]);

  // New orders and status changes light up as they arrive
  const seen = useRef<Map<string, Order['status']> | null>(null);
  useEffect(() => {
    if (!locate) return;
    const prev = seen.current;
    seen.current = new Map(orders.map((o) => [o.id, o.status] as [string, Order['status']]));
    if (!prev) return; // the first look: everything is old
    const found: { id: number; text: string; kind: Kind }[] = [];
    orders.forEach((o) => {
      const was = prev.get(o.id);
      if (was === o.status) return;
      const k = kindOf(o.status);
      if (!k) return;
      if (!locate(o.customer.pinCode)) return;
      const pin = (o.customer.pinCode || '').replace(/\D/g, '').slice(0, 6);
      const label = was === undefined ? 'New order' : o.status === 'Returned' ? 'Returned' : o.status === 'Shipped' ? 'Shipped' : o.status;
      R.current.fresh.set(pin, { t0: performance.now(), kind: k });
      found.push({ id: Date.now() + found.length, kind: k, text: `${label} · ${(o.customer.district || o.customer.city || '').trim() || o.customer.state} ${pin}` });
    });
    if (found.length) {
      setEvents((e) => [...found.slice(0, 3), ...e].slice(0, 4));
      found.forEach((f) => setTimeout(() => setEvents((e) => e.filter((x) => x.id !== f.id)), 9000));
    }
  }, [orders, locate]);

  // The site refreshes the orders now and then while this page is open
  useEffect(() => {
    if (!onRefresh) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') onRefresh(); }, 15000);
    return () => clearInterval(t);
  }, [onRefresh]);

  // A preview, so you can see what a new order looks like. Nothing is saved.
  const demo = () => {
    const d = R.current.data;
    if (!d?.nodes.length) return;
    const n = d.nodes[Math.floor(Math.random() * d.nodes.length)];
    R.current.fresh.set(n.pin, { t0: performance.now(), kind: 'prep' });
    const id = Date.now();
    setEvents((e) => [{ id, kind: 'prep' as Kind, text: `New order (preview) · ${n.district || n.state} ${n.pin}` }, ...e].slice(0, 4));
    setTimeout(() => setEvents((e) => e.filter((x) => x.id !== id)), 9000);
  };

  // forget anything an older version kept about the hub or the picture
  useEffect(() => { try { localStorage.removeItem('zaylow_hub_point_v1'); } catch { /* ignore */ } }, []);

  const resetView = () => {
    const r = R.current;
    r.userTilt = flat ? 0 : TILT_3D;
    const t = fitFor(r.userTilt, r.viewBox);
    r.target = t; r.fitScale = t.scale;
    r.minScale = fitFor(r.userTilt, r.scopeBox, 0).scale * 0.98;
    r.indiaFit = fitFor(r.userTilt, INDIA_VIEW, 0).scale;
    setSpin(false);
  };

  // ── Draw ──
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const main = c.getContext('2d');
    if (!main) return;
    let raf = 0, last = performance.now(), ema = 16, slow = 0, fast = 0;
    const out = { x: 0, y: 0, k: 1 };
    const P = { w: 0, h: 0, cx: 0, cy: 0, scale: 1, ct: 1, st: 0, cw: 1, sw: 0 };
    const proj = (x: number, y: number, z: number) => {
      const dx0 = x - P.cx, dy0 = y - P.cy;
      const dx = dx0 * P.cw - dy0 * P.sw, dy = dx0 * P.sw + dy0 * P.cw;
      const k = FOCAL / (FOCAL + (-dy * P.st - z * P.ct));
      out.x = P.w / 2 + dx * P.scale * k;
      out.y = P.h * 0.52 + (dy * P.ct - z * P.st) * P.scale * k;
      out.k = k;
    };
    const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;
    const ringsPath = (ctx: CanvasRenderingContext2D, rings: Float32Array[], z: number) => {
      for (const ring of rings) {
        for (let i = 0; i < ring.length / 2; i++) { proj(ring[i * 2], ring[i * 2 + 1], z); if (i === 0) ctx.moveTo(out.x, out.y); else ctx.lineTo(out.x, out.y); }
        ctx.closePath();
      }
    };
    const txt = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, col = '#33250f', halo = 'rgba(255,255,255,.9)', hw = 3) => {
      ctx.lineWidth = hw; ctx.strokeStyle = halo; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
    };
    const spacing = (ctx: CanvasRenderingContext2D, px: string) => { if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = px; };

    type Env = { r: typeof R.current; q: number; d: typeof R.current.data; focus: string | null; absZ: number; moving: boolean; w: number; h: number };

    // the sea, the land, every district and state border (this part only changes when you move the camera)
    const drawLand = (ctx: CanvasRenderingContext2D, E: Env) => {
      const { r, q, d, focus, absZ, moving } = E;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (q < 1 && !moving) {
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.2)';
        ctx.beginPath();
        for (let g = -36; g <= 36; g += 4) {
          proj(g, -30, 0); ctx.moveTo(out.x, out.y); proj(g, 32, 0); ctx.lineTo(out.x, out.y);
          proj(-36, g * 0.8, 0); ctx.moveTo(out.x, out.y); proj(36, g * 0.8, 0); ctx.lineTo(out.x, out.y);
        }
        ctx.stroke();
      }
      // the countries around India, flat on the sea
      ctx.beginPath();
      neighbours.forEach((n) => ringsPath(ctx, n.rings, 0));
      ctx.fillStyle = '#e8dfc6'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,100,60,.55)'; ctx.stroke();
      // India's slab: a shadow on the sea, then the sides, layer by layer
      ctx.beginPath();
      shapes.forEach((s) => { for (const ring of s.rings) { for (let i = 0; i < ring.length / 2; i++) { proj(ring[i * 2] + 0.32, ring[i * 2 + 1] + 0.3, 0); if (i === 0) ctx.moveTo(out.x, out.y); else ctx.lineTo(out.x, out.y); } ctx.closePath(); } });
      ctx.fillStyle = 'rgba(15,45,80,.22)'; ctx.fill();
      const layers = moving && q >= 1 ? 1 : q >= 1 ? 2 : 4;
      for (let k = 0; k <= layers; k++) {
        ctx.beginPath();
        shapes.forEach((s) => ringsPath(ctx, s.rings, (H * k) / layers));
        ctx.fillStyle = mix([150, 120, 70], -0.55 + 0.4 * (k / layers)); ctx.fill();
      }
      if (focus) {
        const fs = shapes.find((x) => x.norm === focus);
        if (fs) for (let k = 1; k <= 5; k++) {
          ctx.beginPath(); ringsPath(ctx, fs.rings, H + ((FH - H) * k) / 5);
          ctx.fillStyle = mix([160, 130, 80], -0.5 + 0.32 * (k / 5)); ctx.fill();
        }
      }
      // the land: every district in its state's colour; the state you opened is raised
      const buckets = r.buckets;
      const paint = (match: boolean) => {
        for (const b of buckets) {
          const isFocus = focus === b.norm;
          if (isFocus !== match) continue;
          ctx.beginPath();
          for (const ds of b.list) ringsPath(ctx, ds.rings, isFocus ? FH : H);
          ctx.fillStyle = focus && !isFocus ? b.dim : b.fill;
          ctx.fill();
        }
      };
      const lineDistricts = !(moving && q >= 2);
      if (buckets.length) {
        paint(false);
        if (lineDistricts) {
          ctx.lineWidth = 0.6 + Math.min(0.5, absZ * 0.08);
          ctx.strokeStyle = `rgba(95,72,36,${0.35 + Math.min(0.25, absZ * 0.05)})`;
          ctx.beginPath();
          for (const b of buckets) if (!focus || focus !== b.norm) for (const ds of b.list) ringsPath(ctx, ds.rings, H);
          ctx.stroke();
        }
        if (focus) {
          paint(true);
          ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(80,58,26,.7)';
          ctx.beginPath();
          for (const b of buckets) if (focus === b.norm) for (const ds of b.list) ringsPath(ctx, ds.rings, FH);
          ctx.stroke();
        }
      } else {
        shapes.forEach((s, i) => {
          ctx.beginPath(); ringsPath(ctx, s.rings, H);
          ctx.fillStyle = focus && focus !== s.norm ? mix(PALETTE[stateColour[i] ?? 0], 0.35, SEA_GREY) : mix(PALETTE[stateColour[i] ?? 0], 0);
          ctx.fill();
        });
      }
      // districts that have orders get a clear teal edge
      if (d && d.distTotals.size && lineDistricts) {
        ctx.beginPath();
        d.distTotals.forEach((tt, key) => { if (!tt.total) return; const ds = r.distByKey.get(key); if (ds) ringsPath(ctx, ds.rings, focus === ds.stateNorm ? FH : H); });
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(13,110,100,.9)'; ctx.stroke();
      }
      // hover or selection on a district
      const hoverD = r.hover?.kind === 'district' ? r.hover.key : null;
      for (const key of [hoverD, r.district]) {
        if (!key) continue;
        const ds = r.distByKey.get(key);
        if (!ds) continue;
        ctx.beginPath(); ringsPath(ctx, ds.rings, focus === ds.stateNorm ? FH : H);
        ctx.fillStyle = key === r.district ? 'rgba(255,255,255,.38)' : 'rgba(255,255,255,.24)'; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = '#2b1a05'; ctx.stroke();
      }
      // state borders: a white line under a dark one, so each state stands out
      for (let pass = moving && q >= 1 ? 1 : 0; pass < 2; pass++) {
        ctx.beginPath();
        shapes.forEach((s) => ringsPath(ctx, s.rings, focus === s.norm ? FH : H));
        ctx.lineWidth = pass === 0 ? 3.6 : 1.3;
        ctx.strokeStyle = pass === 0 ? 'rgba(255,255,255,.75)' : 'rgba(70,50,20,.85)';
        ctx.stroke();
      }
      const hoverS = r.hover?.kind === 'state' ? r.hover.key : null;
      if (hoverS) {
        const hs = shapes.find((x) => x.norm === hoverS);
        if (hs) { ctx.beginPath(); ringsPath(ctx, hs.rings, focus === hs.norm ? FH : H); ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#2b1a05'; ctx.stroke(); }
      }
      // names of the seas and the countries around
      ctx.textAlign = 'center';
      if (!focus) {
        ctx.font = 'italic 600 12px DM Sans, system-ui, sans-serif';
        spacing(ctx, '3px');
        for (const s of SEAS) { const [x, y] = toPlane(s.at[0], s.at[1]); proj(x, y, 0); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(s.name, out.x, out.y); }
        ctx.font = '700 11px DM Sans, system-ui, sans-serif';
        for (const s of LANDS) { const [x, y] = toPlane(s.at[0], s.at[1]); proj(x, y, 0); txt(ctx, s.name, out.x, out.y, '#8a7a55', 'rgba(255,255,255,.7)', 2.4); }
        spacing(ctx, '0px');
      }
    };

    // names: states first, then districts as you come closer, then pin codes
    const drawNames = (ctx: CanvasRenderingContext2D, E: Env) => {
      const { r, d, focus, absZ, w, h } = E;
      const ZL = focus ? FH : H;
      ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      const used: { x: number; y: number; w: number }[] = [];
      const place = (x: number, y: number, wd: number, ht = 14) => {
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return false;
        for (const u of used) if (Math.abs(u.x - x) < (u.w + wd) / 2 + 2 && Math.abs(u.y - y) < ht) return false;
        used.push({ x, y, w: wd }); return true;
      };
      if (d && !focus) {
        // each state's order count, as a badge on the state
        ctx.font = '700 11px DM Sans, system-ui, sans-serif';
        d.list.forEach((s2) => {
          const sh = shapes.find((qq) => qq.norm === s2.norm);
          if (!sh) return;
          proj(sh.center[0], sh.center[1], H);
          const label = num(s2.total), wpx = ctx.measureText(label).width + 14, x0 = out.x - wpx / 2, y0 = out.y + 8;
          used.push({ x: out.x, y: out.y + 17, w: wpx });
          ctx.fillStyle = 'rgba(6,24,36,.92)';
          ctx.beginPath(); ctx.roundRect(x0, y0, wpx, 18, 9); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(label, out.x, y0 + 13);
        });
      }
      if (!focus) {
        ctx.font = '700 10.5px DM Sans, system-ui, sans-serif';
        spacing(ctx, '1px');
        const fade = absZ < 2.6 ? 1 : 0.45;
        [...shapes].sort((a, b) => b.area - a.area).forEach((s) => {
          proj(s.center[0], s.center[1], H);
          const text = s.name.replace(/ and /g, ' & ').toUpperCase();
          const wd = ctx.measureText(text).width;
          if (s.area < 0.25 * (absZ < 1.5 ? 4 : 1) && absZ < 1.8) return; // the tiny ones are named once you are closer
          if (!place(out.x, out.y - 2, wd, 15)) return;
          ctx.globalAlpha = fade; txt(ctx, text, out.x, out.y - 2, '#3b2a10'); ctx.globalAlpha = 1;
        });
        spacing(ctx, '0px');
      }
      if (absZ > 1.7 || focus) {
        ctx.font = '600 10px DM Sans, system-ui, sans-serif';
        const list = focus ? r.dists.filter((x) => x.stateNorm === focus) : r.dists;
        const items: { x: number; y: number; text: string; n: number; sel: boolean }[] = [];
        for (const ds of list) {
          proj(ds.center[0], ds.center[1], focus === ds.stateNorm ? FH : H);
          if (out.x < -30 || out.x > w + 30 || out.y < -30 || out.y > h + 30) continue;
          const key = `${ds.stateNorm}|${ds.name}`;
          items.push({ x: out.x, y: out.y, text: ds.name, n: d?.distTotals.get(key)?.total || 0, sel: r.district === key });
        }
        items.sort((a, b) => (b.sel ? 1 : 0) - (a.sel ? 1 : 0) || b.n - a.n);
        for (const it of items) {
          const wd = ctx.measureText(it.text).width;
          if (!it.sel && !place(it.x, it.y, wd, it.n ? 24 : 13)) continue;
          txt(ctx, it.text, it.x, it.y - 1, it.sel ? '#000' : '#33250f');
          if (it.n) { ctx.font = '700 10px DM Sans, system-ui, sans-serif'; txt(ctx, `${it.n}`, it.x, it.y + 11, '#0b5d55'); ctx.font = '600 10px DM Sans, system-ui, sans-serif'; }
        }
      }
      if (d && (focus || absZ > 5)) {
        ctx.font = '500 9.5px DM Sans, system-ui, sans-serif';
        for (const n of d.nodes) {
          if (focus && n.stateNorm !== focus) continue;
          proj(n.x, n.y, ZL);
          if (out.x < 0 || out.x > w || out.y < 0 || out.y > h) continue;
          if (!place(out.x, out.y + 16, 40, 12)) continue;
          txt(ctx, n.pin, out.x, out.y + 16, '#4a3a1e', 'rgba(255,255,255,.85)', 2.6);
        }
      }
    };

    // everything that moves: the lines from the hub, the light running along them, new orders, pins and the hub
    const drawLive = (ctx: CanvasRenderingContext2D, E: Env, now: number, v: View) => {
      const { r, q, d, focus } = E;
      const ZL = focus ? FH : H;
      const sec = now / 1000, anim = !r.reduce;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (d) {
        const runLimit = q === 0 ? 60 : q === 1 ? 24 : 0;
        const arcPath = (arc: Float32Array, upTo = 1) => {
          const n = Math.max(2, Math.floor(ARC_N * upTo));
          for (let i = 0; i <= n; i++) { proj(arc[i * 3], arc[i * 3 + 1], arc[i * 3 + 2] + H + (ZL - H) * (i / ARC_N)); if (i === 0) ctx.moveTo(out.x, out.y); else ctx.lineTo(out.x, out.y); }
        };
        const wOf = (n: Node) => 0.8 + 1.6 * Math.sqrt(n.total / r.maxTotal);
        const visible = (n: Node) => !focus || n.stateNorm === focus;
        const kinds: { on: boolean; rgb: string; dash: boolean; has: (n: Node) => boolean; back: boolean }[] = [
          { on: r.show.ship, rgb: '8,76,153', dash: false, has: (n) => n.ship > 0, back: false },
          { on: r.show.prep, rgb: '180,83,9', dash: true, has: (n) => n.prep > 0, back: false },
          { on: r.show.ret, rgb: '185,28,28', dash: true, has: (n) => n.ret > 0, back: true },
        ];
        // every line of one kind and thickness is drawn in a single stroke
        const widths = [1, 1.7, 2.6];
        for (const kd of kinds) {
          if (!kd.on) continue;
          ctx.setLineDash(kd.dash ? [5, 5] : []);
          for (let wb = 0; wb < 3; wb++) {
            ctx.beginPath();
            let any = false;
            for (const n of d.nodes) {
              if (!visible(n) || !kd.has(n)) continue;
              const wv = wOf(n), b = wv < 1.3 ? 0 : wv < 1.9 ? 1 : 2;
              if (b !== wb) continue;
              arcPath(kd.back ? n.arcBack : n.arc); any = true;
            }
            if (any) {
              ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = widths[wb] + 2.4; ctx.stroke();
              ctx.strokeStyle = rgba(kd.rgb, 0.92); ctx.lineWidth = widths[wb]; ctx.stroke();
            }
          }
        }
        ctx.setLineDash([]);

        // pulses of light running along the lines
        if (anim && runLimit > 0) {
          const pulse = (arc: Float32Array, rgb: string, u: number, size: number) => {
            for (let qd = 0; qd < 3; qd++) {
              const uu = u - qd * 0.022;
              if (uu < 0) continue;
              const f = Math.min(ARC_N - 1, Math.max(0, Math.floor(uu * ARC_N)));
              const m = uu * ARC_N - f, i = f * 3, j = (f + 1) * 3;
              proj(arc[i] + (arc[j] - arc[i]) * m, arc[i + 1] + (arc[j + 1] - arc[i + 1]) * m, arc[i + 2] + (arc[j + 2] - arc[i + 2]) * m + H + (ZL - H) * uu);
              ctx.globalAlpha = (1 - qd / 3) * 0.95;
              ctx.fillStyle = qd === 0 ? '#fff' : `rgb(${rgb})`;
              ctx.beginPath(); ctx.arc(out.x, out.y, size * (1 - qd * 0.2) * out.k, 0, Math.PI * 2); ctx.fill();
              if (qd === 0) { ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 1.6; ctx.stroke(); }
            }
            ctx.globalAlpha = 1;
          };
          for (const n of d.nodes) {
            if (!visible(n)) continue;
            if (!focus && n.rank >= runLimit && !r.fresh.has(n.pin) && n.prep === 0) continue;
            const speed = 0.16 + 0.1 * n.phase, sz = 1.8 + wOf(n) * 0.6;
            if (r.show.ship && n.ship > 0) pulse(n.arc, '8,76,153', (sec * speed + n.phase) % 1, sz);
            if (r.show.prep && n.prep > 0) pulse(n.arc, '180,83,9', (sec * speed * 1.3 + n.phase) % 1, sz);
            if (r.show.ret && n.ret > 0) pulse(n.arcBack, '185,28,28', (sec * speed + n.phase) % 1, sz);
          }
        }

        // a new line being drawn
        r.fresh.forEach((f, pin) => {
          const n = d.nodes.find((x) => x.pin === pin);
          const age = (now - f.t0) / 1000;
          if (!n || age >= 8) { if (age >= 8) r.fresh.delete(pin); return; }
          if (!visible(n)) return;
          const fade = 1 - Math.max(0, age - 5) / 3, prog = Math.min(1, age / 1.4);
          const arc = f.kind === 'ret' ? n.arcBack : n.arc;
          ctx.beginPath(); arcPath(arc, prog); ctx.strokeStyle = rgba('255,255,255', 0.95 * fade); ctx.lineWidth = 10; ctx.stroke();
          ctx.beginPath(); arcPath(arc, prog); ctx.strokeStyle = rgba(f.kind === 'ret' ? '220,38,38' : '234,138,4', fade); ctx.lineWidth = 5; ctx.stroke();
        });

        // a pin for every pin code
        for (const n of d.nodes) {
          if (!visible(n)) continue;
          proj(n.x, n.y, ZL);
          const hovered = r.hover?.kind === 'node' && r.hover.key === n.pin;
          const base = (focus ? 3.2 : 1.2) + (focus ? 3.2 : 1.8) * Math.sqrt(n.total / r.maxTotal);
          const rad = (base + (hovered || r.selectedNode === n.pin ? 3 : 0)) * out.k;
          const col = n.ret / n.total > 0.25 ? '185,28,28' : n.prep > 0 && !n.ship ? '180,83,9' : '8,76,153';
          ctx.fillStyle = `rgb(${col})`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(out.x, out.y, Math.max(2.4, rad * 0.8), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          const f = r.fresh.get(n.pin);
          if (f) {
            const age = (now - f.t0) / 1000;
            if (age > 1.2 && age < 8) {
              ctx.lineWidth = 2;
              for (let qd = 0; qd < 2; qd++) {
                const a = ((age - 1.2 + qd * 0.9) % 1.8) / 1.8;
                ctx.strokeStyle = rgba(f.kind === 'ret' ? '220,38,38' : '234,138,4', (1 - a) * 0.9);
                ctx.beginPath(); ctx.arc(out.x, out.y, rad + a * 34 * out.k, 0, Math.PI * 2); ctx.stroke();
              }
            }
          }
        }
      }

      // the hub
      const hp = toPlane(r.hub[0], r.hub[1]);
      proj(hp[0], hp[1], H);
      const hx = out.x, hy = out.y, hk = out.k;
      if (q < 2) {
        ctx.lineWidth = 2;
        for (let qd = 0; qd < 3; qd++) {
          const a = anim ? (sec * 0.5 + qd / 3) % 1 : qd / 3;
          ctx.strokeStyle = rgba('8,110,100', (1 - a) * 0.7);
          ctx.beginPath(); ctx.ellipse(hx, hy, (10 + a * 40) * hk, (10 + a * 40) * hk * (0.5 + 0.5 * Math.cos(v.tilt)), 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      const top = 20 * hk;
      const gg = ctx.createLinearGradient(hx, hy, hx, hy - top * 2);
      gg.addColorStop(0, rgba('13,110,100', 0.85)); gg.addColorStop(1, rgba('13,110,100', 0));
      ctx.fillStyle = gg; ctx.fillRect(hx - 2, hy - top * 2, 4, top * 2);
      ctx.fillStyle = '#062018'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(hx, hy, 9 * hk, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 3 * hk, 0, Math.PI * 2); ctx.fill();
      ctx.font = '700 11px DM Sans, system-ui, sans-serif'; ctx.textAlign = 'center';
      txt(ctx, 'HUB', hx, hy - top * 2 - 6);
    };

    // When the camera is still, the land and the names are painted once and reused, so a slow computer only redraws the moving parts
    const layer = () => { const o = document.createElement('canvas'); return { el: o, g: o.getContext('2d') as CanvasRenderingContext2D }; };
    const landL = layer(), nameL = layer();
    let cacheKey = '', lastKey = '', lastData: unknown = null, lastBuckets: unknown = null, still = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const r = R.current;
      if (!r.visible || document.visibilityState === 'hidden') { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000);
      // if frames come slowly the map quietly drops some effects and resolution, and gets them back when it can
      ema = ema * 0.92 + (now - last) * 0.08; last = now;
      if (ema > 28) { slow += dt; fast = 0; } else if (ema < 17) { fast += dt; slow = 0; } else { slow = 0; fast = 0; }
      if (slow > 1.2 && r.quality < 2) { r.quality += 1; slow = 0; r.resize(); cacheKey = ''; }
      else if (fast > 8 && r.quality > 0) { r.quality -= 1; fast = 0; r.resize(); cacheKey = ''; }
      const q = r.quality;

      const v = r.view, t = r.target;
      if (r.spin) r.turnFn(dt * 0.35, 0);
      const e = r.reduce ? 1 : 0.14;
      v.cx += (t.cx - v.cx) * e; v.cy += (t.cy - v.cy) * e; v.scale += (t.scale - v.scale) * e; v.tilt += (t.tilt - v.tilt) * e; v.yaw += (t.yaw - v.yaw) * e;
      P.w = r.w; P.h = r.h; P.cx = v.cx; P.cy = v.cy; P.scale = v.scale;
      P.ct = Math.cos(v.tilt); P.st = Math.sin(v.tilt); P.cw = Math.cos(v.yaw); P.sw = Math.sin(v.yaw);
      const { w, h, dpr } = r;
      const focus = r.focusNorm;
      const absZ = v.scale / (r.indiaFit || v.scale);
      r.zl = focus ? FH : H;

      const key = [v.cx.toFixed(3), v.cy.toFixed(3), v.scale.toFixed(2), v.tilt.toFixed(3), v.yaw.toFixed(3), w, h, dpr, focus, r.district, r.hover ? `${r.hover.kind}:${r.hover.key}` : '', q].join('|');
      if (r.data !== lastData || r.buckets !== lastBuckets) { lastData = r.data; lastBuckets = r.buckets; cacheKey = ''; }
      still = key === lastKey ? still + 1 : 0;
      lastKey = key;
      const moving = still < 2;
      const E: Env = { r, q, d: r.data, focus, absZ, moving, w, h };

      main.setTransform(dpr, 0, 0, dpr, 0, 0);
      main.clearRect(0, 0, w, h);
      if (moving) {
        drawLand(main, E);
        drawLive(main, E, now, v);
        drawNames(main, E);
      } else {
        if (cacheKey !== key) {
          for (const L of [landL, nameL]) { L.el.width = c.width; L.el.height = c.height; L.g.setTransform(dpr, 0, 0, dpr, 0, 0); }
          drawLand(landL.g, E);
          drawNames(nameL.g, E);
          cacheKey = key;
        }
        main.setTransform(1, 0, 0, 1, 0, 0);
        main.drawImage(landL.el, 0, 0);
        main.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawLive(main, E, now, v);
        main.setTransform(1, 0, 0, 1, 0, 0);
        main.drawImage(nameL.el, 0, 0);
        main.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [shapes, neighbours, stateColour]);

  // ── Touch and mouse ──
  // move: drag the map · rotate: drag turns it (sideways) and tilts it (up and down) · wheel or pinch: zoom · two fingers twisting: rotate
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0, startX = 0, startY = 0, mode: 'pan' | 'orbit' | null = null, lastPinch = 0, lastAngle = 0, tipKey = '';
    const rect = () => c.getBoundingClientRect();
    const project = (x: number, y: number) => {
      const { view, w, h, zl } = R.current;
      const ct = Math.cos(view.tilt), st = Math.sin(view.tilt), cw = Math.cos(view.yaw), sw = Math.sin(view.yaw);
      const dx0 = x - view.cx, dy0 = y - view.cy;
      const dx = dx0 * cw - dy0 * sw, dy = dx0 * sw + dy0 * cw;
      const k = FOCAL / (FOCAL + (-dy * st - zl * ct));
      return { x: w / 2 + dx * view.scale * k, y: h * 0.52 + (dy * ct - zl * st) * view.scale * k };
    };
    // the point on the map that sits under a spot on the screen
    const ground = (sx: number, sy: number): Pt => {
      const { view, w, h, zl } = R.current;
      const ct = Math.cos(view.tilt), st = Math.sin(view.tilt), cw = Math.cos(view.yaw), sw = Math.sin(view.yaw);
      const s = (sy - h * 0.52) / view.scale;
      const ry = (s * FOCAL + zl * (FOCAL * st - s * ct)) / (ct * FOCAL + s * st);
      const k = FOCAL / (FOCAL - ry * st - zl * ct);
      const rx = (sx - w / 2) / (view.scale * k);
      return [view.cx + rx * cw + ry * sw, view.cy - rx * sw + ry * cw];
    };
    const hit = (sx: number, sy: number) => {
      const r = R.current;
      const hp = toPlane(r.hub[0], r.hub[1]);
      const hpp = project(hp[0], hp[1]);
      if (Math.hypot(sx - hpp.x, sy - hpp.y) < 16) return { kind: 'hub' as const, key: 'hub' };
      let bestKey = '', bestD = 13;
      r.data?.nodes.forEach((n) => {
        if (r.focusNorm && n.stateNorm !== r.focusNorm) return;
        const p = project(n.x, n.y);
        const dd = Math.hypot(sx - p.x, sy - p.y);
        if (dd < bestD) { bestD = dd; bestKey = n.pin; }
      });
      if (bestKey) return { kind: 'node' as const, key: bestKey };
      const [gx, gy] = ground(sx, sy);
      if (r.focusNorm || r.view.scale > r.indiaFit * 1.5) {
        const list = r.focusNorm ? r.dists.filter((x) => x.stateNorm === r.focusNorm) : r.dists;
        const ds = list.find((x) => inState(x, gx, gy));
        if (ds) return { kind: 'district' as const, key: `${ds.stateNorm}|${ds.name}` };
      }
      const sh = shapes.find((s) => inState(s, gx, gy));
      return sh ? { kind: 'state' as const, key: sh.norm } : null;
    };
    // the hover card follows the mouse without re-drawing the page
    const setTipFor = (h: ReturnType<typeof hit>, sx: number, sy: number) => {
      const d = R.current.data;
      const key = h ? `${h.kind}:${h.key}` : '';
      if (key === tipKey) {
        const el = tipEl.current;
        if (el) { el.style.left = `${Math.min(sx + 14, R.current.w - 190)}px`; el.style.top = `${Math.max(8, sy - 12)}px`; }
        return;
      }
      tipKey = key;
      if (!h) { setTip(null); return; }
      const at = (title: string, lines: string[]) => setTip({ x: sx, y: sy, title, lines });
      if (h.kind === 'hub') { at('Your hub', ['Cherthala, Alappuzha']); return; }
      if (!d) return;
      if (h.kind === 'node') {
        const n = d.nodes.find((q) => q.pin === h.key);
        if (n) at(`${n.pin}${n.district ? ' · ' + n.district : ''}`, [n.state, `${n.total} order${n.total === 1 ? '' : 's'}`, [n.ship && `${n.ship} sent`, n.prep && `${n.prep} waiting`, n.ret && `${n.ret} returned`].filter(Boolean).join(' · ')]);
        return;
      }
      if (h.kind === 'district') {
        const [sn, dn] = h.key.split('|');
        const t = d.distTotals.get(h.key);
        at(dn, [shapes.find((q) => q.norm === sn)?.name || '', t ? `${t.total} order${t.total === 1 ? '' : 's'}${t.ret ? ` · ${t.ret} returned` : ''}` : 'No orders yet']);
        return;
      }
      const g = d.list.find((s) => s.norm === h.key);
      at(shapes.find((s) => s.norm === h.key)?.name || '', g ? [`${num(g.total)} orders`, `${g.nodes.length} pin codes`, g.ret ? `${g.ret} returned` : ''].filter(Boolean) : ['No orders yet']);
    };
    // the camera stays over the part of India you are looking at: it cannot drift off into empty space
    const clampTarget = () => {
      const r = R.current, t = r.target, b = r.scopeBox, v = r.view;
      const hw0 = r.w / 2 / t.scale, hh0 = (r.h * 0.5) / (t.scale * Math.max(Math.cos(t.tilt), 0.35));
      const cy = Math.abs(Math.cos(t.yaw)), sy = Math.abs(Math.sin(t.yaw));
      const hw = cy * hw0 + sy * hh0, hh = sy * hw0 + cy * hh0;
      const rx = Math.max(0, (b[2] - b[0]) / 2 - hw * 0.8), ry = Math.max(0, (b[3] - b[1]) / 2 - hh * 0.8);
      const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
      t.cx = Math.min(mx + rx, Math.max(mx - rx, t.cx));
      t.cy = Math.min(my + ry, Math.max(my - ry, t.cy));
      v.cx = t.cx; v.cy = t.cy;
    };
    const zoomBy = (f: number, sx: number, sy: number) => {
      const t = R.current.target, v = R.current.view;
      const [bx, by] = ground(sx, sy);
      const fit = R.current.fitScale;
      t.scale = Math.min(fit * (R.current.district ? 8 : R.current.focusNorm ? 22 : 70), Math.max(R.current.minScale || fit * 0.65, t.scale * f));
      v.scale = t.scale;
      const [ax, ay] = ground(sx, sy);
      t.cx += bx - ax; t.cy += by - ay;
      clampTarget();
    };
    R.current.zoomFn = (f: number) => zoomBy(f, R.current.w / 2, R.current.h * 0.5);
    const turn = (dyaw: number, dtilt: number) => {
      const t = R.current.target, v = R.current.view;
      t.yaw += dyaw; v.yaw = t.yaw;
      if (dtilt) {
        t.tilt = Math.min(TILT_MAX, Math.max(0, t.tilt + dtilt)); v.tilt = t.tilt;
        R.current.userTilt = t.tilt;
      }
      // keep what you are looking at the same size on screen while it turns
      const nf = fitFor(t.tilt, R.current.viewBox, t.yaw).scale;
      const rel = t.scale / R.current.fitScale;
      R.current.fitScale = nf; t.scale = nf * rel; v.scale = t.scale;
      R.current.minScale = fitFor(t.tilt, R.current.scopeBox, t.yaw).scale * 0.98;
      R.current.indiaFit = fitFor(t.tilt, INDIA_VIEW, t.yaw).scale;
      clampTarget();
    };
    R.current.turnFn = turn;

    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      const r = rect();
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      moved = 0; startX = e.clientX - r.left; startY = e.clientY - r.top;
      setSpin(false);
      mode = (R.current.orbit || e.button === 2 || e.shiftKey) ? 'orbit' : 'pan';
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
    };
    const move = (e: PointerEvent) => {
      const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const h = hit(sx, sy);
        R.current.hover = h;
        c.style.cursor = h ? 'pointer' : R.current.orbit ? 'move' : 'grab';
        setTipFor(h, sx, sy);
        return;
      }
      pointers.set(e.pointerId, { x: sx, y: sy });
      const dx = sx - prev.x, dy = sy - prev.y;
      moved = Math.max(moved, Math.abs(sx - startX) + Math.abs(sy - startY));
      if (tipKey) { tipKey = ''; setTip(null); }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (lastPinch) zoomBy(dist / lastPinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        let da = ang - lastAngle; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        turn(-da, 0);
        lastPinch = dist; lastAngle = ang;
        return;
      }
      if (mode === 'orbit') {
        turn(dx * 0.008, dy * 0.006);
      } else if (mode === 'pan') {
        const t = R.current.target, ct = Math.max(0.35, Math.cos(t.tilt));
        const rdx = -dx / t.scale, rdy = -dy / (t.scale * ct);
        const cw = Math.cos(t.yaw), sw = Math.sin(t.yaw);
        t.cx += rdx * cw + rdy * sw; t.cy += -rdx * sw + rdy * cw;
        clampTarget();
      }
    };
    const up = (e: PointerEvent) => {
      const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      pointers.delete(e.pointerId); lastPinch = 0;
      if (moved < 9) {
        const h = hit(sx, sy);
        if (h?.kind === 'node') { R.current.selectedNode = R.current.selectedNode === h.key ? null : h.key; tipKey = ''; setTipFor(h, sx, sy); }
        else if (h?.kind === 'district') {
          const [sn] = h.key.split('|');
          const g = R.current.data?.list.find((s) => s.norm === sn);
          setStateRaw(g?.key ?? shapes.find((q) => q.norm === sn)?.name ?? null);
          setDistrict(R.current.district === h.key ? null : h.key);
          tipKey = ''; setTip(null); R.current.hover = null;
        } else if (h?.kind === 'state') {
          const g = R.current.data?.list.find((s) => s.norm === h.key);
          setState(g?.key ?? shapes.find((q) => q.norm === h.key)?.name ?? null);
          tipKey = ''; setTip(null); R.current.hover = null;
        } else R.current.selectedNode = null;
      }
      mode = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rect();
      if (e.shiftKey || e.altKey) turn(e.deltaY * 0.004, 0); else zoomBy(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    const leave = () => { R.current.hover = null; tipKey = ''; setTip(null); };
    const noMenu = (e: Event) => e.preventDefault();
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('pointerleave', leave); c.addEventListener('contextmenu', noMenu);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); c.removeEventListener('wheel', wheel); c.removeEventListener('pointerleave', leave); c.removeEventListener('contextmenu', noMenu); };
  }, [shapes, fitFor]);

  // every district of the state in focus, with its orders
  const distRows = useMemo(() => {
    if (!focusNorm || !dists || !data) return [];
    return dists.filter((x) => x.stateNorm === focusNorm).map((x) => {
      const key = `${x.stateNorm}|${x.name}`;
      const t = data.distTotals.get(key);
      return { key, name: x.name, total: t?.total || 0, ret: t?.ret || 0, pins: data.nodes.filter((n) => n.stateNorm === x.stateNorm && n.district === x.name).length };
    }).sort((p, q) => q.total - p.total || p.name.localeCompare(q.name));
  }, [focusNorm, dists, data]);
  const stateName = state || (focusNorm ? shapes.find((q) => q.norm === focusNorm)?.name : null) || null;
  const districtName = district ? district.split('|')[1] : null;

  const dotColor = (k: Kind) => (k === 'ret' ? '#fb923c' : k === 'ship' ? '#38e1ff' : '#facc15');
  const GLASS: React.CSSProperties = { background: 'rgba(255,252,244,.94)', color: '#1b1209', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(60,40,10,.2)' };
  const chip = (on: boolean, accent: string): React.CSSProperties => ({ ...GLASS, border: `1px solid ${on ? accent : 'rgba(60,40,10,.2)'}`, boxShadow: on ? `0 0 0 1.5px ${accent} inset` : undefined, opacity: on ? 1 : 0.62 });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[88rem] mx-auto pb-24 md:pb-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Shipping map</h2>
          <p className="text-sm k-muted mt-1">Every order, from your hub to its pin code. Tap a state to open it up, then a district.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto max-md:snap-row max-md:-mx-4 max-md:px-4 max-md:w-[calc(100%+2rem)] [&>button]:whitespace-nowrap [&>button]:shrink-0" role="group" aria-label="Period">
          {([['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']] as const).map(([k, l]) => <button key={k} className="k-chip" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="k-card p-4"><p className="text-xs k-muted">Orders</p><p className="k-display text-4xl font-bold leading-none mt-2 tabular-nums">{data ? num(data.total) : '…'}</p></div>
        <div className="k-card p-4"><p className="text-xs k-muted">Delivered</p><p className="k-display text-4xl font-bold leading-none mt-2 tabular-nums k-lime-text">{data ? num(data.delivered) : '…'}</p></div>
        <div className="k-card p-4"><p className="text-xs k-muted">Waiting to ship</p><p className="k-display text-4xl font-bold leading-none mt-2 tabular-nums" style={{ color: '#ca8a04' }}>{data ? num(data.prep) : '…'}</p></div>
        <div className="k-card p-4"><p className="text-xs k-muted">Returned</p><p className="k-display text-4xl font-bold leading-none mt-2 tabular-nums" style={{ color: '#ea580c' }}>{data ? num(data.ret) : '…'}</p><p className="text-xs k-muted mt-1">{data && data.total ? Math.round((data.ret / data.total) * 100) : 0}% of orders</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
        <section className="rounded-[28px] overflow-hidden relative" style={{ background: 'radial-gradient(120% 100% at 50% 35%, #9fd0e8 0%, #6fb0d6 55%, #4a93bf 100%)', boxShadow: '0 18px 50px -24px rgba(20,60,100,.55)' }} aria-label="Map">
          <div ref={wrap} className="h-[22rem] md:h-[38rem] w-full relative">
            <canvas ref={cv} className="absolute inset-0 w-full h-full block touch-none" role="img" aria-label="3D map of India with every state and district, and a line from your hub to every pin code that has orders" style={{ cursor: 'grab' }} />
            <ul className="absolute left-3 bottom-3 z-10 space-y-1.5 max-w-[16rem] pointer-events-none" aria-live="polite">
              {events.map((e) => (
                <li key={e.id} className="text-xs font-semibold text-white rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(4,17,26,.88)', border: `1px solid ${dotColor(e.kind)}` }}>
                  <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: dotColor(e.kind) }} />{e.text}
                </li>
              ))}
            </ul>
            {tip && (
              <div ref={tipEl} className="absolute z-20 pointer-events-none text-white text-xs rounded-xl px-3 py-2 shadow-xl" style={{ left: Math.min(tip.x + 14, (wrap.current?.clientWidth || 600) - 190), top: Math.max(8, tip.y - 12), background: 'rgba(4,17,26,.92)', border: '1px solid rgba(56,225,255,.5)', maxWidth: 180 }}>
                <p className="font-bold">{tip.title}</p>
                {tip.lines.map((l, i) => (l ? <p key={i} className="opacity-80">{l}</p> : null))}
              </div>
            )}
            {!pins && <p className="absolute inset-0 grid place-items-center text-sm z-10" style={{ color: '#0b2a40' }}>Loading pin codes…</p>}
          </div>

          <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 items-start">
            <span className="flex items-center gap-2 text-[11px] font-semibold rounded-full px-3 py-1.5" style={GLASS}><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live · checks every 15 s</span>
            {(state || district) && <button onClick={() => setState(null)} className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-2" style={GLASS}><RotateCcw className="w-3.5 h-3.5" /> All India</button>}
            {district && stateName && <button onClick={() => setDistrict(null)} className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-2" style={GLASS}>Back to {stateName}</button>}
            {stateName && (() => {
              const g = data?.list.find((x) => x.norm === focusNorm);
              const dt = district ? data?.distTotals.get(district) : null;
              return (
                <div className="rounded-2xl px-4 py-3 max-w-[15rem]" style={{ ...GLASS, borderColor: 'rgba(13,110,100,.5)' }} aria-live="polite">
                  <p className="text-xl font-bold k-display leading-tight">{districtName || stateName}</p>
                  <p className="text-xs mt-0.5" style={{ opacity: 0.75 }}>
                    {district ? `${stateName} · ${dt ? `${num(dt.total)} order${dt.total === 1 ? '' : 's'}` : 'No orders yet'}` : `${g ? `${num(g.total)} order${g.total === 1 ? '' : 's'} · ${g.nodes.length} pin code${g.nodes.length === 1 ? '' : 's'}` : 'No orders yet'} · ${distRows.length} district${distRows.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              );
            })()}
          </div>
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 items-end">
            <button onClick={() => R.current.zoomFn(1.6)} aria-label="Zoom in" className="flex items-center rounded-full px-3 py-2" style={GLASS}><ZoomIn className="w-4 h-4" /></button>
            <button onClick={() => R.current.zoomFn(1 / 1.6)} aria-label="Zoom out" className="flex items-center rounded-full px-3 py-2" style={GLASS}><ZoomOut className="w-4 h-4" /></button>
          </div>

          {/* The buttons sit under the map, so nothing covers it */}
          <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3 text-xs font-semibold" style={{ background: 'rgba(255,252,244,.97)', color: '#1b1209', borderTop: '1px solid rgba(60,40,10,.15)' }}>
            <button onClick={() => setOrbit((v) => !v)} aria-label="Rotate the map with your finger or mouse" aria-pressed={orbit} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(orbit, '#0f766e')} title="Drag the map to turn it all the way round and tilt it"><Rotate3d className="w-4 h-4" /> <span className="max-md:hidden">Rotate</span></button>
            <button onClick={() => setSpin((v) => !v)} aria-label={spin ? 'Stop spinning' : 'Spin the map'} aria-pressed={spin} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(spin, '#0f766e')}>{spin ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} <span className="max-md:hidden">{spin ? 'Stop' : 'Spin'}</span></button>
            <button onClick={resetView} aria-label="Reset the view" className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={GLASS}><Maximize className="w-4 h-4" /> <span className="max-md:hidden">Reset view</span></button>
            <button onClick={() => setFlat((v) => !v)} aria-label="Switch 3D and flat view" aria-pressed={flat} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={GLASS}><Move3d className="w-4 h-4" /> <span className="max-md:hidden">{flat ? '3D view' : 'Flat view'}</span></button>
            <span className="w-px h-6 mx-1 bg-black/15 max-md:hidden" aria-hidden="true" />
            <button onClick={() => setShowSent((v) => !v)} aria-label="Sent parcels" aria-pressed={showSent} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(showSent, '#0b6bcb')}><Truck className="w-4 h-4" style={{ color: '#0b6bcb' }} /> <span className="max-md:hidden">Sent</span></button>
            <button onClick={() => setShowPrep((v) => !v)} aria-label="Waiting orders" aria-pressed={showPrep} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(showPrep, '#d97706')}><Box className="w-4 h-4" style={{ color: '#b45309' }} /> <span className="max-md:hidden">Waiting</span></button>
            <button onClick={() => setShowReturn((v) => !v)} aria-label="Returned parcels" aria-pressed={showReturn} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(showReturn, '#dc2626')}><Undo2 className="w-4 h-4" style={{ color: '#c2410c' }} /> <span className="max-md:hidden">Returned</span></button>
            <span className="w-px h-6 mx-1 bg-black/15 max-md:hidden" aria-hidden="true" />
            <button onClick={demo} aria-label="Preview a new order on the map" className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={GLASS} title="Shows how a new order will appear on the map, on a random pin code. Nothing is saved."><Sparkles className="w-4 h-4" /> <span className="max-md:hidden">Preview new order</span></button>
          </div>
        </section>

        <aside className="k-card overflow-hidden" aria-label={stateName ? `${stateName} districts` : 'States'}>
          <div className="p-4 pb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold k-display truncate">{districtName || stateName || 'States'}</h3>
            {stateName ? <button onClick={() => (district ? setDistrict(null) : setState(null))} className="text-sm font-semibold underline shrink-0">{district ? `Back to ${stateName}` : 'All India'}</button> : <span className="text-xs k-muted">{data ? data.list.length : 0} states</span>}
          </div>
          <ul className="border-t k-rule max-h-[30rem] overflow-y-auto">
            {!data || data.list.length === 0 ? <li className="py-10 px-5 text-center text-sm k-muted">No orders in this period.</li> : !stateName
              ? data.list.map((s) => (
                <li key={s.key} className="border-t k-rule first:border-t-0">
                  <button onClick={() => setState(s.key)} className="k-row w-full text-left px-4 py-3 flex items-center gap-3">
                    <MapPin className="w-4 h-4 k-muted shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{s.key}</span><span className="block text-xs k-muted">{s.nodes.length} pin code{s.nodes.length === 1 ? '' : 's'}</span></span>
                    <span className="text-right shrink-0"><span className="block font-bold tabular-nums">{num(s.total)}</span>{s.ret > 0 && <span className="block text-xs tabular-nums" style={{ color: '#ea580c' }}>{num(s.ret)} back</span>}</span>
                  </button>
                </li>))
              : distRows.map((d2) => (
                <li key={d2.key} className="border-t k-rule first:border-t-0">
                  <button onClick={() => setDistrict(district === d2.key ? null : d2.key)} aria-pressed={district === d2.key} className="k-row w-full text-left px-4 py-3 flex items-center gap-3" style={district === d2.key ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                    <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{d2.name}</span><span className="block text-xs k-muted">{d2.pins ? `${d2.pins} pin code${d2.pins === 1 ? '' : 's'}` : 'No orders yet'}</span></span>
                    <span className="text-right shrink-0"><span className="block font-bold tabular-nums">{d2.total ? num(d2.total) : '–'}</span>{d2.ret > 0 && <span className="block text-xs tabular-nums" style={{ color: '#ea580c' }}>{num(d2.ret)} back</span>}</span>
                  </button>
                </li>))}
          </ul>
          {data && data.unplaced > 0 && <p className="text-xs k-muted px-4 py-3 border-t k-rule">{num(data.unplaced)} order{data.unplaced === 1 ? '' : 's'} have a PIN code that could not be placed on the map.</p>}
        </aside>
      </div>
    </div>
  );
};
