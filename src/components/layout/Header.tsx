import React, { useState } from 'react';
import { Search, Plus, Moon, Sun, Printer, Building2, X, Zap, LogOut } from 'lucide-react';
import { AuthService } from '../../services/authService';
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
  onOpenSidebar: _onOpenSidebar,
}) => {
  const [searching, setSearching] = useState(false);
  return (
    <>
    {/* Phone: slim bar with the brand, search, print queue and theme. Navigation lives in the bottom tab bar. */}
    <div className="kdash md:hidden sticky top-0 z-30 select-none border-b k-rule" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-2 px-4 h-14">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="w-6 h-6 object-contain dark:invert" /> : <Zap className="w-5 h-5 k-lime-text" />}
        </span>
        <span className="font-bold k-display text-lg truncate">{settings.companyName || 'ZAYLOW'}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button onClick={() => setSearching((v) => !v)} aria-label={searching ? 'Close search' : 'Search orders'} aria-expanded={searching} className="k-btn k-btn-ghost w-10 h-10">{searching ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}</button>
          <button onClick={onOpenPrintQueue} aria-label={`Print queue, ${queueCount} waiting`} className="relative k-btn k-btn-ghost w-10 h-10">
            <Printer className="w-4 h-4 k-lime-text" />
            {queueCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}>{queueCount}</span>}
          </button>
          <button onClick={() => { void AuthService.signOut(); }} aria-label="Sign out" title="Sign out" className="k-btn k-btn-ghost w-10 h-10"><LogOut className="w-4 h-4" /></button>
          <button onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} className="k-btn k-btn-ghost w-10 h-10">{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
        </div>
      </div>
      {searching && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 k-muted" aria-hidden="true" />
            <input autoFocus type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, phone, order ID or tracking" aria-label="Search orders" className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999 }} />
          </div>
        </div>
      )}
    </div>

    <div className="kdash hidden md:block sticky top-3 z-30 md:pr-3 select-none" style={{ background: 'transparent' }}>
      <header className="k-card flex items-center gap-2 md:gap-3 px-2.5 py-2" style={{ borderRadius: 999 }}>
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

          <button onClick={() => { void AuthService.signOut(); }} aria-label="Sign out" title="Sign out" className="k-btn k-btn-ghost w-10 h-10"><LogOut className="w-4 h-4" /></button>

          <button onClick={onOpenOrderModal} className="k-btn k-btn-lime h-10 px-4 text-sm" style={{ boxShadow: '0 8px 22px -10px var(--lime)' }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New order</span>
          </button>
        </div>
      </header>
    </div>
    </>
  );
};
