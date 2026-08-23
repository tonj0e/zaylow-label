import { useState, useEffect } from 'react';
import { List, Search, Box, Package, Loader2, MapPin, Calendar } from 'lucide-react';
import { DataService } from '../../services/dataService';

export const InventoryList = () => {
  const [search, setSearch] = useState('');
  const [cartons, setCartons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DataService.getCartonsWithProductCounts().then(data => {
      if (data) setCartons(data);
      setLoading(false);
    });
  }, []);

  const filteredCartons = cartons.filter(carton => 
    carton.id.toLowerCase().includes(search.toLowerCase()) ||
    (carton.location && carton.location.toLowerCase().includes(search.toLowerCase())) ||
    carton.contents.some((c: any) => c.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            <List className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-black dark:text-white tracking-tight">Inventory Cartons</h2>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 mt-0.5">View and manage all received stock grouped by carton.</p>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input 
            type="text" 
            placeholder="Search cartons or products..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 overflow-hidden shadow-sm">
        {loading ? (
           <div className="py-12 text-center">
             <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500 dark:text-emerald-400 mb-2" />
             <p className="text-black dark:text-white text-sm font-medium">Loading cartons...</p>
           </div>
        ) : filteredCartons.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
            <Box className="w-10 h-10 mx-auto mb-3 opacity-20" />
            No cartons found. Create them in the Cartons page.
          </div>
        ) : (
          <>
            {/* ── MOBILE VIEW (Premium Card Layout) ── */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredCartons.map(carton => (
                <div key={carton.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm tracking-tight">{carton.id.substring(0, 8).toUpperCase()}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ${carton.totalUnits > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                          {carton.totalUnits} units
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {carton.location || <span className="italic opacity-70">Not set</span>}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(carton.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Contents</p>
                    {carton.contents.length > 0 ? (
                      <div className="space-y-1.5">
                        {carton.contents.map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <Package className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="text-black dark:text-white truncate font-medium">{item.name}</span>
                            </div>
                            <span className="font-bold text-black dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px] shadow-sm flex-shrink-0 ml-2">{item.count}x</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 italic text-xs">Empty carton</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── DESKTOP VIEW (Original Table Layout) ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-black dark:text-white">
                <thead className="bg-slate-50/50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">Carton ID</th>
                    <th className="p-4 font-bold">Created Date</th>
                    <th className="p-4 font-bold">Location</th>
                    <th className="p-4 font-bold">Contents</th>
                    <th className="p-4 font-bold text-center">Total Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredCartons.map(carton => (
                    <tr key={carton.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-mono font-black text-emerald-600 dark:text-emerald-400">{carton.id.substring(0, 8).toUpperCase()}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">{new Date(carton.created_at).toLocaleDateString()}</td>
                      <td className="p-4 text-black dark:text-white">
                        {carton.location || <span className="text-slate-400 dark:text-slate-500 italic">Not set</span>}
                      </td>
                      <td className="p-4">
                        {carton.contents.length > 0 ? (
                          <div className="space-y-1.5">
                            {carton.contents.map((item: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <Package className="w-3.5 h-3.5 text-emerald-500/70 dark:text-emerald-400/70" />
                                <span className="font-bold text-black dark:text-white bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{item.count}x</span>
                                <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic text-xs">Empty carton</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-mono">
                        <span className={`px-2.5 py-1 rounded-lg font-bold border ${carton.totalUnits > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                          {carton.totalUnits} units
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
  );
};
