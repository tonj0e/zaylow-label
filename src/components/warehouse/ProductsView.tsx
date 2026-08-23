import React, { useState, useEffect } from 'react';
import { Loader2, Package, ArrowRight, Trash2, Search, RefreshCw, ChevronLeft } from 'lucide-react';
import { DataService } from '../../services/dataService';

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

// Color palette cycling for category cards
const CARD_COLORS = [
  { bg: 'from-pink-500/20 to-rose-500/10',    border: 'border-pink-500/30',   text: 'text-pink-400',   count: 'text-pink-400'   },
  { bg: 'from-blue-500/20 to-cyan-500/10',    border: 'border-blue-500/30',   text: 'text-blue-400',   count: 'text-blue-400'   },
  { bg: 'from-amber-500/20 to-yellow-500/10', border: 'border-amber-500/30',  text: 'text-amber-400',  count: 'text-amber-400'  },
  { bg: 'from-emerald-500/20 to-teal-500/10', border: 'border-emerald-500/30',text: 'text-emerald-400',count: 'text-emerald-400'},
  { bg: 'from-purple-500/20 to-violet-500/10',border: 'border-purple-500/30', text: 'text-purple-400', count: 'text-purple-400' },
  { bg: 'from-orange-500/20 to-red-500/10',   border: 'border-orange-500/30', text: 'text-orange-400', count: 'text-orange-400' },
];

// Product emoji icons cycling
const PRODUCT_ICONS = ['📦', '🛍️', '🎁', '🧴', '🔧', '💊', '👕', '🧸', '🖥️', '🎮', '🏠', '⚡'];

function getStatusStyle(status: string) {
  switch (status) {
    case 'In Stock':  return 'bg-emerald-500/20 text-emerald-400';
    case 'Reserved':  return 'bg-amber-500/20 text-amber-400';
    case 'Packed':    return 'bg-blue-500/20 text-blue-400';
    case 'Shipped':   return 'bg-purple-500/20 text-purple-400';
    case 'Delivered': return 'bg-green-500/20 text-green-400';
    default:          return 'bg-red-500/20 text-red-400';
  }
}

