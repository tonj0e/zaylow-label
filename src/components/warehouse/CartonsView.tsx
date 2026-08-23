import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Edit2, Loader2, Check, X,
  Box, Package, Search, QrCode, Printer,
  MapPin, RefreshCw, ChevronDown,
  AlertCircle
} from 'lucide-react';
import QRCode from 'qrcode';
import { DataService } from '../../services/dataService';

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

// ─── QR Label Print Modal (Carton) ───────────────────────────────────────────
const CartonQRModal: React.FC<{ carton: Carton; onClose: () => void }> = ({ carton, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(carton.id, { width: 300, margin: 2, errorCorrectionLevel: 'H' }).then(setQrDataUrl);
  }, [carton.id]);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Carton - ${carton.id}</title>
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
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-black dark:text-white">Carton QR Label</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Stick this on the physical carton box</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="bg-white rounded-xl p-4 flex flex-col items-center mb-4">
          {qrDataUrl ? <img src={qrDataUrl} className="w-36 h-36" alt="QR" /> : <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />}
          <p className="text-xs font-mono text-slate-700 font-bold mt-2 break-all text-center">{carton.id}</p>
          {carton.location && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{carton.location}</p>}
        </div>
        <button onClick={handlePrint} disabled={!qrDataUrl}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition disabled:opacity-40">
          <Printer className="w-4 h-4" /> Print Carton Label
        </button>
      </div>
    </div>
  );
};

