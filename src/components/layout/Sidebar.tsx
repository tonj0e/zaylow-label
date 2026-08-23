import React from 'react';
import {
  LayoutDashboard,
  Package,
  Printer,
  UploadCloud,
  Settings,
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
  Clock,
  X
} from 'lucide-react';
import { ENABLE_MULTI_WAREHOUSE } from '../../constants/featureFlags';
import { StorageService } from '../../services/storage';

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
  | 'products';

import type { OrderStatus } from '../../types';

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
  const [isOrdersExpanded, setIsOrdersExpanded] = React.useState(activeTab === 'orders');
  const [isInventoryExpanded, setIsInventoryExpanded] = React.useState(activeTab === 'inventory-list' || activeTab === 'inventory-search');
  const isNavActive = (tab: ActiveTab) => activeTab === tab;

  const handleNav = (tab: ActiveTab) => {
    setActiveTab(tab);
    // Close drawer on mobile after navigation
    if (onClose) onClose();
  };

  const settings = StorageService.getSettings();

  const sidebarContent = (
    <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between select-none overflow-y-auto h-full">
      {/* Brand Logo & Name */}
      <div>
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 object-contain dark:invert" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
                <Zap className="w-5 h-5 fill-current" />
              </div>
            )}
            <div>
              <h1 className="font-black text-lg text-black dark:text-white tracking-wide leading-none">
                {settings.companyName || 'ZAYLOW'}
              </h1>
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">
                Warehouse
              </span>
            </div>
          </div>
          {/* Close button - only visible on mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-black dark:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="px-3 py-4 space-y-1">
          
          <button
            onClick={() => handleNav('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              isNavActive('dashboard')
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-bold'
                : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className={`w-4 h-4 ${isNavActive('dashboard') ? 'text-slate-950' : 'text-black dark:text-white'}`} />
            <span>Dashboard</span>
          </button>

          {/* INVENTORY SECTION */}
          <div className="pt-2 pb-1">
            <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Inventory</span>
          </div>
          
          <div className="space-y-0.5">
            <button
              onClick={() => handleNav('inventory-add')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('inventory-add') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <PlusSquare className="w-4 h-4" /> <span>Add New Inventory</span>
            </button>
            <div>
              <button
                onClick={() => {
                  if (activeTab === 'inventory-list') {
                    setIsInventoryExpanded(!isInventoryExpanded);
                  } else {
                    setActiveTab('inventory-list');
                    setIsInventoryExpanded(true);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isNavActive('inventory-list') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                }`}
              >
                <List className="w-4 h-4" /> <span>Inventory List</span>
              </button>
              
              {/* Expandable Inventory Search */}
              {isInventoryExpanded && (
                <div className="pl-9 pr-3 py-2 space-y-1 mt-1 border-l-2 border-slate-200 dark:border-slate-800 ml-4">
                  <button
                    onClick={() => handleNav('inventory-search')}
                    className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-all flex items-center gap-2 ${
                      isNavActive('inventory-search')
                        ? 'text-emerald-400 font-bold bg-slate-100 dark:bg-slate-800/60'
                        : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" /> <span>Search Inventory</span>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => handleNav('generator')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('generator') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <Tag className="w-4 h-4" /> <span>Print Labels</span>
            </button>
          </div>

          {/* ORDERS SECTION */}
          <div className="pt-4 pb-1">
            <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Orders</span>
          </div>

          <div className="space-y-0.5">
            <div>
              <button
                onClick={() => {
                  if (activeTab === 'orders') {
                    setIsOrdersExpanded(!isOrdersExpanded);
                  } else {
                    setActiveTab('orders');
                    setIsOrdersExpanded(true);
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                  isNavActive('orders') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4" /> <span>All Orders</span>
                </div>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {pendingCount}
                  </span>
                )}
              </button>
              
              {/* Expandable Status Filters */}
              {isOrdersExpanded && setOrderStatusFilter && (
                <div className="pl-9 pr-3 py-2 space-y-1 mt-1 border-l-2 border-slate-200 dark:border-slate-800 ml-4">
                  {['ALL', 'Pending', 'Processing', 'Label Generated', 'Printed', 'Shipped', 'Delivered', 'Cancelled', 'Claims'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setActiveTab('orders');
                        setOrderStatusFilter(status as OrderStatus | 'ALL');
                        if (onClose) onClose();
                      }}
                      className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-all ${
                        activeTab === 'orders' && orderStatusFilter === status
                          ? 'text-emerald-400 font-bold bg-slate-100 dark:bg-slate-800/60'
                          : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                      }`}
                    >
                      {status === 'ALL' ? 'All Statuses' : status}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleNav('bulk')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('bulk') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <UploadCloud className="w-4 h-4" /> <span>Bulk Import</span>
            </button>
            <button
              onClick={() => handleNav('printQueue')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('printQueue') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <Printer className="w-4 h-4" /> <span>Print Queue</span>
              </div>
              {queueCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-50 dark:bg-slate-950 text-emerald-400">
                  {queueCount}
                </span>
              )}
            </button>
          </div>

          {/* WAREHOUSE SECTION */}
          {ENABLE_MULTI_WAREHOUSE && (
            <>
              <div className="pt-2 pb-1">
                <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Warehouse</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('returns')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('returns') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <Undo2 className="w-4 h-4" /> <span>Returns</span>
                </button>
                <button
                  onClick={() => handleNav('inventory-out')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('inventory-out') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <LogOut className="w-4 h-4" /> <span>Inventory Out</span>
                </button>
                <button
                  onClick={() => handleNav('stock-summary')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('stock-summary') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" /> <span>Stock Summary</span>
                </button>
                <button
                  onClick={() => handleNav('cartons')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('cartons') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <Package className="w-4 h-4" /> <span>Cartons</span>
                </button>
                <button
                  onClick={() => handleNav('products')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('products') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <Tag className="w-4 h-4" /> <span>Products</span>
                </button>
                <button
                  onClick={() => handleNav('reports')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    isNavActive('reports') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
                  }`}
                >
                  <FileBarChart className="w-4 h-4" /> <span>Reports</span>
                </button>
              </div>
            </>
          )}

          {/* WARRANTY SECTION */}
          <div className="pt-2 pb-1">
            <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Warranty</span>
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => handleNav('warranty')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('warranty') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <Clock className="w-4 h-4" /> <span>Warranty</span>
            </button>
            <button
              onClick={() => handleNav('claims')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isNavActive('claims') ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold' : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
              }`}
            >
              <FileText className="w-4 h-4" /> <span>Claims</span>
            </button>
          </div>

          {/* CONFIG SECTION */}
          <div className="pt-4 pb-1">
            <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Config</span>
          </div>

          <button
            onClick={() => handleNav('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              isNavActive('settings')
                ? 'bg-slate-100 dark:bg-slate-800 text-emerald-400 font-semibold'
                : 'text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800/40'
            }`}
          >
            <Settings className="w-4 h-4" /> <span>Settings</span>
          </button>

        </nav>
      </div>

    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar — always visible on md+ */}
      <div className="hidden md:flex md:flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        {/* Drawer panel */}
        <div
          className={`absolute left-0 top-0 h-full transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </div>
      </div>
    </>
  );
};