export const ProductsView = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try { setProducts(await DataService.getProducts()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('Delete this product?')) return;
    await DataService.deleteProduct(id);
    await loadProducts();
  };

  // Group all products by product_name
  const categories = React.useMemo(() => {
    const map: Record<string, Product[]> = {};
    products.forEach(p => {
      const key = p.product_name;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [products]);

  // Filtered categories for the search
  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Products shown when a category is selected
  const categoryProducts = selectedCategory
    ? products.filter(p =>
        p.product_name === selectedCategory &&
        (filterStatus === 'all' || p.status === filterStatus)
      )
    : [];

  // ── Category Grid View ─────────────────────────────────────
  if (!selectedCategory) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Products</h2>
          <p className="text-xs text-black dark:text-white mt-1">
            Total Products:{' '}
            <span className="text-emerald-400 font-bold">{filteredCategories.length} {filteredCategories.length === 1 ? 'Category' : 'Categories'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Product..."
              className="pl-9 pr-3 py-2.5 md:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500 w-full md:w-48"
            />
          </div>
          <button onClick={loadProducts} className="flex items-center justify-center gap-1.5 px-3 py-2.5 md:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold hover:bg-slate-200 dark:bg-slate-700 transition">
            <RefreshCw className="w-4 h-4 md:w-3.5 md:h-3.5" /> <span className="hidden md:inline">Refresh</span>
          </button>
        </div>
      </div>

        {/* Cards Grid — 3 per row */}
        {loading ? (
          <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" /></div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 mx-auto mb-3 text-slate-700" />
            <p className="text-black dark:text-white font-medium">No products found</p>
            <p className="text-xs text-slate-600 mt-1">Add products via the Cartons page</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map(({ name, items }, idx) => {
              const color = CARD_COLORS[idx % CARD_COLORS.length];
              const icon = PRODUCT_ICONS[idx % PRODUCT_ICONS.length];
              const inStock = items.filter(p => p.status === 'In Stock').length;
              return (
                <div
                  key={name}
                  className={`relative bg-gradient-to-br ${color.bg} border ${color.border} rounded-2xl p-5 overflow-hidden hover:scale-[1.02] transition-all duration-200 cursor-pointer group`}
                >
                  {/* Background box icon */}
                  <div className="absolute -bottom-4 -right-4 text-8xl opacity-10 select-none">📦</div>

                  {/* Icon + Name */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-white dark:bg-slate-900/60 flex items-center justify-center text-xl flex-shrink-0`}>
                      {icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-black dark:text-white leading-tight">{name}</h3>
                      <p className="text-xs text-black dark:text-white mt-0.5">{inStock} In Stock</p>
                    </div>
                  </div>

                  {/* Count */}
                  <div className={`text-4xl font-black ${color.count} mb-0.5`}>{items.length}</div>
                  <p className="text-xs text-black dark:text-white mb-4">Products</p>

                  {/* View Products Button */}
                  <button
                    onClick={() => setSelectedCategory(name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${color.border} ${color.text} text-xs font-bold hover:bg-white/10 transition`}
                  >
                    View Products <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Individual Products View (after clicking a category) ────
  const catIndex = filteredCategories.findIndex(c => c.name === selectedCategory);
  const color = CARD_COLORS[catIndex >= 0 ? catIndex % CARD_COLORS.length : 0];

  // Sort by SKU / created_at so order is consistent 1→N
  const sortedCategoryProducts = [...categoryProducts].sort((a, b) => {
    // Sort by SKU number if available, otherwise by created_at
    const numA = parseInt((a.sku || '').replace(/\D+/g, '') || '0', 10);
    const numB = parseInt((b.sku || '').replace(/\D+/g, '') || '0', 10);
    if (numA !== numB) return numA - numB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 pb-24 md:pb-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedCategory(null); setFilterStatus('all'); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 md:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white text-xs font-bold hover:bg-slate-200 dark:bg-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4 md:w-3.5 md:h-3.5" /> <span className="hidden md:inline">Back</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-black dark:text-white truncate leading-tight">{selectedCategory}</h2>
            <p className="text-xs text-black dark:text-white mt-0.5">{sortedCategoryProducts.length} products</p>
          </div>
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="w-full md:w-auto px-3 py-2.5 md:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-black dark:text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Status</option>
          <option value="In Stock">In Stock</option>
          <option value="Reserved">Reserved</option>
          <option value="Packed">Packed</option>
          <option value="Shipped">Shipped</option>
          <option value="Delivered">Delivered</option>
        </select>
      </div>

      {/* 4-per-row product card grid */}
      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-7 h-7 animate-spin mx-auto text-emerald-400" /></div>
      ) : sortedCategoryProducts.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-8 h-8 mx-auto mb-2 text-slate-700" />
          <p className="text-sm text-slate-400 dark:text-slate-500">No products match this filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sortedCategoryProducts.map((product, idx) => (
            <div
              key={product.id}
              className={`relative bg-white dark:bg-slate-900 border ${color.border} rounded-xl p-4 hover:bg-slate-100 dark:bg-slate-800/60 transition group overflow-hidden`}
            >
              {/* Background watermark number */}
              <div className="absolute -bottom-2 -right-2 text-6xl font-black text-black dark:text-white/[0.03] select-none leading-none">
                {idx + 1}
              </div>

              {/* Sequence number badge */}
              <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 ${color.text} text-[10px] font-black mb-3`}>
                {idx + 1}
              </div>

              {/* SKU */}
              <p className={`text-sm font-black ${color.count} mb-0.5`}>
                {product.sku || '—'}
              </p>

              {/* Product name (truncated) */}
              <p className="text-[10px] text-black dark:text-white truncate mb-2">{product.product_name}</p>

              {/* Status badge */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${getStatusStyle(product.status)}`}>
                {product.status}
              </span>

              {/* Delete button (on hover) */}
              <button
                onClick={() => handleDeleteProduct(product.id)}
                title="Delete product"
                className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};