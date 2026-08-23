import React from 'react';
import { Search, Plus, Moon, Sun, Printer, Building2, Menu } from 'lucide-react';
import type { CompanySettings } from '../../types';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenOrderModal: () => void;
  settings: CompanySettings;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  queueCount: number;
  onOpenPrintQueue: () => void;
  onOpenSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  setSearchQuery,
  onOpenOrderModal,
  settings,
  darkMode,
  setDarkMode,
  queueCount,
  onOpenPrintQueue,
  onOpenSidebar,
}) => {
  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 select-none gap-3">
      {/* Hamburger menu — mobile only */}
      <button
        onClick={onOpenSidebar}
        className="md:hidden flex-shrink-0 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-black dark:text-white border border-slate-200 dark:border-slate-700 transition"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search Input */}
      <div className="relative flex-1 max-w-sm md:max-w-sm lg:w-96">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-black dark:text-white" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search orders..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
        />
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Warehouse Badge — hidden on small screens */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-black dark:text-white">
          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-black dark:text-white">Hub:</span>
          <span className="font-semibold text-black dark:text-white">{settings.warehouse.city}</span>
        </div>

        {/* Print Queue Quick Action — label hidden on mobile */}
        <button
          onClick={onOpenPrintQueue}
          className="relative flex items-center gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white text-xs font-semibold border border-slate-300 dark:border-slate-700 transition"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">Print Queue</span>
          {queueCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
              {queueCount}
            </span>
          )}
        </button>

        {/* Dark/Light Mode Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white border border-slate-300 dark:border-slate-700 transition"
          title="Toggle Dark / Light Mode"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>

        {/* Create Order Button — label hidden on very small screens */}
        <button
          onClick={onOpenOrderModal}
          className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition transform active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span className="hidden sm:inline">New Order</span>
        </button>
      </div>
    </header>
  );
};
