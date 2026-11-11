import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Printer,
  UploadCloud,
  Settings,
  Plug,
  Map as MapIcon,
  Zap,
  Tag,
  PlusSquare,
  List,
  Search,
  Undo2,
  LogOut,
  BarChart3,
  FileBarChart,
  FileText,
  ChevronDown,
  Clock,
  Truck,
  Award,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ENABLE_MULTI_WAREHOUSE } from '../../constants/featureFlags';
import { StorageService } from '../../services/storage';
import type { OrderStatus } from '../../types';

export type ActiveTab =
  | 'dashboard'
  | 'orders'
  | 'generator'
  | 'bulk'
  | 'printQueue'
  | 'settings'
  | 'inventory-add'
  | 'inventory-list'
  | 'inventory-search'
  | 'returns'
  | 'inventory-out'
  | 'stock-summary'
  | 'reports'
  | 'warranty'
  | 'claims'
  | 'cartons'
  | 'products'
  | 'warranty-cards'
  | 'tracking'
  | 'erp'
  | 'shipping-map';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingCount: number;
  queueCount: number;
  orderStatusFilter?: OrderStatus | 'ALL';
  setOrderStatusFilter?: (status: OrderStatus | 'ALL') => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface Item {
  tab: ActiveTab;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const STATUSES = ['ALL', 'Pending', 'Processing', 'Label Generated', 'Printed', 'Shipped', 'Delivered', 'Cancelled', 'Claims', 'Returned'] as const;

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingCount,
  queueCount,
  orderStatusFilter = 'ALL',
  setOrderStatusFilter,
  isOpen = false,
  onClose,
}) => {
  const settings = StorageService.getSettings();
  const [ordersOpen, setOrdersOpen] = useState(false); // status list stays hidden until the arrow is pressed

  const go = (tab: ActiveTab) => {
    setActiveTab(tab);
    onClose?.();
  };

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Stock',
      items: [
        { tab: 'inventory-add', label: 'Receive inventory', icon: PlusSquare },
        { tab: 'inventory-list', label: 'Inventory', icon: List },
        { tab: 'inventory-search', label: 'Search stock', icon: Search },
        { tab: 'generator', label: 'Print labels', icon: Tag },
      ],
    },
    {
      title: 'Orders',
      items: [
        { tab: 'orders', label: 'All orders', icon: Package, badge: pendingCount },
        { tab: 'bulk', label: 'Bulk import', icon: UploadCloud },
        { tab: 'printQueue', label: 'Print queue', icon: Printer, badge: queueCount },
        { tab: 'tracking', label: 'Tracking and COD', icon: Truck },
        { tab: 'shipping-map', label: 'Shipping map', icon: MapIcon },
      ],
    },
    ...(ENABLE_MULTI_WAREHOUSE
      ? [{
          title: 'Warehouse',
          items: [
            { tab: 'returns', label: 'Returns', icon: Undo2 },
            { tab: 'inventory-out', label: 'Inventory out', icon: LogOut },
            { tab: 'stock-summary', label: 'Stock summary', icon: BarChart3 },
            { tab: 'cartons', label: 'Cartons', icon: Package },
            { tab: 'products', label: 'Products', icon: Tag },
            { tab: 'reports', label: 'Reports', icon: FileBarChart },
          ] as Item[],
        }]
      : []),
    {
      title: 'Warranty',
      items: [
        { tab: 'warranty', label: 'Warranty', icon: Clock },
        { tab: 'warranty-cards', label: 'Warranty cards', icon: Award },
        { tab: 'claims', label: 'Claims', icon: FileText },
      ],
    },
    { title: 'Config', items: [{ tab: 'erp', label: 'ERP connection', icon: Plug }, { tab: 'settings', label: 'Settings', icon: Settings }] },
  ];

  const navButton = (item: Item) => {
    const active = activeTab === item.tab;
    const Icon = item.icon;
    return (
      <button
        onClick={(e) => {
          // a click closes the rail right away; it opens again once the mouse leaves and comes back
          e.currentTarget.closest('.rail')?.classList.add('rail-closed');
          e.currentTarget.blur();
          if (item.tab === 'orders' && setOrderStatusFilter && activeTab !== 'orders') setOrderStatusFilter('ALL');
          go(item.tab);
        }}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={item.label}
        className={`rail-btn relative w-full h-11 flex items-center rounded-2xl text-sm font-semibold transition-colors ${active ? 'k-btn-lime' : 'hover:bg-[var(--card2)]'}`}
        style={active ? undefined : { color: 'var(--muted)' }}
      >
        <span className="rail-icon w-11 h-11 flex items-center justify-center shrink-0 relative">
          <Icon className="w-[18px] h-[18px]" />
          {!!item.badge && (
            <span className="rail-dot absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: active ? 'var(--on-lime)' : 'var(--lime)' }} />
          )}
        </span>
        <span className="rail-fade whitespace-nowrap pr-3" style={{ color: active ? undefined : 'var(--ink)' }}>{item.label}</span>
        {!!item.badge && (
          <span className={`rail-count ml-auto ${item.tab === 'orders' ? 'mr-10' : 'mr-3'} text-[11px] font-bold rounded-full px-2 py-0.5`} style={{ background: active ? 'rgba(0,0,0,.15)' : 'var(--card2)', color: active ? 'var(--on-lime)' : 'var(--ink)' }}>{item.badge}</span>
        )}
      </button>
    );
  };

  const rail = (mobile: boolean) => (
    <nav aria-label="Main" className="h-full flex flex-col py-2.5 px-2.5 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-center h-12 mb-1 shrink-0">
        <span className="w-11 h-11 flex items-center justify-center shrink-0">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="w-8 h-8 object-contain dark:invert" />
          ) : (
            <span className="w-9 h-9 rounded-xl k-btn-lime flex items-center justify-center"><Zap className="w-5 h-5" /></span>
          )}
        </span>
        <span className="rail-fade whitespace-nowrap font-bold text-base">{settings.companyName || 'ZAYLOW'}</span>
        {onClose && mobile && (
          <button onClick={onClose} aria-label="Close menu" className="md:hidden ml-auto w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--card2)]"><X className="w-5 h-5" /></button>
        )}
      </div>

      {navButton({ tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard })}

      {groups.map((g) => (
        <div key={g.title} className="rail-group mt-3 space-y-0.5">
          <div className="h-5 flex items-center px-3">
            <span className="rail-fade text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--muted)' }}>{g.title}</span>
            <span className="rail-tick absolute left-[26px] w-3 border-t k-rule" aria-hidden />
          </div>
          {g.items.map((item) => (
            <React.Fragment key={item.tab}>
              {item.tab === 'orders' ? (
                <div className="relative">
                  {navButton(item)}
                  <button
                    onClick={() => setOrdersOpen((v) => !v)}
                    aria-expanded={ordersOpen}
                    aria-label={ordersOpen ? 'Hide order statuses' : 'Show order statuses'}
                    className="rail-fade absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10"
                    style={{ color: activeTab === 'orders' ? 'var(--on-lime)' : 'var(--muted)' }}
                  >
                    <ChevronDown className="w-4 h-4" style={{ transform: ordersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </button>
                </div>
              ) : navButton(item)}
              {item.tab === 'orders' && ordersOpen && setOrderStatusFilter && (
                <ul className="rail-sub ml-[22px] pl-3 border-l k-rule py-1 space-y-0.5">
                  {STATUSES.map((status) => {
                    const on = orderStatusFilter === status;
                    return (
                      <li key={status}>
                        <button
                          onClick={(e) => { e.currentTarget.closest('.rail')?.classList.add('rail-closed'); e.currentTarget.blur(); setActiveTab('orders'); setOrderStatusFilter(status as OrderStatus | 'ALL'); onClose?.(); }}
                          aria-pressed={on}
                          className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--card2)]"
                          style={{ fontWeight: on ? 700 : 500, color: on ? 'var(--ink)' : 'var(--muted)', background: on ? 'var(--card2)' : undefined }}
                        >
                          {status === 'ALL' ? 'All statuses' : status}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </React.Fragment>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop: a floating icon rail that opens over the page on hover or keyboard focus */}
      <div className="hidden md:block shrink-0 w-[88px]" aria-hidden={false}>
        <div
          className="kdash rail fixed left-3 top-3 bottom-3 z-40 k-card overflow-hidden shadow-xl"
          style={{ borderRadius: 26, background: 'var(--card)' }}
          onMouseLeave={(e) => e.currentTarget.classList.remove('rail-closed')}
        >
          {rail(false)}
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className="absolute inset-0 transition-opacity duration-300" style={{ background: 'rgba(0,0,0,.55)', opacity: isOpen ? 1 : 0 }} onClick={onClose} />
        <div
          className="kdash rail rail-open absolute left-2 top-2 bottom-2 k-card overflow-hidden shadow-2xl transition-transform duration-300"
          style={{ width: 260, transform: isOpen ? 'none' : 'translateX(-110%)', borderRadius: 26, background: 'var(--card)' }}
        >
          {rail(true)}
        </div>
      </div>
    </>
  );
};
