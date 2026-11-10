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
    <div className="kdash sticky top-3 z-30 px-3 md:px-0 md:pr-3 pt-3 md:pt-0 select-none" style={{ background: 'transparent' }}>
      <header className="k-card flex items-center gap-2 md:gap-3 px-2.5 py-2" style={{ borderRadius: 999 }}>
        <button onClick={onOpenSidebar} aria-label="Open menu" className="md:hidden k-btn k-btn-ghost w-10 h-10 shrink-0">
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 k-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders"
            aria-label="Search orders"
            className="k-field"
            style={{ paddingLeft: '2.5rem', borderRadius: 999, paddingTop: '.55rem', paddingBottom: '.55rem' }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-3 h-10 rounded-full k-card2 text-xs font-semibold">
            <Building2 className="w-4 h-4 k-lime-text" />
            <span>{settings.warehouse.city}</span>
          </div>

          <button onClick={onOpenPrintQueue} className="relative k-btn k-btn-ghost h-10 px-3 text-xs">
            <Printer className="w-4 h-4 k-lime-text" />
            <span className="hidden sm:inline">Print queue</span>
            {queueCount > 0 && <span className="min-w-5 h-5 px-1 rounded-full k-btn-lime text-[11px] font-bold flex items-center justify-center">{queueCount}</span>}
          </button>

          <button onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} className="k-btn k-btn-ghost w-10 h-10">
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button onClick={onOpenOrderModal} className="k-btn k-btn-lime h-10 px-4 text-sm" style={{ boxShadow: '0 8px 22px -10px var(--lime)' }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New order</span>
          </button>
        </div>
      </header>
    </div>
  );
};