// ─── Product Labels Print Modal ──────────────────────────────────────────────
const ProductLabelsModal: React.FC<{ products: Product[]; carton: Carton; onClose: () => void }> = ({ products, carton, onClose }) => {
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const p of products) {
        urls[p.id] = await QRCode.toDataURL(p.id, { width: 200, margin: 1, errorCorrectionLevel: 'H' });
      }
      setQrUrls(urls);
      setGenerated(true);
    };
    generate();
  }, [products]);

  const handlePrintAll = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const labels = products.map(p => `
      <div class="label">
        <div class="product-name">${p.product_name}</div>
        ${p.sku ? `<div class="sku">SKU: ${p.sku}</div>` : ''}
        <img class="qr" src="${qrUrls[p.id] || ''}" />
        <div class="pid">${p.id}</div>
        <div class="carton">Carton: ${carton.location || carton.id}</div>
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
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-black dark:text-white">{products.length} Product Labels Ready</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Print and stick each label on the individual product</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white transition"><X className="w-4 h-4" /></button>
        </div>

        {/* Preview grid */}
        <div className="max-h-64 overflow-y-auto grid grid-cols-3 gap-3 mb-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-lg p-2 text-center">
              {qrUrls[p.id]
                ? <img src={qrUrls[p.id]} className="w-full aspect-square" alt="QR" />
                : <div className="w-full aspect-square flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-black dark:text-white" /></div>
              }
              <p className="text-[8px] font-bold text-slate-800 mt-1 truncate">{p.product_name}</p>
              <p className="text-[6px] font-mono text-slate-400 dark:text-slate-500 break-all">{p.id.slice(0, 12)}…</p>
            </div>
          ))}
        </div>

        <button onClick={handlePrintAll} disabled={!generated}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition disabled:opacity-40">
          <Printer className="w-4 h-4" /> Print All {products.length} Labels
        </button>
      </div>
    </div>
  );
};

// ─── Add Products to Carton Panel ────────────────────────────────────────────
const AddProductsPanel: React.FC<{
  carton: Carton;
  onProductsAdded: (products: Product[]) => void;
  onClose: () => void;
}> = ({ carton, onProductsAdded, onClose }) => {
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!productName.trim()) { setError('Product name is required'); return; }
    if (quantity < 1 || quantity > 500) { setError('Quantity must be 1–500'); return; }
    setError('');
    setAdding(true);
    try {
      const created: Product[] = [];

      // Parse SKU prefix — strip trailing numbers/dashes so "PM-001" → "PM", "PM" → "PM"
      let skuPrefix = sku.trim().toUpperCase().replace(/-?\d+$/, '').replace(/-$/, '');

      // Find the next sequential number globally for this prefix
      let startNum = 1;
      if (skuPrefix) {
        startNum = await DataService.getNextSkuNumber(skuPrefix);
      }

      for (let i = 0; i < quantity; i++) {
        // e.g. PM-001, PM-002, PM-003...
        const productSku = skuPrefix
          ? `${skuPrefix}-${String(startNum + i).padStart(3, '0')}`
          : null;

        const p = await DataService.addProduct({
          product_name: productName.trim(),
          sku: productSku,
          carton_id: carton.id,
        });
        if (p) created.push(p);
      }
      if (created.length > 0) onProductsAdded(created);
    } catch {
      setError('Failed to add products. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl p-4 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-emerald-400" />Add Products to <span className="font-mono text-emerald-400">{carton.id}</span></p>
        <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-black dark:text-white transition"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-black dark:text-white font-bold uppercase tracking-wider block mb-1">Product Name *</label>
          <input value={productName} onChange={e => setProductName(e.target.value)}
            placeholder="e.g. Period Massager, T-Shirt..."
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20" />
        </div>
        <div>
          <label className="text-xs text-black dark:text-white font-bold uppercase tracking-wider block mb-1">SKU (optional)</label>
          <input value={sku} onChange={e => setSku(e.target.value)} placeholder="PM-001"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20" />
        </div>
        <div>
          <label className="text-xs text-black dark:text-white font-bold uppercase tracking-wider block mb-1">Quantity</label>
          <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
            min={1} max={500}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20" />
        </div>
      </div>

      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        This will create <span className="text-black dark:text-white font-bold">{quantity}</span> unique product {quantity === 1 ? 'unit' : 'units'} — each with its own scannable QR label.
      </p>

      <button onClick={handleAdd} disabled={adding || !productName.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition disabled:opacity-40">
        {adding ? <><Loader2 className="w-4 h-4 animate-spin" />Creating {quantity} products…</> : <><Plus className="w-4 h-4" />Add {quantity} Product{quantity > 1 ? 's' : ''} & Generate Labels</>}
      </button>
    </div>
  );
};

// ─── Main CartonsView ─────────────────────────────────────────────────────────
export const CartonsView = () => {
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCarton, setSelectedCarton] = useState<Carton | null>(null);
  const [expandedCarton, setExpandedCarton] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCarton, setEditingCarton] = useState<Carton | null>(null);
  const [editLocation, setEditLocation] = useState('');
  const [createError, setCreateError] = useState('');

  // Modals
  const [qrCarton, setQrCarton] = useState<Carton | null>(null);
  const [justCreated, setJustCreated] = useState<Carton | null>(null);
  const [showAddProducts, setShowAddProducts] = useState<string | null>(null); // carton id
  const [productsToPrint, setProductsToPrint] = useState<Product[] | null>(null);
  const [printCarton, setPrintCarton] = useState<Carton | null>(null);

  useEffect(() => { loadCartons(); }, []);

  const loadCartons = async () => {
    setLoading(true);
    try { setCartons(await DataService.getCartons()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadProductsForCarton = async (cartonId: string) => {
    setLoading(true);
    try { setProducts(await DataService.getProducts(cartonId)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCreateCarton = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const carton = await DataService.addCarton(newLocation.trim() || null);
      if (carton) {
        await loadCartons();
        setNewLocation('');
        setJustCreated(carton);
        setQrCarton(carton);
      } else {
        setCreateError('Failed to create carton. Check console for details.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Unexpected error creating carton.');
      console.error(err);
    } finally { setCreating(false); }
  };

  const handleUpdateCarton = async () => {
    if (!editingCarton) return;
    try {
      await DataService.updateCarton(editingCarton.id, editLocation.trim() || null);
      await loadCartons();
      setEditingCarton(null); setEditLocation('');
    } catch (err) { console.error(err); }
  };

  const handleDeleteCarton = async (id: string) => {
    if (!window.confirm('Delete this carton AND all its products? This cannot be undone.')) return;
    setLoading(true);
    try {
      await DataService.deleteCarton(id);
      await loadCartons();
      if (selectedCarton?.id === id) { setSelectedCarton(null); setProducts([]); }
      if (expandedCarton === id) setExpandedCarton(null);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleToggleCarton = async (carton: Carton) => {
    if (expandedCarton === carton.id) {
      setExpandedCarton(null); setProducts([]);
    } else {
      setExpandedCarton(carton.id);
      setSelectedCarton(carton);
      await loadProductsForCarton(carton.id);
    }
  };

  const handleProductsAdded = async (newProducts: Product[], carton: Carton) => {
    setShowAddProducts(null);
    setProductsToPrint(newProducts);
    setPrintCarton(carton);
    await loadProductsForCarton(carton.id);
  };

  const handleRemoveProduct = async (productId: string) => {
    await DataService.updateProduct(productId, { carton_id: null });
    if (selectedCarton) await loadProductsForCarton(selectedCarton.id);
  };

  const filteredCartons = cartons.filter(c =>
    c.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-24 md:pb-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Carton Setup</h2>
          <p className="text-xs text-black dark:text-white mt-1">Create cartons → add products → print labels → scan in orders</p>
        </div>
        <button onClick={loadCartons} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold hover:bg-slate-200 dark:bg-slate-700 transition">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Workflow Steps ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { num: '1', icon: <Box className="w-4 h-4" />, title: 'Create Carton', desc: 'Generate a carton with unique QR — print and stick on the box' },
          { num: '2', icon: <Package className="w-4 h-4" />, title: 'Add Products', desc: 'Add product units to the carton — print and stick on each product' },
        ].map(({ num, icon, title, desc }) => (
          <div key={num} className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">{icon}</div>
            <div>
              <p className="text-xs font-bold text-black dark:text-white">{num}. {title}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Carton ── */}
      <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-black dark:text-white mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-400" />Step 1: Create New Carton</h3>
        <div className="flex flex-col md:flex-row gap-3">
          <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleCreateCarton()}
            placeholder="Location label (e.g. THURAVOOR, Shelf A2) — optional"
            className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-600" />
          <button onClick={handleCreateCarton} disabled={creating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition disabled:opacity-50 whitespace-nowrap">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Creating…' : 'Create Carton'}
          </button>
        </div>
        {createError && (
          <div className="mt-2 flex items-center gap-2 p-3 bg-red-900/20 border border-red-800/50 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-300">{createError}</p>
          </div>
        )}

        {justCreated && (
          <div className="mt-3 flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-black dark:text-white">Created:</span>
              <span className="font-mono text-emerald-400 font-bold">{justCreated.id}</span>
              {justCreated.location && <span className="text-slate-400 dark:text-slate-500">· {justCreated.location}</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setQrCarton(justCreated)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition">
                <Printer className="w-3 h-3" /> Print QR
              </button>
              <button onClick={() => { setJustCreated(null); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 transition"><X className="w-3 h-3" /></button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cartons List ── */}
      <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-black dark:text-white">Your Cartons</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold">{cartons.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500 w-40" />
          </div>
        </div>

        {loading && cartons.length === 0 ? (
          <div className="text-center py-12"><Loader2 className="w-7 h-7 animate-spin mx-auto text-emerald-400" /></div>
        ) : filteredCartons.length === 0 ? (
          <div className="text-center py-12">
            <Box className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-sm text-black dark:text-white font-medium">No cartons yet</p>
            <p className="text-xs text-slate-600 mt-1">Create your first carton above</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredCartons.map((carton) => {
              const isExpanded = expandedCarton === carton.id;
              return (
                <div key={carton.id}>
                  {/* Carton Row */}
                  {editingCarton?.id === carton.id ? (
                    <div className="px-5 py-3 flex items-center gap-3">
                      <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleUpdateCarton()}
                        className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-emerald-500 rounded-lg text-black dark:text-white text-sm focus:outline-none" autoFocus />
                      <button onClick={handleUpdateCarton} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingCarton(null)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white transition"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className={`px-4 md:px-5 py-4 md:py-3.5 transition ${isExpanded ? 'bg-emerald-500/5' : 'hover:bg-slate-100 dark:bg-slate-800/30'}`}>
                      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Expand toggle */}
                          <button onClick={() => handleToggleCarton(carton)}
                            className={`w-10 h-10 md:w-8 md:h-8 rounded-xl md:rounded-lg flex items-center justify-center flex-shrink-0 transition ${isExpanded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white'}`}>
                            <Box className="w-5 h-5 md:w-4 md:h-4" />
                          </button>

                          {/* Info */}
                          <button className="flex-1 text-left min-w-0" onClick={() => handleToggleCarton(carton)}>
                            <p className="text-sm md:text-xs font-mono text-black dark:text-white font-bold truncate">{carton.id}</p>
                            <div className="flex items-center gap-2 mt-1 md:mt-0.5 truncate">
                              {carton.location
                                ? <span className="text-xs text-black dark:text-white flex items-center gap-1 flex-shrink-0"><MapPin className="w-3 h-3 md:w-2.5 md:h-2.5" />{carton.location}</span>
                                : <span className="text-xs text-slate-600 italic flex-shrink-0">No location</span>}
                              <span className="text-xs text-slate-700 truncate">· {new Date(carton.created_at).toLocaleDateString('en-IN')}</span>
                            </div>
                          </button>

                          <button onClick={() => handleToggleCarton(carton)} className="md:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white transition flex-shrink-0">
                            <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <button onClick={() => setShowAddProducts(showAddProducts === carton.id ? null : carton.id)}
                            title="Add products" className={`flex-1 md:flex-none flex justify-center items-center gap-1.5 md:gap-1 px-3 py-2.5 md:px-2.5 md:py-1.5 rounded-xl md:rounded-lg text-sm md:text-xs font-bold transition ${showAddProducts === carton.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/20 text-black dark:text-white hover:text-emerald-400'}`}>
                            <Package className="w-4 h-4 md:w-3 md:h-3" /> <span className="md:inline">Add Products</span>
                          </button>
                          <button onClick={() => setQrCarton(carton)} title="Print carton QR"
                            className="flex-[0.5] md:flex-none flex justify-center p-2.5 md:p-1.5 rounded-xl md:rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white hover:text-emerald-400 transition">
                            <QrCode className="w-4 h-4 md:w-3.5 md:h-3.5" />
                          </button>
                          <button onClick={() => { setEditingCarton(carton); setEditLocation(carton.location || ''); }}
                            className="flex-[0.5] md:flex-none flex justify-center p-2.5 md:p-1.5 rounded-xl md:rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white hover:text-blue-400 transition">
                            <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteCarton(carton.id)}
                            className="flex-[0.5] md:flex-none flex justify-center p-2.5 md:p-1.5 rounded-xl md:rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-500/20 text-black dark:text-white hover:text-red-400 transition">
                            <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                          </button>
                          <button onClick={() => handleToggleCarton(carton)} className="hidden md:flex p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white transition">
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Add Products Panel (inline) */}
                      {showAddProducts === carton.id && (
                        <AddProductsPanel
                          carton={carton}
                          onProductsAdded={(prods) => handleProductsAdded(prods, carton)}
                          onClose={() => setShowAddProducts(null)}
                        />
                      )}
                    </div>
                  )}

                  {/* Expanded: Products in this carton */}
                  {isExpanded && (
                    <div className="bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800/60 px-5 py-3">
                      {loading ? (
                        <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-400" /></div>
                      ) : products.length === 0 ? (
                        <div className="text-center py-5">
                          <Package className="w-7 h-7 mx-auto mb-2 text-slate-700" />
                          <p className="text-xs text-slate-400 dark:text-slate-500">No products in this carton yet</p>
                          <button onClick={() => setShowAddProducts(carton.id)}
                            className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition font-bold">
                            + Add Products Now
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider">{products.length} Products in this carton</p>
                            <button
                              onClick={() => { setProductsToPrint(products); setPrintCarton(carton); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white text-xs font-bold transition">
                              <Printer className="w-3 h-3" /> Print All Labels
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {products.map((product) => (
                              <div key={product.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 rounded-lg">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Package className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-black dark:text-white truncate">{product.product_name}</p>
                                    <p className="text-[10px] font-mono text-slate-600 truncate">{product.id}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                    product.status === 'In Stock' ? 'bg-emerald-500/20 text-emerald-400' :
                                    product.status === 'Reserved' ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-red-500/20 text-red-400'}`}>{product.status}</span>
                                  <button onClick={() => handleRemoveProduct(product.id)}
                                    className="p-1 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {qrCarton && <CartonQRModal carton={qrCarton} onClose={() => setQrCarton(null)} />}
      {productsToPrint && printCarton && (
        <ProductLabelsModal
          products={productsToPrint}
          carton={printCarton}
          onClose={() => { setProductsToPrint(null); setPrintCarton(null); }}
        />
      )}
    </div>
  );
};
