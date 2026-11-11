import React from 'react';
import { LayoutDashboard, Menu, Package, Plus, Truck } from 'lucide-react';
import type { ActiveTab } from './Sidebar';

interface MobileNavProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  onNewOrder: () => void;
  onMore: () => void;
  pendingCount: number;
}

/** Phone-only tab bar: the four things used all day, a big "new order" button in the middle, and More for everything else. */
export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onNavigate, onNewOrder, onMore, pendingCount }) => {
  const main: ActiveTab[] = ['dashboard', 'orders', 'tracking'];
  const moreActive = !main.includes(activeTab);

  const Tab: React.FC<{ tab: ActiveTab; label: string; icon: React.ReactNode; badge?: number }> = ({ tab, label, icon, badge }) => {
    const on = activeTab === tab;
    return (
      <button onClick={() => onNavigate(tab)} aria-current={on ? 'page' : undefined} className="flex-1 flex flex-col items-center gap-1 py-1.5 min-w-0">
        <span className="relative w-14 h-8 rounded-full flex items-center justify-center transition-colors" style={on ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { color: 'var(--muted)' }}>
          {icon}
          {!!badge && <span className="absolute -top-0.5 right-1.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{badge > 99 ? '99+' : badge}</span>}
        </span>
        <span className="text-[11px] font-semibold leading-none" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
      </button>
    );
  };

  return (
    <nav aria-label="Main" className="kdash md:hidden fixed bottom-0 inset-x-0 z-40 border-t k-rule select-none" style={{ background: 'var(--card)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-end px-2 pt-1.5 pb-1">
        <Tab tab="dashboard" label="Home" icon={<LayoutDashboard className="w-5 h-5" />} />
        <Tab tab="orders" label="Orders" icon={<Package className="w-5 h-5" />} badge={pendingCount} />
        <div className="flex-1 flex justify-center">
          <button onClick={onNewOrder} aria-label="New order" className="k-btn k-btn-lime w-14 h-14 -mt-6" style={{ boxShadow: '0 10px 24px -8px var(--lime)', border: '4px solid var(--card)' }}>
            <Plus className="w-6 h-6" strokeWidth={2.6} />
          </button>
        </div>
        <Tab tab="tracking" label="Tracking" icon={<Truck className="w-5 h-5" />} />
        <button onClick={onMore} className="flex-1 flex flex-col items-center gap-1 py-1.5 min-w-0" aria-label="More pages">
          <span className="w-14 h-8 rounded-full flex items-center justify-center" style={moreActive ? { background: 'var(--ink)', color: 'var(--bg)' } : { color: 'var(--muted)' }}><Menu className="w-5 h-5" /></span>
          <span className="text-[11px] font-semibold leading-none" style={{ color: moreActive ? 'var(--ink)' : 'var(--muted)' }}>More</span>
        </button>
      </div>
    </nav>
  );
};
