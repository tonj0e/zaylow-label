import { useState, useEffect } from 'react';
import { LogOut, Search, Clock, Box, Package, Hash, Loader2 } from 'lucide-react';
import { DataService } from '../../services/dataService';

export const InventoryOutView = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    DataService.getInventoryOutHistory().then(data => {
      setHistory(data);
      setLoading(false);
    });
  }, []);

  const today = new Date().toDateString();
  const outToday = history.filter(item => new Date(item.updated_at || item.created_at).toDateString() === today).length;
  const totalOut = history.length;

  const filteredHistory = history.filter(item => 
    item.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.id?.toLowerCase().includes(search.toLowerCase()) ||
    item.order_id?.toLowerCase().includes(search.toLowerCase()) ||
    item.carton_id?.toLowerCase().includes(search.toLowerCase()) ||
    item.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none max-w-7xl mx-auto pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Inventory Out</h2>
            <p className="text-xs text-black dark:text-white">Track all products that have left the warehouse or been assigned to orders.</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input 
            type="text" 
            placeholder="Search by ID, product, or order..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Units Out Today</p>
            <h3 className="text-3xl font-black text-black dark:text-white">{loading ? '...' : outToday}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>
        
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Total Units Out</p>
            <h3 className="text-3xl font-black text-black dark:text-white">{loading ? '...' : totalOut}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
             <div className="py-12 text-center">
               <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-400 mb-2" />
               <p className="text-black dark:text-white text-sm">Loading history...</p>
             </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-black dark:text-white text-sm">
              No inventory out records found.
            </div>
          ) : (
            <>
              {/* Mobile View: Cards */}
              <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredHistory.map(item => (
                  <div key={item.id} className="p-4 active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                    {/* Header: Date & Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-black dark:text-white text-xs font-semibold">
                        {new Date(item.updated_at || item.created_at).toLocaleString([], {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                        item.status === 'Shipped' || item.status === 'Delivered'
                          ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/30'
                          : 'bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    {/* Product & ID */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Box className="w-4 h-4 text-orange-500" />
                        <span className="font-bold text-black dark:text-white text-sm">{item.product_name}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-[9px] text-slate-500 dark:text-slate-400 break-all leading-tight">
                        ID: {item.id}
                      </div>
                    </div>

                    {/* Grid: Order & Carton */}
                    <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2.5 rounded-xl shadow-sm">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Order</span>
                        {item.order_id ? (
                          <div className="flex items-center gap-1 font-mono font-bold text-blue-500 dark:text-blue-400">
                            <Hash className="w-3 h-3" />
                            <span className="truncate">{item.order_id}</span>
                          </div>
                        ) : <span className="text-slate-500 dark:text-slate-600">-</span>}
                      </div>
                      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2.5 rounded-xl shadow-sm">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Carton</span>
                        {item.carton_id ? (
                          <div className="flex items-center gap-1 font-mono font-bold text-emerald-500 dark:text-emerald-400">
                            <Package className="w-3 h-3" />
                            <span className="truncate">{item.carton_id.substring(0, 8)}..</span>
                          </div>
                        ) : <span className="text-slate-500 dark:text-slate-600">-</span>}
                      </div>
                    </div>

                    {/* Customer */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</span>
                      <span className="font-bold text-black dark:text-white truncate max-w-[200px]">
                        {item.customer_name || <span className="text-slate-500 dark:text-slate-600 font-normal">None</span>}
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
                      <th className="p-4">Time</th>
                      <th className="p-4">Product</th>
                      <th className="p-4">Unit ID</th>
                      <th className="p-4">Source Carton</th>
                      <th className="p-4">Destination Order</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredHistory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-100 dark:bg-slate-800/40 transition">
                        <td className="p-4 text-black dark:text-white whitespace-nowrap">
                          {new Date(item.updated_at || item.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="p-4 font-bold text-black dark:text-white flex items-center gap-2">
                          <Box className="w-3.5 h-3.5 text-orange-500" />
                          {item.product_name}
                        </td>
                        <td className="p-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {item.id}
                        </td>
                        <td className="p-4">
                          {item.carton_id ? (
                            <div className="flex items-center gap-1 font-mono text-emerald-400">
                              <Package className="w-3 h-3" />
                              {item.carton_id.substring(0, 12)}...
                            </div>
                          ) : <span className="text-slate-600">-</span>}
                        </td>
                        <td className="p-4">
                          {item.order_id ? (
                            <div className="flex items-center gap-1 font-mono font-bold text-blue-400">
                              <Hash className="w-3 h-3" />
                              {item.order_id}
                            </div>
                          ) : <span className="text-slate-600">-</span>}
                        </td>
                        <td className="p-4 font-bold text-black dark:text-white">
                          {item.customer_name || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${
                            item.status === 'Shipped' || item.status === 'Delivered'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                          }`}>
                            {item.status}
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
