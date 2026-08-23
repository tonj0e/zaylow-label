import { useState, useEffect } from 'react';
import { Search, RefreshCw, Loader2, Package } from 'lucide-react';
import { DataService } from '../../services/dataService';

export const InventorySearch = () => {
  const [stock, setStock] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'low' | 'out'>('all');
  const [isLoading, setIsLoading] = useState(false);

  const loadStock = async () => {
    setIsLoading(true);
    try {
      const data = await DataService.getAggregatedStock();
      if (data) setStock(data);
    } catch (error) {
      console.error('Error fetching stock summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  // Filter and search logic
  const filteredStock = stock
    .filter(item => {
      // Text search
      const matchesSearch =
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
        !search;

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'healthy' && ((item.available || 0) > 20)) ||
        (statusFilter === 'low' && ((item.available || 0) > 0 && (item.available || 0) <= 20)) ||
        (statusFilter === 'out' && ((item.available || 0) === 0));

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) =>
      ((b.available || 0) - (a.available || 0)) // Sort by available stock descending
    );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none max-w-6xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20 shadow-sm">
          <Search className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-black dark:text-white tracking-tight">Inventory Search</h2>
          <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5">Search and filter your inventory products.</p>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64 shadow-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search products or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 md:py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 hidden sm:block">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full sm:w-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 md:py-2 text-sm font-semibold text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="healthy">In Stock (&gt;20)</option>
              <option value="low">Low Stock (1-20)</option>
              <option value="out">Out of Stock (0)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
            }}
            className="text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={loadStock}
            disabled={isLoading}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 md:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`${isLoading ? 'animate-spin' : ''} w-3.5 h-3.5`} />
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Results Info */}
      <div className="flex justify-between items-center px-1">
        <span className="text-[11px] md:text-xs font-semibold text-slate-500 dark:text-slate-400">
          <strong className="text-black dark:text-white">{filteredStock.length}</strong> of {stock.length} products shown
        </span>
        {filteredStock.length === 0 && search.length > 0 && (
          <span className="text-[11px] md:text-xs font-medium text-amber-500">Try adjusting your search filters</span>
        )}
      </div>

      {/* Results Container */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500 dark:text-emerald-400 mb-2" />
            <p className="text-black dark:text-white text-sm font-medium">Searching inventory...</p>
          </div>
        ) : (
          <>
            {/* ── MOBILE VIEW (Card Layout) ── */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredStock.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  No products found matching your criteria.
                </div>
              ) : (
                filteredStock.map(item => (
                  <div key={item.product_name} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-black dark:text-white text-sm leading-tight mb-1">{item.product_name}</h3>
                        <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-[10px] bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shadow-sm inline-block">
                          {item.sku || 'NO SKU'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shadow-sm ${
                          (item.available || 0) > 20 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : (item.available || 0) > 0
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                        }`}>
                          {(item.available || 0) > 20 ? 'Healthy' : (item.available || 0) > 0 ? 'Low Stock' : 'Out'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                      <div className="text-center border-r border-slate-200 dark:border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">In</p>
                        <p className="font-bold text-black dark:text-white text-xs">{item.total_in}</p>
                      </div>
                      <div className="text-center border-r border-slate-200 dark:border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Out</p>
                        <p className="font-bold text-black dark:text-white text-xs">{item.sold}</p>
                      </div>
                      <div className="text-center border-r border-slate-200 dark:border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Ret</p>
                        <p className="font-bold text-black dark:text-white text-xs">{item.returns}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Avail</p>
                        <p className={`font-black text-sm leading-none ${item.available > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{item.available}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── DESKTOP VIEW (Original Table Layout) ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-black dark:text-white">
                <thead className="bg-slate-50/50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">SKU Prefix</th>
                    <th className="p-4 text-center">Total Received</th>
                    <th className="p-4 text-center">Sold (Out)</th>
                    <th className="p-4 text-center">Returns (In)</th>
                    <th className="p-4 text-center">Current Available</th>
                    <th className="p-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-slate-500 dark:text-slate-400" colSpan={7}>
                        No products found matching your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map(item => (
                      <tr key={item.product_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-bold text-black dark:text-white">{item.product_name}</td>
                        <td className="p-4 font-mono font-black text-blue-600 dark:text-blue-400">
                          {item.sku || 'N/A'}
                        </td>
                        <td className="p-4 text-center text-black dark:text-white">{item.total_in}</td>
                        <td className="p-4 text-center text-black dark:text-white">{item.sold}</td>
                        <td className="p-4 text-center text-black dark:text-white">{item.returns}</td>
                        <td className="p-4 text-center">
                          <span className={`font-mono text-lg font-black ${item.available > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                            {item.available}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                            (item.available || 0) > 20 
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : (item.available || 0) > 0
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          }`}>
                            {(item.available || 0) > 20 ? 'Healthy' : (item.available || 0) > 0 ? 'Low Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};