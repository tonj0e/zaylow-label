import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Combine, Loader2, Package, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { useCached } from '../../hooks/useCached';
import { CACHE } from '../../services/prefetch';
import { fetchCached } from '../../services/swrCache';
import { PriceService, priceKey, type PriceMap } from '../../services/priceService';

interface Product {
  id: string;
  sku: string | null;
  qr_code: string | null;
  barcode: string | null;
  product_name: string;
  status: string;
  reserved_at: string | null;
  order_id: string | null;
  customer_name: string | null;
  carton_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Carton { id: string; location: string | null }

const PAGE_SIZE = 10;
const shortCode = (id: string) => id.slice(-6).toUpperCase();
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

type Bucket = 'In Stock' | 'Reserved' | 'Packed' | 'Shipped' | 'Delivered' | 'Returned' | 'Other';
const BUCKETS: Bucket[] = ['In Stock', 'Reserved', 'Packed', 'Shipped', 'Delivered', 'Returned', 'Other'];
const bucketOf = (status: string): Bucket => (BUCKETS.includes(status as Bucket) ? (status as Bucket) : 'Other');

const BUCKET_COLOR: Record<Bucket, string> = {
  'In Stock': 'var(--lime)',
  Reserved: 'var(--warn)',
  Packed: 'var(--muted)',
  Shipped: 'color-mix(in srgb, var(--lime) 62%, var(--card))',
  Delivered: 'color-mix(in srgb, var(--lime) 38%, var(--card))',
  Returned: 'color-mix(in srgb, var(--bad) 60%, var(--card))',
  Other: 'var(--bad)',
};

const pillStyle = (status: string): React.CSSProperties => {
  switch (bucketOf(status)) {
    case 'In Stock': return { background: 'color-mix(in srgb, var(--lime) 18%, transparent)', color: 'var(--lime-text)' };
    case 'Reserved': return { background: 'color-mix(in srgb, var(--warn) 16%, transparent)', color: 'var(--warn)' };
    case 'Shipped':
    case 'Delivered': return { background: 'var(--lime)', color: 'var(--on-lime)' };
    case 'Packed': return { background: 'var(--card2)', color: 'var(--ink)' };
    default: return { background: 'color-mix(in srgb, var(--bad) 15%, transparent)', color: 'var(--bad)' };
  }
};

/** 1 2 3 … 7: first and last page, plus the pages next to the current one. */
const pageList = (current: number, last: number): (number | '…')[] => {
  const keep = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach((n) => { if (n - prev > 1) out.push('…'); out.push(n); prev = n; });
  return out;
};

const skuNum = (p: Product) => parseInt((p.sku || '').replace(/\D+/g, '') || '0', 10);

interface Group { key: string; name: string; items: Product[]; counts: Record<Bucket, number> }

export const ProductsView = () => {
  const productsC = useCached<Product[]>(CACHE.products.key, CACHE.products.fetch);
  const cartonsC = useCached<Carton[]>(CACHE.cartons.key, CACHE.cartons.fetch);
  const products = useMemo(() => productsC.data ?? [], [productsC.data]);
  const cartons = useMemo(() => cartonsC.data ?? [], [cartonsC.data]);
  const loading = productsC.loading || cartonsC.loading;
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket | 'all'>('all');
  const [unitSearch, setUnitSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const pricesC = useCached<{ prices: PriceMap; shared: boolean }>(CACHE.prices.key, CACHE.prices.fetch);
  const [editPrice, setEditPrice] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState('');
  const [combine, setCombine] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [combineConfirm, setCombineConfirm] = useState(false);
  const [combining, setCombining] = useState(false);
  const [combineNote, setCombineNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { await Promise.all([productsC.refresh(), cartonsC.refresh()]); }
    catch (err) { console.error(err); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    products.forEach((p) => {
      const key = keyOf(p.product_name || 'Unnamed product');
      const g = map.get(key) || { key, name: (p.product_name || 'Unnamed product').trim(), items: [], counts: { 'In Stock': 0, Reserved: 0, Packed: 0, Shipped: 0, Delivered: 0, Returned: 0, Other: 0 } };
      g.items.push(p); g.counts[bucketOf(p.status)] += 1;
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [products]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q) || g.items.some((p) => (p.sku || '').toLowerCase().includes(q)));
  }, [groups, search]);

  const selected = groups.find((g) => g.key === selectedKey) || visibleGroups[0] || null;

  const cartonName = useMemo(() => {
    const m = new Map<string, string>();
    cartons.forEach((c) => m.set(c.id, c.location || shortCode(c.id)));
    return m;
  }, [cartons]);

  const units = useMemo(() => {
    if (!selected) return [];
    const q = unitSearch.trim().toLowerCase();
    return selected.items
      .filter((p) => (filter === 'all' || bucketOf(p.status) === filter) && (!q || [p.sku, p.customer_name, p.order_id, p.id].some((v) => v?.toLowerCase().includes(q))))
      .sort((a, b) => skuNum(a) - skuNum(b) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [selected, filter, unitSearch]);

  const lastPage = Math.max(1, Math.ceil(units.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const rows = units.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const skuRange = useMemo(() => {
    if (!selected) return '';
    const withSku = selected.items.filter((p) => p.sku).map((p) => p.sku as string).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return withSku.length ? (withSku.length === 1 ? withSku[0] : `${withSku[0]} to ${withSku[withSku.length - 1]}`) : 'No SKUs yet';
  }, [selected]);

  const pick = (key: string) => {
    setSelectedKey(key); setFilter('all'); setUnitSearch(''); setPage(1); setConfirmId(null);
    if (window.matchMedia('(max-width: 1279px)').matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const remove = async (id: string) => {
    setDeleting(true);
    try { await DataService.deleteProduct(id); setConfirmId(null); await load(); }
    catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const togglePick = (key: string, name: string) => {
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key); else n.add(key);
      // suggest the name of the biggest picked product
      const biggest = groups.filter((g) => n.has(g.key)).sort((a, b) => b.items.length - a.items.length)[0];
      setTarget(biggest ? biggest.name : name);
      return n;
    });
    setCombineConfirm(false); setCombineNote(null);
  };

  const pickedGroups = groups.filter((g) => picked.has(g.key));
  const pickedUnits = pickedGroups.reduce((n, g) => n + g.items.length, 0);

  const runCombine = async () => {
    setCombining(true); setCombineNote(null);
    const names = pickedGroups.flatMap((g) => g.items.map((p) => p.product_name));
    const count = await DataService.renameProducts(names, target);
    if (count === null) { setCombineNote({ ok: false, text: 'Could not combine the products. Check your connection and try again.' }); }
    else {
      // the combined product keeps the price of the biggest product that had one
      const prices = pricesC.data?.prices ?? {};
      const withPrice = pickedGroups.sort((a, b) => b.items.length - a.items.length).find((g) => prices[g.key] > 0);
      if (withPrice && !(prices[priceKey(target)] > 0)) await PriceService.save(target, prices[withPrice.key]);
      await Promise.all([productsC.refresh(), pricesC.refresh(), fetchCached(CACHE.inventoryOut.key, CACHE.inventoryOut.fetch, 0), fetchCached(CACHE.overview.key, CACHE.overview.fetch, 0)]);
      setCombineNote({ ok: true, text: `${count} units now sit under “${target.trim()}”.` });
      setCombine(false); setPicked(new Set()); setSelectedKey(priceKey(target)); setCombineConfirm(false);
    }
    setCombining(false);
  };

  const savePrice = async () => {
    if (!selected || editPrice === null) return;
    const amount = parseInt(editPrice, 10) || 0;
    const where = await PriceService.save(selected.name, amount);
    await pricesC.refresh();
    setEditPrice(null);
    setPriceNote(where === 'browser' ? 'Saved on this computer only. Run the one-time database step to share prices with other computers.' : 'Price saved.');
  };

  const total = products.length;
  const inStock = products.filter((p) => p.status === 'In Stock').length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Products</h2>
          <p className="text-sm k-muted mt-1">Every unit you have made, grouped by product. Pick a product to see each unit.</p>
        </div>
        <div className="flex gap-6 items-end">
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{loading ? '…' : groups.length}</p><p className="text-xs k-muted mt-1">products</p></div>
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{loading ? '…' : inStock.toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1">of {total.toLocaleString('en-IN')} units in stock</p></div>
          <button onClick={() => void load()} aria-label="Refresh products" className="k-btn k-btn-ghost w-10 h-10"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">
        {/* Product list */}
        <section aria-label="Products" className="min-w-0 xl:sticky xl:top-28">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU" aria-label="Search products" className="k-field" style={{ paddingLeft: '2.4rem' }} />
            </div>
            <button onClick={() => { setCombine((v) => !v); setPicked(new Set()); setCombineConfirm(false); setCombineNote(null); }} aria-pressed={combine} title="Combine products that are really the same one" className={`k-btn px-4 text-sm shrink-0 ${combine ? 'k-btn-ink' : 'k-btn-soft'}`}><Combine className="w-4 h-4" /> Combine</button>
          </div>
          {combineNote && <p role={combineNote.ok ? 'status' : 'alert'} className="text-sm font-medium mb-3 flex items-start gap-2" style={combineNote.ok ? undefined : { color: 'var(--bad)' }}>{combineNote.ok && <Check className="w-4 h-4 mt-0.5 shrink-0 k-lime-text" />}{combineNote.text}</p>}
          {combine && <p className="text-sm k-muted mb-3">Tick the products that are really one product, for example “MASSAGER” and “period massager”. Then choose the name to keep.</p>}
          <div className="k-card overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="k-skel h-20 rounded-2xl animate-pulse" />)}</div>
            ) : visibleGroups.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <Package className="w-8 h-8 mx-auto k-muted mb-2" />
                <p className="font-bold">{groups.length === 0 ? 'No products yet' : 'No product matches'}</p>
                <p className="text-sm k-muted mt-1">{groups.length === 0 ? 'Add products inside a carton on the Cartons page.' : 'Try another search.'}</p>
              </div>
            ) : (
              <ul className="max-h-[34rem] overflow-y-auto">
                {visibleGroups.map((g) => {
                  const on = selected?.key === g.key;
                  return (
                    <li key={g.key} className="border-t k-rule first:border-t-0">
                      <button onClick={() => (combine ? togglePick(g.key, g.name) : pick(g.key))} aria-pressed={combine ? picked.has(g.key) : on} className="k-row w-full text-left px-4 py-3.5" style={(combine ? picked.has(g.key) : on) ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-bold truncate flex items-center gap-2">{combine && <input type="checkbox" readOnly checked={picked.has(g.key)} tabIndex={-1} aria-hidden="true" className="w-4 h-4 pointer-events-none" />}{g.name}</span>
                          <span className="text-sm k-muted tabular-nums shrink-0">{g.items.length} units</span>
                        </span>
                        <span className="flex h-1.5 rounded-full overflow-hidden gap-px mt-2.5 k-track" aria-hidden="true">
                          {BUCKETS.map((b) => g.counts[b] > 0 && <span key={b} style={{ flex: g.counts[b], background: BUCKET_COLOR[b] }} />)}
                        </span>
                        <span className="block text-xs k-muted mt-1.5"><span className="font-semibold" style={{ color: 'var(--ink)' }}>{g.counts['In Stock']}</span> in stock</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {combine && picked.size >= 1 && (
            <div className="k-card p-5 mt-3 space-y-3 k-rise" style={{ ['--i' as string]: 0 }}>
              <p className="font-bold">{picked.size < 2 ? 'Tick one more product' : `Combine ${picked.size} products (${pickedUnits} units)`}</p>
              <div>
                <label htmlFor="combine-name" className="k-label">Name to keep</label>
                <input id="combine-name" value={target} onChange={(e) => { setTarget(e.target.value); setCombineConfirm(false); }} className="k-field" list="combine-names" autoComplete="off" />
                <datalist id="combine-names">{pickedGroups.map((g) => <option key={g.key} value={g.name} />)}</datalist>
              </div>
              {combineConfirm ? (
                <div role="alert" className="rounded-2xl px-4 py-3 space-y-3" style={{ background: 'color-mix(in srgb, var(--bad) 10%, transparent)' }}>
                  <p className="text-sm font-medium">This renames {pickedUnits} units to “{target.trim()}”. Past orders keep the name they were sold under. This cannot be undone in one click.</p>
                  <div className="flex gap-2"><button onClick={() => setCombineConfirm(false)} className="k-btn k-btn-ghost px-4 py-2 text-sm">Cancel</button><button onClick={() => void runCombine()} disabled={combining} className="k-btn k-btn-ink px-4 py-2 text-sm">{combining && <Loader2 className="w-4 h-4 animate-spin" />} Yes, combine</button></div>
                </div>
              ) : (
                <button onClick={() => setCombineConfirm(true)} disabled={picked.size < 2 || !target.trim()} className="k-btn k-btn-lime px-5 py-3 text-sm"><Combine className="w-4 h-4" /> Combine</button>
              )}
            </div>
          )}
        </section>

        {/* Selected product */}
        <section ref={detailRef} aria-label="Product details" className="min-w-0 space-y-4 scroll-mt-28">
          {!selected ? (
            <div className="k-card py-16 px-6 text-center"><p className="font-bold">Pick a product</p><p className="text-sm k-muted mt-1">Its units show here.</p></div>
          ) : (
            <>
              <div className="k-card p-5 sm:p-6 k-rise" style={{ ['--i' as string]: 0 }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-2xl font-bold k-display">{selected.name}</h3>
                    <p className="text-sm k-muted mt-1">SKUs <span className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>{skuRange}</span></p>
                    <div className="mt-2 text-sm flex items-center gap-2 flex-wrap">
                      <span className="k-muted">Prepaid price</span>
                      {editPrice !== null ? (
                        <form onSubmit={(e) => { e.preventDefault(); void savePrice(); }} className="flex items-center gap-2">
                          <label htmlFor="price-edit" className="sr-only">Prepaid price in rupees</label>
                          <input id="price-edit" autoFocus inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ''))} className="k-field w-28 font-mono" />
                          <button type="submit" aria-label="Save price" className="k-btn k-btn-lime w-9 h-9"><Check className="w-4 h-4" /></button>
                          <button type="button" onClick={() => setEditPrice(null)} aria-label="Cancel" className="k-btn k-btn-ghost w-9 h-9"><X className="w-4 h-4" /></button>
                        </form>
                      ) : (
                        <>
                          <span className="font-bold tabular-nums">{(pricesC.data?.prices[priceKey(selected.name)] ?? 0) > 0 ? `₹${pricesC.data?.prices[priceKey(selected.name)].toLocaleString('en-IN')}` : 'Not set'}</span>
                          <button onClick={() => setEditPrice(String(pricesC.data?.prices[priceKey(selected.name)] ?? ''))} aria-label="Edit prepaid price" className="k-btn k-btn-soft w-8 h-8"><Pencil className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                    {priceNote && <p role="status" className="text-xs k-muted mt-1.5">{priceNote}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-5xl font-bold k-display leading-none tabular-nums">{selected.items.length}</p>
                    <p className="text-xs k-muted mt-1">units in total</p>
                  </div>
                </div>

                <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mt-5 k-track" role="img" aria-label={BUCKETS.filter((b) => selected.counts[b] > 0).map((b) => `${selected.counts[b]} ${b}`).join(', ')}>
                  {BUCKETS.map((b) => selected.counts[b] > 0 && <div key={b} style={{ flex: selected.counts[b], background: BUCKET_COLOR[b] }} />)}
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm">
                  {BUCKETS.filter((b) => selected.counts[b] > 0).map((b) => (
                    <li key={b} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: BUCKET_COLOR[b] }} /> <span className="font-bold tabular-nums">{selected.counts[b]}</span> <span className="k-muted">{b.toLowerCase()}</span></li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-[14rem] max-w-sm">
                  <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input value={unitSearch} onChange={(e) => { setUnitSearch(e.target.value); setPage(1); }} placeholder="Search SKU, customer or order" aria-label="Search units" className="k-field" style={{ paddingLeft: '2.4rem' }} />
                </div>
                <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter units by status">
                  <button className="k-chip" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(1); }}>All <span className="ml-1 opacity-70">{selected.items.length}</span></button>
                  {BUCKETS.filter((b) => selected.counts[b] > 0).map((b) => (
                    <button key={b} className="k-chip" aria-pressed={filter === b} onClick={() => { setFilter(b); setPage(1); }}>{b} <span className="ml-1 opacity-70">{selected.counts[b]}</span></button>
                  ))}
                </div>
              </div>

              <div className="k-card overflow-hidden">
                <div className="hidden md:grid grid-cols-[6.5rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_2.25rem] gap-4 px-5 py-3 text-xs font-semibold k-muted border-b k-rule" aria-hidden="true">
                  <span>SKU</span><span>Customer and order</span><span>Carton</span><span className="text-center">Status</span><span />
                </div>
                {rows.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <Package className="w-8 h-8 mx-auto k-muted mb-2" />
                    <p className="font-bold">No unit matches</p>
                    <p className="text-sm k-muted mt-1">Try another search or switch the filter.</p>
                  </div>
                ) : (
                  <ul>
                    {rows.map((p) => {
                      const asking = confirmId === p.id;
                      return (
                        <li key={p.id} className="k-row border-t k-rule first:border-t-0 px-5 py-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[6.5rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_2.25rem] gap-x-4 gap-y-1 items-center">
                            <p className="font-mono font-semibold text-sm">{p.sku || shortCode(p.id)}</p>
                            <div className="min-w-0 col-span-2 md:col-span-1 order-3 md:order-none">
                              <p className="text-sm font-medium truncate">{p.customer_name || <span className="k-muted font-normal">Not sold</span>}</p>
                              {p.order_id && <p className="text-xs k-muted font-mono truncate">{p.order_id}</p>}
                            </div>
                            <p className="hidden md:block text-sm k-muted truncate" title={p.carton_id ? (cartonName.get(p.carton_id) || shortCode(p.carton_id)) : undefined}>{p.carton_id ? (cartonName.get(p.carton_id) || shortCode(p.carton_id)) : 'No carton'}</p>
                            <span className="justify-self-end md:justify-self-center rounded-full px-3 py-1 text-xs font-bold text-center" style={pillStyle(p.status)}>{p.status}</span>
                            <button onClick={() => setConfirmId(asking ? null : p.id)} aria-label={`Delete ${p.sku || 'unit'}`} className="hidden md:flex k-btn k-btn-soft w-8 h-8"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                          <div className="md:hidden mt-2 flex justify-end">
                            <button onClick={() => setConfirmId(asking ? null : p.id)} className="text-xs font-semibold underline k-muted">Delete</button>
                          </div>
                          {asking && (
                            <div role="alert" className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
                              <p className="text-sm font-medium">Delete {p.sku || 'this unit'}? {p.status === 'In Stock' ? 'It will leave your stock count.' : 'It is already on an order.'}</p>
                              <div className="flex gap-2">
                                <button onClick={() => setConfirmId(null)} className="k-btn k-btn-ghost px-4 py-2 text-sm"><X className="w-4 h-4" /> Keep it</button>
                                <button onClick={() => void remove(p.id)} disabled={deleting} className="k-btn k-btn-ink px-4 py-2 text-sm">{deleting && <Loader2 className="w-4 h-4 animate-spin" />} Yes, delete</button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {units.length > PAGE_SIZE && (
                  <nav className="px-5 py-3 border-t k-rule flex items-center justify-between gap-3 flex-wrap" aria-label="Unit pages">
                    <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, units.length)} of {units.length}</p>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className="k-btn k-btn-ghost w-9 h-9"><ChevronLeft className="w-4 h-4" /></button>
                      {pageList(current, lastPage).map((n, i) => n === '…'
                        ? <span key={`gap-${i}`} className="w-6 text-center k-muted" aria-hidden="true">…</span>
                        : <button key={n} onClick={() => setPage(n)} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} className={`k-btn w-9 h-9 text-sm ${n === current ? 'k-btn-ink' : 'k-btn-ghost'}`}>{n}</button>)}
                      <button onClick={() => setPage(current + 1)} disabled={current === lastPage} aria-label="Next page" className="k-btn k-btn-ghost w-9 h-9"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </nav>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
