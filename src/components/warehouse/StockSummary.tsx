import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { DataService } from '../../services/dataService';

export const StockSummary = () => {
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DataService.getAggregatedStock().then(data => {
      if (data) setStock(data);
      setLoading(false);
    });
  }, []);

  const totalAvailable = stock.reduce((sum, item) => sum + (item.available || 0), 0);
  const lowStockAlerts = stock.filter(item => (item.available || 0) <= 20).length;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none max-w-6xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Stock Summary</h2>
          <p className="text-xs text-black dark:text-white">Overview of current inventory levels across all products.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* KPI Cards */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Total Available Units</p>
            <h3 className="text-3xl font-black text-black dark:text-white">{loading ? '...' : totalAvailable}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Low Stock Alerts</p>
            <h3 className="text-3xl font-black text-black dark:text-white">{loading ? '...' : lowStockAlerts}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400 mb-2" />
              <p className="text-black dark:text-white text-sm">Aggregating stock data...</p>
            </div>
          ) : stock.length === 0 ? (
            <div className="py-12 text-center text-black dark:text-white text-sm">
              No products found in inventory. Add products via Cartons to see stock here.
            </div>
          ) : (
            <>
              {/* Mobile View: Cards */}
              <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
                {stock.map(item => (
                  <div key={item.product_name} className="p-4 active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                    {/* Header: Product & Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="pr-2">
                        <span className="font-bold text-black dark:text-white text-sm leading-tight block">{item.product_name}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-mono font-black text-[10px] text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {item.sku}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border whitespace-nowrap flex-shrink-0 ${
                        (item.available || 0) > 20 
                          ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/30'
                          : (item.available || 0) > 0
                            ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30'
                            : 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/30'
                      }`}>
                        {(item.available || 0) > 20 ? 'Healthy' : (item.available || 0) > 0 ? 'Low Stock' : 'Out of Stock'}
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60 text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Received</span>
                        <span className="font-bold text-black dark:text-white text-sm">{item.total_in}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60 text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Sold</span>
                        <span className="font-bold text-black dark:text-white text-sm">{item.sold}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60 text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Returns</span>
                        <span className="font-bold text-black dark:text-white text-sm">{item.returns}</span>
                      </div>
                    </div>

                    {/* Current Available */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="text-[10px] font-bold text-black dark:text-white uppercase tracking-wider">Current Available</span>
                      <span className={`font-mono text-xl font-black ${item.available > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {item.available}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs text-black dark:text-white">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
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
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {stock.map(item => (
                      <tr key={item.product_name} className="hover:bg-slate-100 dark:bg-slate-800/40 transition">
                        <td className="p-4 font-bold text-black dark:text-white">{item.product_name}</td>
                        <td className="p-4 font-mono font-black text-blue-400">{item.sku}</td>
                        <td className="p-4 text-center text-black dark:text-white">{item.total_in}</td>
                        <td className="p-4 text-center text-black dark:text-white">{item.sold}</td>
                        <td className="p-4 text-center text-black dark:text-white">{item.returns}</td>
                        <td className="p-4 text-center">
                          <span className={`font-mono text-lg font-black ${item.available > 0 ? 'text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{item.available}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${
                            (item.available || 0) > 20 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : (item.available || 0) > 0
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                          }`}>
                            {(item.available || 0) > 20 ? 'Healthy' : (item.available || 0) > 0 ? 'Low Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
