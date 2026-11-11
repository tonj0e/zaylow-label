import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Box, Maximize, MapPin, Mountain, Move3d, Pause, Play, RotateCcw, Rotate3d, Sparkles, Truck, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import indiaStates from '../../data/indiaStates.json';
import type { CompanySettings, Order } from '../../types';

interface MapViewProps { orders: Order[]; settings: CompanySettings; onRefresh?: () => void }

type LL = [number, number]; // longitude, latitude
type Period = '7' | '30' | '90' | 'all';
type Pins = Record<string, [number, number]>; // pin -> [latitude, longitude]
type Kind = 'prep' | 'ship' | 'ret';
maplibregl.setWorkerUrl(workerUrl); // the map's helper thread, bundled with the site
type Ex = maplibregl.ExpressionSpecification;
const ex = (x: unknown) => x as Ex;

const DAY = 86400000;
const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;
/** A map call made while the map is still loading must never crash the page: try now, and again once the map is idle. */
const safely = (map: maplibregl.Map | null, fn: () => void) => {
  if (!map) return;
  try { fn(); } catch { map.once('idle', () => { try { fn(); } catch { /* the map is gone or still loading */ } }); }
};
const num = (n: number) => n.toLocaleString('en-IN');

// Your hub is fixed at Cherthala, Alappuzha. It cannot be moved from the map.
const HUB: LL = [76.3406, 9.6847];
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // a free OpenStreetMap map, no account or key needed
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'; // free terrain heights
const INDIA_BOUNDS: [LL, LL] = [[67.8, 6.0], [98.2, 37.6]];
const MAX_BOUNDS: [LL, LL] = [[50, -8], [110, 45]];
const PITCH_3D = 32;

const kindOf = (s: Order['status']): Kind | null => {
  if (s === 'Returned') return 'ret';
  if (s === 'Shipped' || s === 'Delivered' || s === 'Claims') return 'ship';
  if (s === 'Cancelled') return null;
  return 'prep';
};
const KCOLOR: Record<Kind, string> = { ship: '#084c99', prep: '#b45309', ret: '#b91c1c' };

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
  return (pin: string): LL | null => {
    const p = (pin || '').replace(/\D/g, '').slice(0, 6);
    if (pins[p]) return [pins[p][1], pins[p][0]];
    for (const len of [4, 3]) { const e = byPrefix.get(p.slice(0, len)); if (e) return [e.lng / e.n, e.lat / e.n]; }
    return null;
  };
};

// ── shapes ──
interface Geo { rings: LL[][]; bbox: [number, number, number, number]; center: LL; area: number }
interface RawGeometry { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
const geoOf = (g: RawGeometry): Geo => {
  const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][];
  const rings: LL[][] = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, best = -1, center: LL = [0, 0], area = 0;
  polys.forEach((poly) => poly.forEach((ring, ri) => {
    const r = ring.map(([x, y]) => [x, y] as LL);
    rings.push(r);
    r.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    if (ri === 0) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
      a /= 2;
      const ar = Math.abs(a);
      area += ar;
      if (ar > best) { best = ar; center = ar < 1e-9 ? r[0] : [cx / (6 * a), cy / (6 * a)]; }
    }
  }));
  return { rings, bbox: [x0, y0, x1, y1], center, area };
};
const inGeo = (g: Geo, x: number, y: number) => {
  if (x < g.bbox[0] || x > g.bbox[2] || y < g.bbox[1] || y > g.bbox[3]) return false;
  let n = 0;
  for (const r of g.rings) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) n += 1;
  }
  return n % 2 === 1;
};

