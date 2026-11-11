import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Box, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Package,
  Pencil, Plus, Printer, QrCode, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { DataService } from '../../services/dataService';
import { useCached } from '../../hooks/useCached';
import { CACHE } from '../../services/prefetch';
import { PriceService, priceKey, type PriceMap } from '../../services/priceService';

interface Carton {
  id: string;
  location: string | null;
  created_at: string;
  updated_at: string;
}

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

const PAGE_SIZE = 8;

/** Location if set, else the product it mostly holds, else a plain fallback. */
const cartonTitle = (c: Carton, names?: Map<string, number>) => {
  if (c.location) return c.location;
  const top = names ? [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  return top ? `${top} box` : 'Empty carton';
};
const shortCode = (id: string) => id.slice(-6).toUpperCase();
const niceDate = (v: string) => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const statusStyle = (status: string): React.CSSProperties => {
  switch (status) {
    case 'In Stock': return { background: 'color-mix(in srgb, var(--lime) 18%, transparent)', color: 'var(--lime-text)' };
    case 'Reserved': return { background: 'color-mix(in srgb, var(--warn) 16%, transparent)', color: 'var(--warn)' };
    case 'Shipped':
    case 'Delivered': return { background: 'var(--lime)', color: 'var(--on-lime)' };
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

const Overlay: React.FC<{ label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ label, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`k-card w-full ${wide ? 'max-w-lg' : 'max-w-sm'} my-auto p-6 shadow-2xl k-rise`} style={{ ['--i' as string]: 0 }}>{children}</div>
  </div>
);

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// ─── Carton QR label ─────────────────────────────────────────────────────────
const CartonQRModal: React.FC<{ carton: Carton; onClose: () => void }> = ({ carton, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => { QRCode.toDataURL(carton.id, { width: 300, margin: 2, errorCorrectionLevel: 'H' }).then(setQrDataUrl).catch(() => setQrDataUrl('')); }, [carton.id]);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Carton - ${esc(carton.id)}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .label{width:80mm;padding:8mm;border:2px solid #000;border-radius:4px;text-align:center}
    .title{font-size:13pt;font-weight:900;letter-spacing:3px;margin-bottom:4px}
    .subtitle{font-size:7pt;color:#666;letter-spacing:1px;margin-bottom:10px}
    .qr{width:55mm;height:55mm;margin:0 auto 8px;display:block}
    .id{font-size:7pt;font-family:monospace;margin-bottom:8px;word-break:break-all;color:#333}
    .loc-label{font-size:7pt;color:#999;letter-spacing:1px;text-transform:uppercase}
    .loc{font-size:11pt;font-weight:900;border-top:1px solid #ccc;padding-top:6px;margin-top:4px}
    @media print{@page{margin:0;size:80mm auto}}</style></head>
    <body><div class="label">
    <div class="title">📦 CARTON</div>
    <div class="subtitle">SCAN TO IDENTIFY BOX</div>
    <img class="qr" src="${qrDataUrl}" />
    <div class="id">${carton.id}</div>
    <div class="loc-label">Location</div>
    <div class="loc">${carton.location || '—'}</div>
    </div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 400);
  };

  return (
    <Overlay label="Carton QR label" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold k-display">Carton label</h2>
          <p className="text-sm k-muted mt-0.5">Stick this on the box. Scanning it picks the carton.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="rounded-2xl p-4 flex flex-col items-center my-5" style={{ background: '#fff', color: '#0b0d0a' }}>
        {qrDataUrl ? <img src={qrDataUrl} className="w-40 h-40" alt={`QR code for carton ${shortCode(carton.id)}`} /> : <Loader2 className="w-8 h-8 animate-spin" />}
        <p className="font-bold mt-2">{carton.location || 'No location'}</p>
        <p className="text-xs font-mono opacity-60">{shortCode(carton.id)}</p>
      </div>
      <button onClick={handlePrint} disabled={!qrDataUrl} className="k-btn k-btn-lime w-full py-3 text-sm"><Printer className="w-4 h-4" /> Print carton label</button>
    </Overlay>
  );
};

// ─── Product labels ──────────────────────────────────────────────────────────
const ProductLabelsModal: React.FC<{ products: Product[]; carton: Carton; onClose: () => void }> = ({ products, carton, onClose }) => {
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const p of products) urls[p.id] = await QRCode.toDataURL(p.id, { width: 200, margin: 1, errorCorrectionLevel: 'H' });
      if (!cancelled) { setQrUrls(urls); setGenerated(true); }
    })();
    return () => { cancelled = true; };
  }, [products]);

  const handlePrintAll = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const labels = products.map((p) => `
      <div class="label">
        <div class="product-name">${esc(p.product_name)}</div>
        ${p.sku ? `<div class="sku">SKU: ${esc(p.sku)}</div>` : ''}
        <img class="qr" src="${qrUrls[p.id] || ''}" />
        <div class="pid">${esc(p.id)}</div>
        <div class="carton">Carton: ${esc(carton.location || carton.id)}</div>
      </div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Product Labels</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;background:#fff}
    .grid{display:flex;flex-wrap:wrap;gap:4mm;padding:5mm}
    .label{width:50mm;padding:3mm;border:1px solid #000;border-radius:2px;text-align:center;page-break-inside:avoid}
    .product-name{font-size:8pt;font-weight:900;margin-bottom:2px;word-break:break-word}
    .sku{font-size:6pt;color:#666;margin-bottom:3px}
    .qr{width:36mm;height:36mm;margin:0 auto;display:block}
    .pid{font-size:5pt;font-family:monospace;word-break:break-all;margin:3px 0;color:#333}
    .carton{font-size:5.5pt;color:#666;border-top:1px solid #eee;padding-top:2px;margin-top:2px}
    @media print{@page{margin:5mm}}</style></head>
    <body><div class="grid">${labels}</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 500);
  };

  return (
    <Overlay label="Product labels" onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold k-display">{products.length} product label{products.length === 1 ? '' : 's'} ready</h2>
          <p className="text-sm k-muted mt-0.5">Print them and stick one on each unit.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto grid grid-cols-3 gap-3 my-5">
        {products.map((p) => (
          <div key={p.id} className="rounded-xl p-2 text-center" style={{ background: '#fff', color: '#0b0d0a' }}>
            {qrUrls[p.id]
              ? <img src={qrUrls[p.id]} className="w-full aspect-square" alt={`QR for ${p.sku || p.product_name}`} />
              : <div className="w-full aspect-square flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
            <p className="text-[10px] font-bold mt-1 truncate">{p.sku || p.product_name}</p>
          </div>
        ))}
      </div>
      <button onClick={handlePrintAll} disabled={!generated} className="k-btn k-btn-lime w-full py-3 text-sm"><Printer className="w-4 h-4" /> Print all {products.length} labels</button>
    </Overlay>
  );
};

// ─── Add products ────────────────────────────────────────────────────────────
interface KnownProduct { name: string; prefix: string; count: number }

/** "PM-014" -> "PM" */
const skuPrefix = (sku: string) => sku.trim().toUpperCase().replace(/-?\d+$/, '').replace(/-$/, '');

const AddProductsPanel: React.FC<{
  carton: Carton;
  known: KnownProduct[];
  prices: PriceMap;
  onProductsAdded: (products: Product[], priceWhere: 'shared' | 'browser' | null) => void;
  onClose: () => void;
}> = ({ carton, known, prices, onProductsAdded, onClose }) => {
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [skuTouched, setSkuTouched] = useState(false);
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const match = known.find((k) => priceKey(k.name) === priceKey(productName));
  // a carton name typed as a product name: "period massager 2nd carton" belongs in the carton's location, not the product
  const cartonLike = /(\b(\d+(st|nd|rd|th)|first|second|third)\b.*)?\b(cartt?on|box)\b\s*\d*$/i.test(productName.trim());
  const suggestion = cartonLike ? productName.replace(/\s*\b(\d+(st|nd|rd|th)|first|second|third)?\s*(cartt?on|box)\b\s*\d*$/i, '').trim() : '';

  const pickName = (name: string) => {
    setProductName(name);
    const k = known.find((x) => priceKey(x.name) === priceKey(name));
    if (k && !skuTouched) setSku(k.prefix);
    const p = prices[priceKey(name)];
    if (p && !priceTouched) setPrice(String(p));
  };

  const prefix = skuPrefix(sku);
  useEffect(() => {
    if (!prefix) { setNextNumber(null); return; }
    let alive = true;
    const t = setTimeout(() => { DataService.getNextSkuNumber(prefix).then((n) => { if (alive) setNextNumber(n); }).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [prefix]);

  const handleAdd = async () => {
    if (!productName.trim()) { setError('Type or pick the product name.'); return; }
    if (quantity < 1 || quantity > 500) { setError('Quantity must be between 1 and 500.'); return; }
    setError(''); setAdding(true);
    try {
      const startNum = prefix ? await DataService.getNextSkuNumber(prefix) : 1;
      const created: Product[] = await DataService.addProducts(Array.from({ length: quantity }, (_, i) => ({
        product_name: productName.trim(), sku: prefix ? `${prefix}-${String(startNum + i).padStart(3, '0')}` : null, carton_id: carton.id,
      })));
      if (created.length === 0) { setError('No products were saved. Try again.'); return; }
      const amount = parseInt(price, 10);
      const where = amount > 0 ? await PriceService.save(productName, amount) : null;
      onProductsAdded(created, where);
    } catch {
      setError('Could not add the products. Check your connection and try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="k-card2 rounded-2xl p-4 sm:p-5 space-y-4 k-rise" style={{ ['--i' as string]: 0 }}>
      <div className="flex items-center justify-between">
        <p className="font-bold">Add products to this carton</p>
        <button onClick={onClose} aria-label="Close add products" className="k-btn k-btn-soft w-8 h-8"><X className="w-4 h-4" /></button>
      </div>

      <div>
        <label htmlFor="ap-name" className="k-label">Product</label>
        <input id="ap-name" list="ap-known" value={productName} onChange={(e) => pickName(e.target.value)} placeholder="Pick a product you already sell, or type a new one" className="k-field" autoComplete="off" />
        <datalist id="ap-known">{known.map((k) => <option key={k.name} value={k.name}>{k.count} units so far</option>)}</datalist>
        {match ? (
          <p className="text-xs mt-1.5 flex items-center gap-1.5 k-lime-text"><Check className="w-3.5 h-3.5" /> Same product as before ({match.count} units). New units join its stock.</p>
        ) : productName.trim() ? (
          <p className="text-xs k-muted mt-1.5">New product. It will appear in Stock summary and Products.</p>
        ) : (
          <p className="text-xs k-muted mt-1.5">Bought more of a product? Use its exact name from the list. The carton name is already set above.</p>
        )}
        {cartonLike && suggestion && (
          <p role="note" className="text-xs mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--warn)' }}>
            That looks like a carton name, not a product.
            <button type="button" onClick={() => pickName(suggestion)} className="underline font-semibold">Use “{suggestion}”</button>
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="ap-sku" className="k-label">SKU letters</label>
          <input id="ap-sku" value={sku} onChange={(e) => { setSku(e.target.value); setSkuTouched(true); }} placeholder="e.g. PM" className="k-field font-mono" autoComplete="off" />
          <p className="text-xs k-muted mt-1.5">{prefix ? (nextNumber ? `Starts at ${prefix}-${String(nextNumber).padStart(3, '0')}` : 'Checking the next number…') : 'Leave empty for no SKU'}</p>
        </div>
        <div>
          <label htmlFor="ap-price" className="k-label">Prepaid price (₹)</label>
          <input id="ap-price" inputMode="numeric" value={price} onChange={(e) => { setPrice(e.target.value.replace(/\D/g, '')); setPriceTouched(true); }} placeholder="e.g. 499" className="k-field font-mono" autoComplete="off" />
          <p className="text-xs k-muted mt-1.5">Fills the amount in New order</p>
        </div>
        <div>
          <label htmlFor="ap-qty" className="k-label">Quantity</label>
          <input id="ap-qty" type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))} className="k-field" />
        </div>
      </div>

      {error && <p role="alert" className="text-sm font-medium flex items-center gap-2 k-bad"><AlertCircle className="w-4 h-4" />{error}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm k-muted">Makes <span className="font-bold" style={{ color: 'var(--ink)' }}>{quantity}</span> unit{quantity === 1 ? '' : 's'}, each with its own QR label.</p>
        <button onClick={handleAdd} disabled={adding || !productName.trim()} className="k-btn k-btn-lime px-6 py-3 text-sm">
          {adding ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating {quantity}…</> : <><Plus className="w-4 h-4" /> Add and make labels</>}
        </button>
      </div>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────
export const CartonsView = () => {
  const cartonsC = useCached<Carton[]>(CACHE.cartons.key, CACHE.cartons.fetch);
  const productsC = useCached<Product[]>(CACHE.products.key, CACHE.products.fetch);
  const cartons = useMemo(() => cartonsC.data ?? [], [cartonsC.data]);
  const allProducts = useMemo(() => productsC.data ?? [], [productsC.data]);
  const loading = cartonsC.loading || productsC.loading;
  const pricesC = useCached<{ prices: PriceMap; shared: boolean }>(CACHE.prices.key, CACHE.prices.fetch);
  const [priceNote, setPriceNote] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [justCreated, setJustCreated] = useState<Carton | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLocation, setEditLocation] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const [qrCarton, setQrCarton] = useState<Carton | null>(null);
  const [labels, setLabels] = useState<{ products: Product[]; carton: Carton } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { await Promise.all([cartonsC.refresh(), productsC.refresh()]); }
    catch (err) { console.error(err); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pick the first carton once they arrive, and keep a valid pick after deletes
  useEffect(() => {
    setSelectedId((cur) => (cur && cartons.some((x) => x.id === cur) ? cur : cartons[0]?.id ?? null));
  }, [cartons]);

  // every product name already in use, with the SKU letters it uses, so new stock can join it
  const known = useMemo<KnownProduct[]>(() => {
    const m = new Map<string, { name: string; count: number; prefixes: Map<string, number> }>();
    allProducts.forEach((p) => {
      const k = priceKey(p.product_name || '');
      if (!k) return;
      const e = m.get(k) || { name: p.product_name.trim(), count: 0, prefixes: new Map() };
      e.count += 1;
      const pf = p.sku ? skuPrefix(p.sku) : '';
      if (pf) e.prefixes.set(pf, (e.prefixes.get(pf) || 0) + 1);
      m.set(k, e);
    });
    return [...m.values()].map((e) => ({ name: e.name, count: e.count, prefix: [...e.prefixes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '' })).sort((a, b) => b.count - a.count);
  }, [allProducts]);

  const stats = useMemo(() => {
    const byCarton = new Map<string, { total: number; inStock: number; names: Map<string, number> }>();
    allProducts.forEach((p) => {
      if (!p.carton_id) return;
      const s = byCarton.get(p.carton_id) || { total: 0, inStock: 0, names: new Map() };
      s.total += 1;
      if (p.status === 'In Stock') s.inStock += 1;
      s.names.set(p.product_name, (s.names.get(p.product_name) || 0) + 1);
      byCarton.set(p.carton_id, s);
    });
    return byCarton;
  }, [allProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cartons.filter((c) => !q || (c.location || '').toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || [...(stats.get(c.id)?.names.keys() || [])].some((n) => n.toLowerCase().includes(q)));
  }, [cartons, search, stats]);

  const selected = cartons.find((c) => c.id === selectedId) || null;
  const selStats = selected ? stats.get(selected.id) : undefined;
  const products = useMemo(() => (selected ? allProducts.filter((p) => p.carton_id === selected.id) : []), [allProducts, selected]);
  const lastPage = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const pageRows = products.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const select = (id: string) => {
    setSelectedId(id); setShowAdd(false); setEditing(false); setConfirmDelete(false); setPage(1);
    if (window.matchMedia('(max-width: 1279px)').matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const create = async () => {
    setCreating(true); setCreateError('');
    try {
      const carton = await DataService.addCarton(newLocation.trim() || null);
      if (!carton) { setCreateError('Could not create the carton. Try again.'); return; }
      setNewLocation(''); setJustCreated(carton);
      await load(); select(carton.id); setQrCarton(carton);
    } catch (err: any) {
      setCreateError(err?.message || 'Could not create the carton. Try again.');
    } finally { setCreating(false); }
  };

  const saveLocation = async () => {
    if (!selected) return;
    await DataService.updateCarton(selected.id, editLocation.trim() || null);
    setEditing(false); await load();
  };

  const remove = async () => {
    if (!selected) return;
    setDeleting(true);
    try { await DataService.deleteCarton(selected.id); setConfirmDelete(false); await load(); }
    catch (err) { console.error(err); }
    finally { setDeleting(false); }
  };

  const removeProduct = async (id: string) => {
    await DataService.updateProduct(id, { carton_id: null });
    await load();
  };

  const unitsTotal = allProducts.filter((p) => p.carton_id).length;
  const unitsInStock = allProducts.filter((p) => p.carton_id && p.status === 'In Stock').length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <header className="hidden md:flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold k-display">Cartons</h2>
          <p className="text-sm k-muted mt-1">Make a carton, add its products, print the labels, then scan them into orders.</p>
        </div>
        <div className="flex gap-6 items-end">
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{loading ? '…' : cartons.length}</p><p className="text-xs k-muted mt-1">cartons</p></div>
          <div><p className="text-3xl font-bold k-display leading-none tabular-nums">{loading ? '…' : unitsInStock.toLocaleString('en-IN')}</p><p className="text-xs k-muted mt-1">of {unitsTotal.toLocaleString('en-IN')} units in stock</p></div>
          <button onClick={() => void load()} aria-label="Refresh cartons" className="k-btn k-btn-ghost w-10 h-10"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </header>

      {/* Phone header: one dark strip with the numbers and the New carton button */}
      <header className="md:hidden rep-hero p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold k-display">Cartons</h2>
          <button onClick={() => void load()} aria-label="Refresh cartons" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.12)' }}><RefreshCw className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-6 mt-3">
          <div><p className="text-4xl font-bold k-display leading-none tabular-nums">{loading ? '…' : cartons.length}</p><p className="text-xs opacity-60 mt-1">cartons</p></div>
          <div><p className="text-4xl font-bold k-display leading-none tabular-nums">{loading ? '…' : unitsInStock.toLocaleString('en-IN')}</p><p className="text-xs opacity-60 mt-1">of {unitsTotal.toLocaleString('en-IN')} units in stock</p></div>
        </div>
        <button onClick={() => setShowNew((v) => !v)} aria-expanded={showNew} className="k-btn k-btn-lime w-full mt-4 py-3 text-sm"><Plus className="w-4 h-4" /> {showNew ? 'Close' : 'New carton'}</button>
      </header>

      {/* New carton */}
      <section className={`k-card p-5 ${showNew ? '' : 'max-md:hidden'}`} aria-label="Create a carton">
        <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label htmlFor="new-location" className="k-label">New carton: where will it be kept? (optional)</label>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input id="new-location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. THURAVOOR, Shelf A2" className="k-field" autoComplete="off" />
            <button type="submit" disabled={creating} className="k-btn k-btn-lime px-6 py-3 text-sm shrink-0">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {creating ? 'Creating…' : 'Create carton'}
            </button>
          </div>
        </form>
        {createError && <p role="alert" className="text-sm font-medium mt-3 flex items-center gap-2 k-bad"><AlertCircle className="w-4 h-4" />{createError}</p>}
        {justCreated && (
          <div className="mt-3 k-card2 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm flex items-center gap-2"><Check className="w-4 h-4 k-lime-text" /> Created <span className="font-semibold">{justCreated.location || `carton ${shortCode(justCreated.id)}`}</span></p>
            <div className="flex gap-2">
              <button onClick={() => setQrCarton(justCreated)} className="k-btn k-btn-outline-green px-4 py-2 text-sm"><Printer className="w-4 h-4" /> Print label</button>
              <button onClick={() => setJustCreated(null)} aria-label="Dismiss" className="k-btn k-btn-soft w-9 h-9"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </section>

      {/* Phone: cartons as swipeable cards */}
      {!loading && cartons.length > 0 && (
        <section className="md:hidden -mx-4" aria-label="Pick a carton">
          <ul className="flex gap-3 overflow-x-auto snap-x scroll-pl-4 px-4 pb-2 snap-row">
            {filtered.map((c) => {
              const st = stats.get(c.id); const on = c.id === selectedId;
              return (
                <li key={c.id} className="snap-start shrink-0">
                  <button onClick={() => select(c.id)} aria-pressed={on} className="w-40 text-left rounded-2xl p-3.5" style={on ? { background: 'var(--ink)', color: 'var(--bg)' } : { background: 'var(--card)', border: '1px solid var(--line)' }}>
                    <span className="block text-3xl font-bold k-display leading-none tabular-nums">{st?.inStock ?? 0}</span>
                    <span className="block text-[11px] opacity-60 mb-2">in stock</span>
                    <span className="block text-sm font-bold truncate">{cartonTitle(c, st?.names)}</span>
                    <span className="block text-[11px] opacity-60 font-mono">{shortCode(c.id)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[21rem_minmax(0,1fr)] gap-6 items-start">
        {/* Carton list */}
        <section aria-label="Your cartons" className="min-w-0 xl:sticky xl:top-28 max-md:hidden">
          <div className="relative mb-3">
            <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search location or product" aria-label="Search cartons" className="k-field" style={{ paddingLeft: '2.4rem' }} />
          </div>
          <div className="k-card overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="k-skel h-16 rounded-2xl animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <Box className="w-8 h-8 mx-auto k-muted mb-2" />
                <p className="font-bold">{cartons.length === 0 ? 'No cartons yet' : 'No carton matches'}</p>
                <p className="text-sm k-muted mt-1">{cartons.length === 0 ? 'Create your first carton above.' : 'Try another search.'}</p>
              </div>
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto">
                {filtered.map((c) => {
                  const s = stats.get(c.id);
                  const on = c.id === selectedId;
                  return (
                    <li key={c.id} className="border-t k-rule first:border-t-0">
                      <button onClick={() => select(c.id)} aria-pressed={on} className="k-row w-full text-left px-4 py-3.5 flex items-center gap-3" style={on ? { background: 'var(--card2)', boxShadow: 'inset 3px 0 0 var(--lime)' } : undefined}>
                        <span className="w-10 h-10 rounded-xl k-card2 flex items-center justify-center shrink-0" style={on ? { background: 'var(--lime)', color: 'var(--on-lime)' } : undefined}><Box className="w-5 h-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold truncate">{cartonTitle(c, s?.names)}</span>
                          <span className="block text-xs k-muted truncate">{c.location ? ([...(s?.names.keys() || [])].slice(0, 2).join(', ') || 'Empty') : 'No location'} · <span className="font-mono">{shortCode(c.id)}</span></span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-bold tabular-nums">{s?.inStock ?? 0}</span>
                          <span className="block text-xs k-muted">in stock</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Selected carton */}
        <section ref={detailRef} aria-label="Carton details" className="min-w-0 space-y-4 scroll-mt-28">
          {!selected ? (
            <div className="k-card py-16 px-6 text-center">
              <p className="font-bold">Pick a carton</p>
              <p className="text-sm k-muted mt-1">Its products, labels and settings show here.</p>
            </div>
          ) : (
            <>
              <div className="k-card p-5 sm:p-6 k-rise" style={{ ['--i' as string]: 0 }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    {editing ? (
                      <form onSubmit={(e) => { e.preventDefault(); void saveLocation(); }} className="flex gap-2">
                        <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} aria-label="Carton location" className="k-field" autoFocus />
                        <button type="submit" aria-label="Save location" className="k-btn k-btn-lime w-11 h-11 shrink-0"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="k-btn k-btn-ghost w-11 h-11 shrink-0"><X className="w-4 h-4" /></button>
                      </form>
                    ) : (
                      <>
                        <h3 className="text-2xl font-bold k-display flex items-center gap-2 min-w-0">
                          {selected.location ? <MapPin className="w-5 h-5 k-lime-text shrink-0" /> : <Box className="w-5 h-5 k-lime-text shrink-0" />} <span className="truncate">{cartonTitle(selected, selStats?.names)}</span>
                          <button onClick={() => { setEditing(true); setEditLocation(selected.location || ''); }} aria-label="Edit location" className="k-btn k-btn-soft w-8 h-8 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                        </h3>
                        <p className="text-sm k-muted mt-1">Code <span className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>{shortCode(selected.id)}</span> · made {niceDate(selected.created_at)}{!selected.location && <> · <button onClick={() => { setEditing(true); setEditLocation(''); }} className="underline font-semibold" style={{ color: 'var(--ink)' }}>Add a location</button></>}</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setQrCarton(selected)} className="k-btn k-btn-soft px-4 py-2.5 text-sm"><QrCode className="w-4 h-4" /> Carton label</button>
                    <button onClick={() => setConfirmDelete(true)} aria-label="Delete carton" className="k-btn k-btn-soft w-11 h-11"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {confirmDelete && (
                  <div role="alert" className="mt-4 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
                    <p className="text-sm font-medium">Delete this carton and its {selStats?.total ?? 0} product{selStats?.total === 1 ? '' : 's'}? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(false)} className="k-btn k-btn-ghost px-4 py-2 text-sm">Keep it</button>
                      <button onClick={() => void remove()} disabled={deleting} className="k-btn k-btn-ink px-4 py-2 text-sm">{deleting && <Loader2 className="w-4 h-4 animate-spin" />} Yes, delete</button>
                    </div>
                  </div>
                )}

                <dl className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
                  {[['In stock', selStats?.inStock ?? 0], ['Reserved or sent', (selStats?.total ?? 0) - (selStats?.inStock ?? 0)], ['Units in total', selStats?.total ?? 0]].map(([label, v]) => (
                    <div key={label as string} className="k-card2 rounded-2xl p-3 sm:p-4 min-w-0">
                      <dd className="text-3xl font-bold k-display leading-none tabular-nums">{v as number}</dd>
                      <dt className="text-xs k-muted mt-1.5">{label}</dt>
                    </div>
                  ))}
                </dl>
              </div>

              {priceNote && <p role="status" className="text-sm k-card2 rounded-2xl px-4 py-3">{priceNote}</p>}
              {showAdd ? (
                <AddProductsPanel
                  carton={selected}
                  known={known}
                  prices={pricesC.data?.prices ?? {}}
                  onClose={() => setShowAdd(false)}
                  onProductsAdded={async (created, where) => {
                    setShowAdd(false);
                    setPriceNote(where === 'browser' ? 'The prepaid price is saved on this computer only. Run the one-time database step to share it with other computers.' : where === 'shared' ? 'Prepaid price saved.' : '');
                    await Promise.all([load(), pricesC.refresh()]);
                    setLabels({ products: created, carton: selected });
                  }}
                />
              ) : (
                <button onClick={() => setShowAdd(true)} className="k-btn k-btn-outline-green px-5 py-3 text-sm"><Plus className="w-4 h-4" /> Add products to this carton</button>
              )}

              <div className="k-card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-3 border-b k-rule">
                  <h3 className="font-bold k-display">Products in this carton <span className="k-muted font-normal">{products.length}</span></h3>
                  {products.length > 0 && <button onClick={() => setLabels({ products, carton: selected })} className="k-btn k-btn-soft px-4 py-2 text-sm"><Printer className="w-4 h-4" /> Print all labels</button>}
                </div>
                {products.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <Package className="w-8 h-8 mx-auto k-muted mb-2" />
                    <p className="font-bold">This carton is empty</p>
                    <p className="text-sm k-muted mt-1">Add products and print a label for each unit.</p>
                  </div>
                ) : (
                  <ul>
                    {pageRows.map((p) => (
                      <li key={p.id} className="k-row border-t k-rule first:border-t-0 px-5 py-3 flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{p.product_name}</p>
                          <p className="text-xs k-muted font-mono truncate">{p.sku || shortCode(p.id)}{p.customer_name ? ` · ${p.customer_name}` : ''}</p>
                        </div>
                        <span className="rounded-full px-3 py-1 text-xs font-bold shrink-0" style={statusStyle(p.status)}>{p.status}</span>
                        <button onClick={() => void removeProduct(p.id)} aria-label={`Take ${p.sku || p.product_name} out of this carton`} title="Take out of this carton" className="k-btn k-btn-soft w-8 h-8 shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                {products.length > PAGE_SIZE && (
                  <nav className="px-5 py-3 border-t k-rule flex items-center justify-between gap-3 flex-wrap" aria-label="Product pages">
                    <p className="text-sm k-muted">{(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, products.length)} of {products.length}</p>
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

      {qrCarton && <CartonQRModal carton={qrCarton} onClose={() => setQrCarton(null)} />}
      {labels && <ProductLabelsModal products={labels.products} carton={labels.carton} onClose={() => setLabels(null)} />}
    </div>
  );
};