// ── the look: a soft political atlas over real terrain. Neighbouring states never share a colour. ──
type RGB = [number, number, number];
const PALETTE: RGB[] = [[245, 200, 120], [160, 210, 130], [240, 150, 120], [130, 185, 235], [215, 150, 215], [240, 225, 100], [110, 205, 185]];
const GREY: RGB = [140, 150, 160];
const mix = (c: RGB, t: number, to: RGB = t > 0 ? [255, 255, 255] : [0, 0, 0]): string => {
  const k = Math.abs(t);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(c[0] + (to[0] - c[0]) * k)}${h(c[1] + (to[1] - c[1]) * k)}${h(c[2] + (to[2] - c[2]) * k)}`;
};
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

interface StateRec { name: string; norm: string; geo: Geo; ci: number }
interface DistRec { name: string; state: string; stateNorm: string; key: string; geo: Geo; geometry: RawGeometry; lv: number }
interface RawDistrict { properties: { d: string; s: string }; geometry: RawGeometry }

/** One colour per state, chosen so that states touching each other get different ones. */
const colourStates = (geos: Geo[], names: string[]): number[] => {
  const cells = new Map<string, Set<number>>();
  geos.forEach((g, i) => g.rings.forEach((r) => r.forEach(([x, y]) => { const key = `${Math.round(x * 5)},${Math.round(y * 5)}`; let s = cells.get(key); if (!s) { s = new Set(); cells.set(key, s); } s.add(i); })));
  const adj: Set<number>[] = geos.map(() => new Set());
  cells.forEach((set) => { if (set.size > 1) set.forEach((a) => set.forEach((b) => { if (a !== b) adj[a].add(b); })); });
  const order = geos.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size);
  const out: number[] = geos.map(() => -1);
  order.forEach((i) => {
    const used = new Set([...adj[i]].map((j) => out[j]));
    let c = 0; while (used.has(c) && c < PALETTE.length) c++;
    out[i] = c < PALETTE.length ? c : hash(names[i]) % PALETTE.length;
  });
  return out;
};

// ── lines from the hub: a gentle curve from a to b ──
const ARC_N = 28;
const arcLL = (a: LL, b: LL, side: number): LL[] => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const out: LL[] = [];
  for (let i = 0; i <= ARC_N; i++) {
    const t = i / ARC_N, s = Math.sin(Math.PI * t);
    out.push([a[0] + dx * t - dy * 0.12 * s * side, a[1] + dy * t + dx * 0.12 * s * side]);
  }
  return out;
};
const along = (coords: LL[], u: number): LL => {
  const f = Math.min(coords.length - 2, Math.max(0, Math.floor(u * (coords.length - 1))));
  const m = u * (coords.length - 1) - f;
  return [coords[f][0] + (coords[f + 1][0] - coords[f][0]) * m, coords[f][1] + (coords[f + 1][1] - coords[f][1]) * m];
};

interface Node {
  pin: string; state: string; stateNorm: string; district: string; ll: LL;
  prep: number; ship: number; ret: number; total: number;
  out: LL[]; back: LL[]; phase: number; rank: number;
}
interface Fresh { t0: number; kind: Kind }
interface Tip { x: number; y: number; title: string; lines: string[] }
const point = (c: LL, properties: Record<string, unknown>): Feature => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: c } });
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export const RealMapView: React.FC<MapViewProps> = ({ orders, onRefresh }) => {
  const box = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pins, setPins] = useState<Pins | null>(null);
  const [period, setPeriod] = useState<Period>('90');
  const [showSent, setShowSent] = useState(true);
  const [showPrep, setShowPrep] = useState(true);
  const [showReturn, setShowReturn] = useState(true);
  const [state, setStateRaw] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [dists, setDists] = useState<DistRec[] | null>(null);
  const setState = (v: string | null) => { setStateRaw(v); setDistrict(null); };
  const [flat, setFlat] = useState(false);
  const flatRef = useRef(false);
  flatRef.current = flat;
  const [relief, setRelief] = useState(!TOUCH);
  const [orbit, setOrbit] = useState(false); // drag turns the map instead of moving it
  const [spin, setSpin] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [events, setEvents] = useState<{ id: number; text: string; kind: Kind }[]>([]);

  useEffect(() => { void import('../../data/inPincodes.json').then((m) => setPins(m.default as unknown as Pins)).catch(() => setFailed(true)); }, []);
  useEffect(() => {
    void import('../../data/indiaDistricts.json').then((m) => {
      const raw = (m.default as unknown as { features: RawDistrict[] }).features;
      setDists(raw.map((f) => ({ name: f.properties.d, state: f.properties.s, stateNorm: normState(f.properties.s), key: `${normState(f.properties.s)}|${f.properties.d}`, geo: geoOf(f.geometry), geometry: f.geometry, lv: hash(f.properties.d) % 3 })));
    });
  }, []);
  const locate = useMemo(() => (pins ? makeLocator(pins) : null), [pins]);

  const states = useMemo<StateRec[]>(() => {
    const feats = (indiaStates as unknown as { features: { properties: { name: string }; geometry: RawGeometry }[] }).features;
    const geos = feats.map((f) => geoOf(f.geometry));
    const names = feats.map((f) => String(f.properties.name));
    const ci = colourStates(geos, names);
    return feats.map((f, i) => ({ name: names[i], norm: normState(names[i]), geo: geos[i], ci: ci[i] }));
  }, []);
  const stateByNorm = useMemo(() => new Map(states.map((s) => [s.norm, s])), [states]);

  // Numbers: every pin code that has orders, grouped by state
  const data = useMemo(() => {
    if (!locate) return null;
    const cut = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
    const nodes = new Map<string, Node>();
    const groups = new Map<string, { key: string; norm: string; total: number; prep: number; ship: number; ret: number; nodes: Node[] }>();
    let total = 0, delivered = 0, prep = 0, ret = 0, unplaced = 0;
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
        n = { pin, state: st, stateNorm: normState(st), district: '', ll: at, prep: 0, ship: 0, ret: 0, total: 0, out: arcLL(HUB, at, 1), back: arcLL(at, HUB, -1), phase: (parseInt(pin.slice(-3) || '0', 10) % 100) / 100, rank: 0 };
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
      const byState = new Map<string, DistRec[]>();
      dists.forEach((x) => { const l = byState.get(x.stateNorm); if (l) l.push(x); else byState.set(x.stateNorm, [x]); });
      nodes.forEach((n) => {
        let best: DistRec | null = null, bd = 1e9;
        for (const d of byState.get(n.stateNorm) || []) {
          if (inGeo(d.geo, n.ll[0], n.ll[1])) { best = d; break; }
          const dd = Math.hypot(d.geo.center[0] - n.ll[0], d.geo.center[1] - n.ll[1]);
          if (dd < bd) { bd = dd; best = d; }
        }
        if (best) n.district = best.name;
      });
    }
    nodes.forEach((n) => {
      const g = groups.get(n.state) || { key: n.state, norm: n.stateNorm, total: 0, prep: 0, ship: 0, ret: 0, nodes: [] };
      g.total += n.total; g.prep += n.prep; g.ship += n.ship; g.ret += n.ret; g.nodes.push(n);
      groups.set(n.state, g);
    });
    const list = [...groups.values()].sort((a, b) => b.total - a.total);
    [...nodes.values()].sort((a, b) => b.total - a.total || a.pin.localeCompare(b.pin)).forEach((n, i) => { n.rank = i; });
    const distTotals = new Map<string, { total: number; ret: number }>();
    nodes.forEach((n) => { const k = `${n.stateNorm}|${n.district}`; const e = distTotals.get(k) || { total: 0, ret: 0 }; e.total += n.total; e.ret += n.ret; distTotals.set(k, e); });
    return { list, nodes: [...nodes.values()], total, delivered, prep, ret, unplaced, distTotals };
  }, [orders, locate, period, dists]);

  const focusNorm = state ? normState(state) : district ? district.split('|')[0] : null;

  // everything the animation loop needs, kept in a ref so React never slows it down
  const R = useRef({
    data: null as typeof data, fresh: new Map<string, Fresh>(), spin: false, orbit: false, visible: true, focus: null as string | null,
    show: { ship: true, prep: true, ret: true }, hoverState: '', hoverDist: '', hadFresh: false,
  });
  R.current.data = data;
  R.current.spin = spin;
  R.current.orbit = orbit;
  R.current.focus = focusNorm;
  R.current.show = { ship: showSent, prep: showPrep, ret: showReturn };

  // ── make the map once ──
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el, style: STYLE, bounds: INDIA_BOUNDS, fitBoundsOptions: { padding: 12 }, pitch: PITCH_3D, bearing: 0,
        maxPitch: 78, minZoom: 3, cooperativeGestures: TOUCH, maxBounds: MAX_BOUNDS, attributionControl: { compact: true }, dragRotate: true, pitchWithRotate: true, canvasContextAttributes: { antialias: !TOUCH },
      });
    } catch { setFailed(true); return; }
    mapRef.current = map;
    map.on('error', (e) => { console.warn('[map]', String(e?.error?.message || e).slice(0, 240)); if (!started && /style|sprite|Failed to fetch/i.test(String(e?.error?.message || ''))) { /* the style never arrived; the failure note is shown after a wait */ } });
    const giveUp = setTimeout(() => { if (!started) setFailed(true); }, 25000);
    const store = R.current;
    let started = false;
    const setup = () => { if (started) return; started = true; try {
      const layers = map.getStyle().layers || [];
      // a calm base: sea colour behind everything, only English names of countries and seas, no shops, roads or foreign-language towns
      if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#a9d0ea');
      if (map.getLayer('natural_earth')) map.setLayoutProperty('natural_earth', 'visibility', 'none');
      if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#a9d0ea');
      layers.forEach((l) => {
        if (l.type !== 'symbol') return;
        if (/country|ocean|sea|water_name/i.test(l.id)) { map.setLayoutProperty(l.id, 'text-field', ex(['coalesce', ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']])); }
        else map.setLayoutProperty(l.id, 'visibility', 'none');
      });
      const firstSymbol = layers.find((l) => l.type === 'symbol' && /country|ocean|sea|water_name/i.test(l.id))?.id;
      // real terrain and light hill shading
      map.addSource('dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, encoding: 'terrarium', maxzoom: 11, attribution: 'Terrain: Mapzen, AWS' });
      if (!TOUCH) map.setTerrain({ source: 'dem', exaggeration: 1.5 });
      map.addLayer({ id: 'hills', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.28, 'hillshade-shadow-color': '#4a3b25', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#6b5a3c' } }, map.getLayer('water') ? 'water' : firstSymbol);

      // states and districts
      const rawStates = (indiaStates as unknown as FeatureCollection).features;
      const stateFC: FeatureCollection = { type: 'FeatureCollection', features: states.map((s, i) => ({ type: 'Feature', properties: { norm: s.norm, name: s.name, fill: mix(PALETTE[s.ci], 0), dim: mix(PALETTE[s.ci], 0.45, GREY) }, geometry: rawStates[i].geometry })) };
      map.addSource('states', { type: 'geojson', data: stateFC, promoteId: 'norm' });
      map.addSource('districts', { type: 'geojson', data: empty(), promoteId: 'key' });
      map.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': ex(['case', ['boolean', ['feature-state', 'dim'], false], ['get', 'dim'], ['get', 'fill']]), 'fill-opacity': ex(['interpolate', ['linear'], ['zoom'], 4, 0.52, 8, 0.4]) } }, firstSymbol);
      map.addLayer({ id: 'districts-fill', type: 'fill', source: 'districts', paint: { 'fill-color': ex(['case', ['boolean', ['feature-state', 'dim'], false], ['get', 'dim'], ['get', 'fill']]), 'fill-opacity': ex(['interpolate', ['linear'], ['zoom'], 4, 0.002, 5.5, 0.18, 7.5, 0.3]) } }, firstSymbol);
      map.addLayer({ id: 'states-hover', type: 'fill', source: 'states', paint: { 'fill-color': '#ffffff', 'fill-opacity': ex(['case', ['boolean', ['feature-state', 'hover'], false], 0.3, 0]) } }, firstSymbol);
      map.addLayer({ id: 'districts-hover', type: 'fill', source: 'districts', paint: { 'fill-color': '#ffffff', 'fill-opacity': ex(['case', ['boolean', ['feature-state', 'sel'], false], 0.42, ['boolean', ['feature-state', 'hover'], false], 0.28, 0]) } }, firstSymbol);
      map.addLayer({ id: 'districts-line', type: 'line', source: 'districts', layout: { 'line-join': 'round' }, paint: {
        'line-color': ex(['case', ['>', ['coalesce', ['feature-state', 'n'], 0], 0], '#0d6e64', '#5f4824']),
        'line-width': ex(['interpolate', ['linear'], ['zoom'], 4, ['case', ['>', ['coalesce', ['feature-state', 'n'], 0], 0], 1.1, 0.5], 8, ['case', ['boolean', ['feature-state', 'sel'], false], 3.2, ['>', ['coalesce', ['feature-state', 'n'], 0], 0], 2, 1.2]]),
        'line-opacity': ex(['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.8]),
      } }, firstSymbol);
      map.addLayer({ id: 'states-casing', type: 'line', source: 'states', layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ex(['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5]), 'line-opacity': 0.7 } }, firstSymbol);
      map.addLayer({ id: 'states-line', type: 'line', source: 'states', layout: { 'line-join': 'round' }, paint: { 'line-color': '#3d2a0e', 'line-width': ex(['interpolate', ['linear'], ['zoom'], 4, 1.2, 8, 2]), 'line-opacity': 0.85 } }, firstSymbol);

      // names and counts
      const stateLabels: FeatureCollection = { type: 'FeatureCollection', features: states.map((s) => point(s.geo.center, { name: s.name.replace(/ and /g, ' & ').toUpperCase(), norm: s.norm, area: s.geo.area })) };
      map.addSource('state-labels', { type: 'geojson', data: stateLabels });
      map.addLayer({ id: 'state-names', type: 'symbol', source: 'state-labels', maxzoom: 7.2, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ex(['interpolate', ['linear'], ['zoom'], 3.5, 9, 6, 13]), 'text-letter-spacing': 0.08, 'text-max-width': 7, 'symbol-sort-key': ex(['-', ['get', 'area']]) }, paint: { 'text-color': '#2e2008', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.8 } });
      map.addSource('badges', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'badges-dot', type: 'circle', source: 'badges', maxzoom: 7.2, paint: { 'circle-radius': 12, 'circle-color': '#062418', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.6, 'circle-translate': [0, 20] } });
      map.addLayer({ id: 'badges-text', type: 'symbol', source: 'badges', maxzoom: 7.2, layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-translate': [0, 20] } });
      map.addSource('district-labels', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'district-names', type: 'symbol', source: 'district-labels', minzoom: 5.6, layout: { 'text-field': ex(['case', ['>', ['get', 'n'], 0], ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'n']]], ['get', 'name']]), 'text-font': ['Noto Sans Bold'], 'text-size': ex(['interpolate', ['linear'], ['zoom'], 5.6, 10, 9, 13]), 'text-max-width': 7, 'symbol-sort-key': ex(['-', ['get', 'n']]) }, paint: { 'text-color': '#2e2008', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6 } });

      // orders: lines from the hub, pins, light pulses and new orders
      map.addSource('arcs', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'arcs-casing', type: 'line', source: 'arcs', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-opacity': 0.7, 'line-width': ex(['+', ['get', 'w'], 2.4]) } });
      map.addLayer({ id: 'arcs-solid', type: 'line', source: 'arcs', filter: ['==', ['get', 'kind'], 'ship'], layout: { 'line-cap': 'round' }, paint: { 'line-color': KCOLOR.ship, 'line-opacity': 0.92, 'line-width': ['get', 'w'] } });
      map.addLayer({ id: 'arcs-dash', type: 'line', source: 'arcs', filter: ['!=', ['get', 'kind'], 'ship'], paint: { 'line-color': ex(['match', ['get', 'kind'], 'prep', KCOLOR.prep, KCOLOR.ret]), 'line-opacity': 0.92, 'line-width': ['get', 'w'], 'line-dasharray': [2, 2] } });
      map.addSource('pins', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': ex(['interpolate', ['linear'], ['zoom'], 4, ['+', 2.5, ['*', 1.6, ['sqrt', ['get', 't']]]], 9, ['+', 5, ['*', 2.4, ['sqrt', ['get', 't']]]]]), 'circle-color': ex(['match', ['get', 'kind'], 'prep', KCOLOR.prep, 'ret', KCOLOR.ret, KCOLOR.ship]), 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'pin-codes', type: 'symbol', source: 'pins', minzoom: 8.2, layout: { 'text-field': ['get', 'pin'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-optional': true }, paint: { 'text-color': '#4a3a1e', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.6 } });
      map.addSource('pulses', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'pulses', type: 'circle', source: 'pulses', paint: { 'circle-radius': 4.2, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': ex(['match', ['get', 'kind'], 'prep', KCOLOR.prep, 'ret', KCOLOR.ret, KCOLOR.ship]) } });
      map.addSource('fresh-line', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'fresh-casing', type: 'line', source: 'fresh-line', paint: { 'line-color': '#fff', 'line-width': 10, 'line-opacity': ['get', 'o'] } });
      map.addLayer({ id: 'fresh-core', type: 'line', source: 'fresh-line', paint: { 'line-color': ex(['match', ['get', 'kind'], 'ret', '#dc2626', '#ea8a04']), 'line-width': 5, 'line-opacity': ['get', 'o'] } });
      map.addSource('fresh-ring', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'fresh-ring', type: 'circle', source: 'fresh-ring', paint: { 'circle-radius': ['get', 'r'], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2.5, 'circle-stroke-color': ex(['match', ['get', 'kind'], 'ret', '#dc2626', '#ea8a04']), 'circle-stroke-opacity': ['get', 'o'] } });

      // the hub, fixed at Cherthala
      const hub = document.createElement('div');
      hub.className = 'zl-hub';
      hub.innerHTML = '<i class="zl-hub-ring"></i><i class="zl-hub-ring zl-hub-ring2"></i><span class="zl-hub-dot"></span><b>HUB</b>';
      hub.title = 'Your hub: Cherthala, Alappuzha';
      new maplibregl.Marker({ element: hub, anchor: 'center' }).setLngLat(HUB).addTo(map);
      setReady(true);
    } catch (err) { console.warn('[map] setup failed', String((err as Error)?.message || err)); started = false; setFailed(true); } };
    map.on('style.load', setup);
    map.on('load', setup);
    const io = new IntersectionObserver((e) => { R.current.visible = e[0]?.isIntersecting ?? true; });
    io.observe(el);
    return () => { clearTimeout(giveUp); io.disconnect(); map.remove(); mapRef.current = null; store.hoverState = ''; store.hoverDist = ''; setReady(false); };
  }, [states]);

  // a little stylesheet for the hub pin
  useEffect(() => {
    if (document.getElementById('zl-hub-css')) return;
    const st = document.createElement('style');
    st.id = 'zl-hub-css';
    st.textContent = `.zl-hub{position:relative;width:34px;height:34px;pointer-events:auto}.zl-hub-dot{position:absolute;inset:9px;border-radius:50%;background:#062018;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)}.zl-hub b{position:absolute;left:50%;top:-18px;transform:translateX(-50%);font:700 11px DM Sans,system-ui,sans-serif;color:#2e2008;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}.zl-hub-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(13,110,100,.8);animation:zl-ring 2.2s ease-out infinite}.zl-hub-ring2{animation-delay:1.1s}@keyframes zl-ring{from{transform:scale(.4);opacity:.9}to{transform:scale(2.2);opacity:0}}`;
    document.head.appendChild(st);
  }, []);

  // ── feed the map: districts, labels, lines and pins ──
  const distFeatures = useMemo(() => {
    if (!dists) return null;
    const stateColour = new Map(states.map((s) => [s.norm, s.ci]));
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const labels: FeatureCollection = { type: 'FeatureCollection', features: [] };
    dists.forEach((d) => {
      const base = PALETTE[stateColour.get(d.stateNorm) ?? 0];
      const f = [-0.1, 0, 0.12][d.lv];
      fc.features.push({ type: 'Feature', properties: { key: d.key, name: d.name, stateNorm: d.stateNorm, fill: mix(base, f), dim: mix(base, 0.5, GREY) }, geometry: d.geometry as Geometry });
      labels.features.push(point(d.geo.center, { key: d.key, name: d.name, stateNorm: d.stateNorm, n: 0 }));
    });
    return { fc, labels };
  }, [dists, states]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !distFeatures) return;
    safely(map, () => (map.getSource('districts') as maplibregl.GeoJSONSource | undefined)?.setData(distFeatures.fc));
  }, [ready, distFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !distFeatures) return;
    // counts on the district names, and a feature state for the teal edge
    const labels: FeatureCollection = { type: 'FeatureCollection', features: distFeatures.labels.features.map((f) => ({ ...f, properties: { ...f.properties, n: data?.distTotals.get(String(f.properties?.key))?.total || 0 } })) };
    safely(map, () => (map.getSource('district-labels') as maplibregl.GeoJSONSource | undefined)?.setData(labels));
  }, [ready, distFeatures, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    const arcs: Feature[] = [], pinsF: Feature[] = [], badges: Feature[] = [];
    const maxTotal = Math.max(1, ...data.nodes.map((q) => q.total));
    for (const n of data.nodes) {
      const w = 0.9 + 1.7 * Math.sqrt(n.total / maxTotal);
      const base = { stateNorm: n.stateNorm, pin: n.pin, w: Math.round(w * 10) / 10 };
      if (n.ship) arcs.push({ type: 'Feature', properties: { ...base, kind: 'ship' }, geometry: { type: 'LineString', coordinates: n.out } });
      if (n.prep) arcs.push({ type: 'Feature', properties: { ...base, kind: 'prep' }, geometry: { type: 'LineString', coordinates: n.out } });
      if (n.ret) arcs.push({ type: 'Feature', properties: { ...base, kind: 'ret' }, geometry: { type: 'LineString', coordinates: n.back } });
      const kind: Kind = n.ret / n.total > 0.25 ? 'ret' : n.prep > 0 && !n.ship ? 'prep' : 'ship';
      pinsF.push(point(n.ll, { pin: n.pin, kind, t: n.total, stateNorm: n.stateNorm, district: n.district }));
    }
    data.list.forEach((g) => { const s = stateByNorm.get(g.norm); if (s) badges.push(point(s.geo.center, { n: g.total, norm: g.norm })); });
    safely(map, () => (map.getSource('arcs') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: arcs }));
    safely(map, () => (map.getSource('pins') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pinsF }));
    safely(map, () => (map.getSource('badges') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: badges }));
  }, [ready, data, stateByNorm]);

  // the teal edge on districts that have orders
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !distFeatures || !data) return;
    const apply = () => {
      safely(map, () => distFeatures.fc.features.forEach((f) => { const k = String(f.properties?.key); map.setFeatureState({ source: 'districts', id: k }, { n: data.distTotals.get(k)?.total || 0 }); }));
    };
    if (map.isSourceLoaded('districts')) apply(); else map.once('idle', apply);
  }, [ready, distFeatures, data]);

  // ── what is shown: kinds on or off, and only the state you opened ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    safely(map, () => {
    const kinds = [showSent && 'ship', showPrep && 'prep', showReturn && 'ret'].filter(Boolean) as Kind[];
    const base: unknown[] = ['all', ['in', ['get', 'kind'], ['literal', kinds]]];
    if (focusNorm) base.push(['==', ['get', 'stateNorm'], focusNorm]);
    map.setFilter('arcs-casing', ex(base));
    map.setFilter('arcs-solid', ex([...base, ['==', ['get', 'kind'], 'ship']]));
    map.setFilter('arcs-dash', ex([...base, ['!=', ['get', 'kind'], 'ship']]));
    const only: unknown[] = focusNorm ? ['==', ['get', 'stateNorm'], focusNorm] : ['all'];
    map.setFilter('pins', ex(only));
    map.setFilter('pin-codes', ex(only));
    map.setFilter('badges-dot', focusNorm ? ex(['==', ['get', 'norm'], '__none__']) : null);
    map.setFilter('badges-text', focusNorm ? ex(['==', ['get', 'norm'], '__none__']) : null);
    map.setFilter('district-names', focusNorm ? ex(['==', ['get', 'stateNorm'], focusNorm]) : null);
    map.setLayoutProperty('district-names', 'text-allow-overlap', false);
    });
  }, [ready, showSent, showPrep, showReturn, focusNorm]);

  // the state you opened stands out; the rest fades
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    safely(map, () => states.forEach((s) => map.setFeatureState({ source: 'states', id: s.norm }, { dim: !!focusNorm && s.norm !== focusNorm })));
    if (!dists) return;
    safely(map, () => dists.forEach((d) => map.setFeatureState({ source: 'districts', id: d.key }, { dim: !!focusNorm && d.stateNorm !== focusNorm, sel: d.key === district })));
  }, [ready, focusNorm, district, states, dists]);

  // fly to what you picked
  const fitTo = useCallback((b: [number, number, number, number], maxZoom: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 110, bottom: 50, left: 50, right: 50 }, maxZoom, duration: 1300, pitch: flatRef.current ? 0 : Math.max(map.getPitch(), 40) });
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (district && dists) {
      const d = dists.find((x) => x.key === district);
      if (d) { fitTo(d.geo.bbox, 10.5); return; }
    }
    if (focusNorm) { const s = stateByNorm.get(focusNorm); if (s) { fitTo(s.geo.bbox, 9); return; } }
    map.fitBounds(INDIA_BOUNDS, { padding: 12, duration: 1300, pitch: flatRef.current ? 0 : PITCH_3D, bearing: 0 });
  }, [ready, focusNorm, district, dists, stateByNorm, fitTo]);

  // flat or 3D, and the terrain relief
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ pitch: flat ? 0 : Math.max(map.getPitch(), PITCH_3D), duration: 700 });
  }, [flat, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    safely(map, () => { map.setTerrain(relief ? { source: 'dem', exaggeration: 1.5 } : null); map.setLayoutProperty('hills', 'visibility', relief ? 'visible' : 'none'); });
  }, [relief, ready]);

  // ── hover and click ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let tipKey = '';
    const pick = (pt: maplibregl.Point) => {
      const p = map.queryRenderedFeatures(pt, { layers: ['pins'] })[0];
      if (p) return { kind: 'pin' as const, key: String(p.properties?.pin), f: p };
      if (R.current.focus || map.getZoom() >= 5.2) {
        const d = map.queryRenderedFeatures(pt, { layers: ['districts-fill'] }).find((x) => !R.current.focus || x.properties?.stateNorm === R.current.focus);
        if (d) return { kind: 'district' as const, key: String(d.properties?.key), f: d };
      }
      const s = map.queryRenderedFeatures(pt, { layers: ['states-fill'] })[0];
      if (s) return { kind: 'state' as const, key: String(s.properties?.norm), f: s };
      return null;
    };
    const setHover = (kind: string, key: string) => {
      if (R.current.hoverState && (kind !== 'state' || key !== R.current.hoverState)) { map.setFeatureState({ source: 'states', id: R.current.hoverState }, { hover: false }); R.current.hoverState = ''; }
      if (R.current.hoverDist && (kind !== 'district' || key !== R.current.hoverDist)) { map.setFeatureState({ source: 'districts', id: R.current.hoverDist }, { hover: false }); R.current.hoverDist = ''; }
      if (kind === 'state' && !R.current.hoverState) { map.setFeatureState({ source: 'states', id: key }, { hover: true }); R.current.hoverState = key; }
      if (kind === 'district' && !R.current.hoverDist) { map.setFeatureState({ source: 'districts', id: key }, { hover: true }); R.current.hoverDist = key; }
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (TOUCH) return;
      const h = pick(e.point);
      map.getCanvas().style.cursor = h ? 'pointer' : R.current.orbit ? 'move' : '';
      setHover(h?.kind || '', h?.key || '');
      const key = h ? `${h.kind}:${h.key}` : '';
      if (key === tipKey) { const t = tipEl.current; if (t) { t.style.left = `${Math.min(e.point.x + 14, map.getContainer().clientWidth - 190)}px`; t.style.top = `${Math.max(8, e.point.y - 12)}px`; } return; }
      tipKey = key;
      const d = R.current.data;
      if (!h || !d) { setTip(null); return; }
      const at = (title: string, lines: string[]) => setTip({ x: e.point.x, y: e.point.y, title, lines });
      if (h.kind === 'pin') {
        const n = d.nodes.find((q) => q.pin === h.key);
        if (n) at(`${n.pin}${n.district ? ' · ' + n.district : ''}`, [n.state, `${n.total} order${n.total === 1 ? '' : 's'}`, [n.ship && `${n.ship} sent`, n.prep && `${n.prep} waiting`, n.ret && `${n.ret} returned`].filter(Boolean).join(' · ')]);
      } else if (h.kind === 'district') {
        const t = d.distTotals.get(h.key);
        at(String(h.f.properties?.name), [stateByNorm.get(h.key.split('|')[0])?.name || '', t ? `${t.total} order${t.total === 1 ? '' : 's'}${t.ret ? ` · ${t.ret} returned` : ''}` : 'No orders yet']);
      } else {
        const g = d.list.find((s) => s.norm === h.key);
        at(String(h.f.properties?.name), g ? [`${num(g.total)} orders`, `${g.nodes.length} pin codes`, g.ret ? `${g.ret} returned` : ''].filter(Boolean) : ['No orders yet']);
      }
    };
    const onLeave = () => { setHover('', ''); tipKey = ''; setTip(null); };
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (R.current.orbit) return;
      const h = pick(e.point);
      if (!h) return;
      tipKey = ''; setTip(null);
      if (h.kind === 'district') {
        const sn = h.key.split('|')[0];
        const g = R.current.data?.list.find((s) => s.norm === sn);
        setStateRaw(g?.key ?? stateByNorm.get(sn)?.name ?? null);
        setDistrict((cur) => (cur === h.key ? null : h.key));
      } else if (h.kind === 'state') {
        const g = R.current.data?.list.find((s) => s.norm === h.key);
        setState(g?.key ?? stateByNorm.get(h.key)?.name ?? null);
      } else if (h.kind === 'pin') {
        const n = R.current.data?.nodes.find((q) => q.pin === h.key);
        if (n && stateByNorm.get(n.stateNorm)) {
          setStateRaw(n.state);
          setDistrict(n.district ? `${n.stateNorm}|${n.district}` : null);
        }
      }
    };
    map.on('mousemove', onMove); map.on('mouseout', onLeave); map.on('click', onClick);
    return () => { map.off('mousemove', onMove); map.off('mouseout', onLeave); map.off('click', onClick); };
  }, [ready, stateByNorm]);

  // ── "Rotate" mode: a drag turns and tilts the map instead of moving it ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const el = map.getCanvasContainer();
    if (orbit) { map.dragPan.disable(); map.dragRotate.disable(); el.style.touchAction = 'none'; }
    else { map.dragPan.enable(); map.dragRotate.enable(); el.style.touchAction = ''; }
    let id = -1, lx = 0, ly = 0;
    const pd = (e: PointerEvent) => { if (!orbit || id !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return; id = e.pointerId; lx = e.clientX; ly = e.clientY; setSpin(false); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
    const pm = (e: PointerEvent) => { if (e.pointerId !== id) return; map.setBearing(map.getBearing() - (e.clientX - lx) * 0.4); map.setPitch(Math.min(78, Math.max(0, map.getPitch() - (e.clientY - ly) * 0.3))); lx = e.clientX; ly = e.clientY; };
    const pu = (e: PointerEvent) => { if (e.pointerId === id) id = -1; };
    el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm); el.addEventListener('pointerup', pu); el.addEventListener('pointercancel', pu);
    return () => { el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm); el.removeEventListener('pointerup', pu); el.removeEventListener('pointercancel', pu); map.dragPan.enable(); map.dragRotate.enable(); el.style.touchAction = ''; };
  }, [orbit, ready]);

  // ── the moving light: pulses along the lines, and new orders ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!R.current.visible || document.visibilityState === 'hidden') return;
      if (R.current.spin && !map.isMoving()) map.setBearing(map.getBearing() + dt * 16);
      acc += dt;
      if (acc < 1 / 24) return; // about 24 updates a second is plenty
      acc = 0;
      const d = R.current.data, sec = now / 1000, focus = R.current.focus, show = R.current.show;
      const pulses: Feature[] = [];
      if (d) {
        const limit = focus ? 90 : 50;
        for (const n of d.nodes) {
          if (focus && n.stateNorm !== focus) continue;
          if (!focus && n.rank >= limit && !R.current.fresh.has(n.pin) && n.prep === 0) continue;
          const speed = 0.16 + 0.1 * n.phase;
          if (show.ship && n.ship) pulses.push(point(along(n.out, (sec * speed + n.phase) % 1), { kind: 'ship' }));
          if (show.prep && n.prep) pulses.push(point(along(n.out, (sec * speed * 1.3 + n.phase) % 1), { kind: 'prep' }));
          if (show.ret && n.ret) pulses.push(point(along(n.back, (sec * speed + n.phase) % 1), { kind: 'ret' }));
        }
      }
      safely(map, () => (map.getSource('pulses') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pulses }));
      // a new order: a bright line drawn from the hub, then rings at its pin code
      const lines: Feature[] = [], rings: Feature[] = [];
      R.current.fresh.forEach((f, pin) => {
        const n = d?.nodes.find((x) => x.pin === pin);
        const age = (performance.now() - f.t0) / 1000;
        if (!n || age >= 8) { if (age >= 8) R.current.fresh.delete(pin); return; }
        const fade = 1 - Math.max(0, age - 5) / 3, prog = Math.min(1, age / 1.4);
        const coords = f.kind === 'ret' ? n.back : n.out;
        lines.push({ type: 'Feature', properties: { kind: f.kind, o: fade }, geometry: { type: 'LineString', coordinates: coords.slice(0, Math.max(2, Math.floor(coords.length * prog))) } });
        if (age > 1.2) for (let q = 0; q < 2; q++) { const a = ((age - 1.2 + q * 0.9) % 1.8) / 1.8; rings.push(point(n.ll, { kind: f.kind, r: 6 + a * 34, o: (1 - a) * 0.9 })); }
      });
      if (lines.length || R.current.hadFresh) {
        safely(map, () => (map.getSource('fresh-line') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: lines }));
        safely(map, () => (map.getSource('fresh-ring') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: rings }));
      }
      R.current.hadFresh = lines.length > 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // New orders and status changes light up as they arrive
  const seen = useRef<Map<string, Order['status']> | null>(null);
  useEffect(() => {
    if (!locate) return;
    if (!seen.current && orders.length === 0) return;
    const prev = seen.current;
    seen.current = new Map(orders.map((o) => [o.id, o.status] as [string, Order['status']]));
    if (!prev) return; // the first look: everything is old
    const found: { id: number; text: string; kind: Kind }[] = [];
    orders.forEach((o) => {
      const was = prev.get(o.id);
      if (was === o.status) return;
      const k = kindOf(o.status);
      if (!k || !locate(o.customer.pinCode)) return;
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
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    if (!onRefresh) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshRef.current?.(); }, 15000);
    return () => clearInterval(t);
  }, [!!onRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    setSpin(false);
    if (district || focusNorm) { setStateRaw(state); setDistrict(null); }
    map.fitBounds(focusNorm && stateByNorm.get(focusNorm) ? [[stateByNorm.get(focusNorm)!.geo.bbox[0], stateByNorm.get(focusNorm)!.geo.bbox[1]], [stateByNorm.get(focusNorm)!.geo.bbox[2], stateByNorm.get(focusNorm)!.geo.bbox[3]]] : INDIA_BOUNDS, { padding: focusNorm ? { top: 110, bottom: 50, left: 50, right: 50 } : 12, pitch: flat ? 0 : PITCH_3D, bearing: 0, duration: 1000 });
  };

  // every district of the state in focus, with its orders
  const distRows = useMemo(() => {
    if (!focusNorm || !dists || !data) return [];
    return dists.filter((x) => x.stateNorm === focusNorm).map((x) => {
      const t = data.distTotals.get(x.key);
      return { key: x.key, name: x.name, total: t?.total || 0, ret: t?.ret || 0, pins: data.nodes.filter((n) => n.stateNorm === x.stateNorm && n.district === x.name).length };
    }).sort((p, q) => q.total - p.total || p.name.localeCompare(q.name));
  }, [focusNorm, dists, data]);
  const stateName = state || (focusNorm ? stateByNorm.get(focusNorm)?.name : null) || null;
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
        <section className="rounded-[28px] overflow-hidden relative" style={{ background: '#cfe3ef', boxShadow: '0 18px 50px -24px rgba(20,60,100,.55)' }} aria-label="Map">
          <div className="h-[24rem] md:h-[40rem] w-full relative">
            <div ref={box} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} role="application" aria-label="3D map of India with every state and district, and a line from your hub to every pin code that has orders" />
            {failed && <p className="absolute inset-0 grid place-items-center text-sm p-6 text-center" style={{ color: '#0b2a40' }}>This browser could not start the 3D map. Try Chrome or Safari with hardware acceleration on.</p>}
            {!pins && !failed && <p className="absolute left-1/2 -translate-x-1/2 bottom-16 text-xs rounded-full px-3 py-1.5 z-10" style={GLASS}>Loading pin codes…</p>}
            <ul className="absolute left-3 bottom-8 z-10 space-y-1.5 max-w-[16rem] pointer-events-none" aria-live="polite">
              {events.map((e) => (
                <li key={e.id} className="text-xs font-semibold text-white rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(4,17,26,.88)', border: `1px solid ${dotColor(e.kind)}` }}>
                  <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: dotColor(e.kind) }} />{e.text}
                </li>
              ))}
            </ul>
            {tip && (
              <div ref={tipEl} className="absolute z-20 pointer-events-none text-white text-xs rounded-xl px-3 py-2 shadow-xl" style={{ left: tip.x + 14, top: Math.max(8, tip.y - 12), background: 'rgba(4,17,26,.92)', border: '1px solid rgba(56,225,255,.5)', maxWidth: 180 }}>
                <p className="font-bold">{tip.title}</p>
                {tip.lines.map((l, i) => (l ? <p key={i} className="opacity-80">{l}</p> : null))}
              </div>
            )}
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
            <button onClick={() => mapRef.current?.zoomIn({ duration: 300 })} aria-label="Zoom in" type="button" className="flex items-center justify-center rounded-full w-11 h-11" style={GLASS}><ZoomIn className="w-4 h-4" /></button>
            <button onClick={() => mapRef.current?.zoomOut({ duration: 300 })} aria-label="Zoom out" type="button" className="flex items-center justify-center rounded-full w-11 h-11" style={GLASS}><ZoomOut className="w-4 h-4" /></button>
          </div>

          {/* The buttons sit under the map, so nothing covers it */}
          <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3 text-xs font-semibold" style={{ background: 'rgba(255,252,244,.97)', color: '#1b1209', borderTop: '1px solid rgba(60,40,10,.15)' }}>
            <button onClick={() => setOrbit((v) => !v)} aria-label="Rotate the map with your finger or mouse" aria-pressed={orbit} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(orbit, '#0f766e')} title="Drag the map to turn it all the way round and tilt it. You can also right-click and drag."><Rotate3d className="w-4 h-4" /> <span className="max-md:hidden">Rotate</span></button>
            <button onClick={() => setSpin((v) => !v)} aria-label={spin ? 'Stop spinning' : 'Spin the map'} aria-pressed={spin} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(spin, '#0f766e')}>{spin ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} <span className="max-md:hidden">{spin ? 'Stop' : 'Spin'}</span></button>
            <button onClick={resetView} aria-label="Reset the view" className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={GLASS}><Maximize className="w-4 h-4" /> <span className="max-md:hidden">Reset view</span></button>
            <button onClick={() => setFlat((v) => !v)} aria-label="Switch 3D and flat view" aria-pressed={flat} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={GLASS}><Move3d className="w-4 h-4" /> <span className="max-md:hidden">{flat ? '3D view' : 'Flat view'}</span></button>
            <button onClick={() => setRelief((v) => !v)} aria-label="Show mountains and hills in 3D" aria-pressed={relief} className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={chip(relief, '#0f766e')}><Mountain className="w-4 h-4" /> <span className="max-md:hidden">Hills</span></button>
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
                  <button onClick={() => { if (stateByNorm.get(s.norm)) setState(s.key); }} disabled={!stateByNorm.get(s.norm)} className="k-row w-full text-left px-4 py-3 flex items-center gap-3 disabled:opacity-60">
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
