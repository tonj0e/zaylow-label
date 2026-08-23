import React from 'react';
import type { Order, CompanySettings } from '../../types';
import {
  Package,
  Printer,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Truck,
  DollarSign,
  Zap,
  MapPin,
  ChevronRight
} from 'lucide-react';

interface DashboardViewProps {
  orders: Order[];
  settings: CompanySettings;
  onNavigateToOrders: () => void;
  onNavigateToGenerator: (order?: Order) => void;
  onNavigateToBulk: () => void;
}

// Status badge color helper
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'Processing': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
    case 'Label Generated': return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
    case 'Printed': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'Shipped': return 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400';
    case 'Delivered': return 'bg-green-500/15 text-green-600 dark:text-green-400';
    case 'Cancelled': return 'bg-red-500/15 text-red-600 dark:text-red-400';
    default: return 'bg-slate-500/15 text-slate-600 dark:text-slate-400';
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  settings,
  onNavigateToOrders,
  onNavigateToGenerator,
  onNavigateToBulk
}) => {
  const totalOrders = orders.length;
  const pendingCount = orders.filter(o => o.status === 'Pending').length;
  const labelGeneratedCount = orders.filter(o => o.status === 'Label Generated').length;
  const printedCount = orders.filter(o => o.status === 'Printed').length;
  const shippedCount = orders.filter(o => o.status === 'Shipped').length;

  const codOrders = orders.filter(o => o.paymentType === 'COD');
  const prepaidOrders = orders.filter(o => o.paymentType === 'Prepaid');
  const totalCodValue = codOrders.reduce((sum, o) => sum + o.codAmount, 0);

  // Courier Breakdown
  const courierStats: Record<string, number> = {};
  orders.forEach(o => {
    courierStats[o.courier] = (courierStats[o.courier] || 0) + 1;
  });

  const recentOrders = orders.slice(0, 6);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6 select-none pb-8">

      {/* ── WELCOME BANNER ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/60 border border-emerald-500/20 shadow-lg">
        {/* Decorative glows */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 p-4 sm:p-6 md:p-8">
          {/* Badge row */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Helett Thermal Ready
            </span>
            <span className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">4×6 Inches (100×150 mm)</span>
          </div>

          {/* Heading */}
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight mb-2">
            Welcome to<br className="sm:hidden" /> {settings.companyName || 'ZAYLOW'}<br className="sm:hidden" /> Fulfillment Desk
          </h2>

          {/* Subtitle */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4 max-w-md">
            You have{' '}
            <strong className="text-emerald-400 font-black">{pendingCount + labelGeneratedCount} labels</strong>
            {' '}pending print.
            <span className="hidden sm:inline"> Ready for high-speed thermal output.</span>
          </p>

          {/* Action Buttons — compact inline pills */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onNavigateToBulk}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/18 backdrop-blur-sm text-white text-xs font-bold border border-white/20 hover:border-white/35 transition-all duration-300 active:scale-95"
            >
              <Zap className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span>Bulk Import</span>
            </button>
            <button
              onClick={onNavigateToOrders}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-md shadow-emerald-500/30 transition-all duration-300 active:scale-95"
            >
              <span>View All Orders</span>
              <ArrowRight className="w-3 h-3 flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI METRIC CARDS ── 2×2 on mobile, 4 cols on large */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-5">
        {/* Total Orders */}
        <div className="relative p-3.5 sm:p-4 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm active:scale-95 md:hover:shadow-md md:hover:-translate-y-1 transition-all duration-300 overflow-hidden group">
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 ring-1 ring-inset ring-slate-200 dark:ring-slate-700/50 flex items-center justify-center text-slate-500 dark:text-slate-300 group-hover:scale-110 transition-transform duration-300">
              <Package className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
            </div>
          </div>
          <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Orders</p>
          <h3 className="text-2xl sm:text-3xl font-black text-black dark:text-white tracking-tighter leading-none">{totalOrders.toLocaleString()}</h3>
          <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-1.5 font-medium">In local database</p>
        </div>

        {/* Pending Labels */}
        <div className="relative p-3.5 sm:p-4 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm active:scale-95 md:hover:shadow-md md:hover:-translate-y-1 transition-all duration-300 overflow-hidden group">
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 ring-1 ring-inset ring-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform duration-300">
              <Clock className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
            </div>
          </div>
          <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Pending Labels</p>
          <h3 className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400 tracking-tighter leading-none">{pendingCount}</h3>
          <p className="text-[10px] sm:text-xs text-amber-500/70 dark:text-amber-400/70 mt-1.5 font-medium">Needs generation</p>
        </div>

        {/* Printed Labels */}
        <div className="relative p-3.5 sm:p-4 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm active:scale-95 md:hover:shadow-md md:hover:-translate-y-1 transition-all duration-300 overflow-hidden group">
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 ring-1 ring-inset ring-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-300">
              <Printer className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
            </div>
          </div>
          <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Printed Labels</p>
          <h3 className="text-2xl sm:text-3xl font-black text-emerald-500 dark:text-emerald-400 tracking-tighter leading-none">{printedCount}</h3>
          <p className="text-[10px] sm:text-xs text-emerald-500/70 dark:text-emerald-400/70 mt-1.5 font-medium">Ready for dispatch</p>
        </div>

        {/* Shipped */}
        <div className="relative p-3.5 sm:p-4 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm active:scale-95 md:hover:shadow-md md:hover:-translate-y-1 transition-all duration-300 overflow-hidden group">
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 ring-1 ring-inset ring-blue-500/20 flex items-center justify-center text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
              <CheckCircle2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
            </div>
          </div>
          <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Shipped</p>
          <h3 className="text-2xl sm:text-3xl font-black text-blue-500 dark:text-blue-400 tracking-tighter leading-none">{shippedCount}</h3>
          <p className="text-[10px] sm:text-xs text-blue-500/70 dark:text-blue-400/70 mt-1.5 font-medium">Handed to courier</p>
        </div>
      </div>

      {/* ── ANALYTICS ROW ── Stacks on mobile, 3-col on lg */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">

        {/* Courier Share */}
        <div className="p-4 sm:p-5 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <h3 className="font-bold text-sm sm:text-base text-black dark:text-white flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span>Courier Share</span>
            </h3>
            <span className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {Object.keys(courierStats).length} Partners
            </span>
          </div>
          <div className="space-y-3.5">
            {Object.entries(courierStats).map(([courier, count]) => {
              const pct = Math.round((count / totalOrders) * 100);
              return (
                <div key={courier} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-black dark:text-white">{courier}</span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 sm:h-2 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Mode Split */}
        <div className="p-4 sm:p-5 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <h3 className="font-bold text-sm sm:text-base text-black dark:text-white flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span>Payment Split</span>
            </h3>
            <span className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">COD vs Prepaid</span>
          </div>

          {/* Payment bars — mobile uses a big row instead of tiny boxes */}
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="p-3 sm:p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 flex flex-col justify-between">
              <p className="text-[9px] sm:text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider mb-2">COD Orders</p>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-black dark:text-white tracking-tighter">{codOrders.length}</span>
                <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">₹{totalCodValue.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex flex-col justify-between">
              <p className="text-[9px] sm:text-[10px] font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-2">Prepaid</p>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-black dark:text-white tracking-tighter">{prepaidOrders.length}</span>
                <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">100% Collected</p>
              </div>
            </div>
          </div>

          <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            <span>COD labels print with bold high-contrast banners</span>
          </div>
        </div>

        {/* Warehouse Origin */}
        <div className="p-4 sm:p-5 md:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm relative overflow-hidden flex flex-col justify-between md:col-span-2 lg:col-span-1">
          {/* Decorative icon — stays within bounds */}
          <div className="absolute top-3 right-3 opacity-[0.04] pointer-events-none">
            <Package className="w-20 h-20 text-black dark:text-white" />
          </div>

          <div className="relative z-10">
            <h3 className="font-bold text-sm sm:text-base text-black dark:text-white flex items-center gap-2 mb-3 sm:mb-4">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span>Warehouse Origin</span>
            </h3>
            <p className="text-sm font-black text-emerald-500 dark:text-emerald-400 mb-1.5">{settings.warehouse.companyName}</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{settings.warehouse.addressLine}</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{settings.warehouse.city}, {settings.warehouse.state} – {settings.warehouse.pinCode}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap relative z-10">
            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              {settings.warehouse.phone}
            </span>
            <span className="font-mono text-[10px] sm:text-xs font-bold text-emerald-500 dark:text-emerald-400 px-2 py-1 rounded-lg bg-emerald-500/10 break-all">
              {settings.warehouse.gstin}
            </span>
          </div>
        </div>
      </div>

      {/* ── RECENT ORDERS QUEUE ── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 md:px-6 py-3.5 sm:py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-sm sm:text-base text-black dark:text-white flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <span>Recent Orders</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{recentOrders.length}</span>
          </h3>
          <button
            onClick={onNavigateToOrders}
            className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors active:scale-95"
          >
            <span>View All</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Mobile: Card list | Desktop: Table */}

        {/* ── MOBILE ORDER CARDS (hidden on md+) ── */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
          {recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">No recent orders</div>
          ) : recentOrders.map((order) => (
            <button
              key={order.id}
              onClick={() => onNavigateToGenerator(order)}
              className="w-full text-left px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Row 1: Order ID + Status */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs tracking-tight">{order.id}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  {/* Row 2: Customer name */}
                  <p className="font-bold text-sm text-black dark:text-white leading-tight mb-1 truncate">{order.customer.name}</p>
                  {/* Row 3: Location + Courier */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      {order.customer.city}, {order.customer.pinCode}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">•</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{order.courier}</span>
                  </div>
                </div>
                {/* Right: Payment + Arrow */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-xs font-black ${order.paymentType === 'COD' ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {order.paymentType}
                  </span>
                  {order.paymentType === 'COD' && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">₹{order.codAmount}</span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mt-1" />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* ── DESKTOP TABLE (hidden on mobile) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-black dark:text-white">
            <thead className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold">Order ID</th>
                <th className="p-4 font-bold">Customer</th>
                <th className="p-4 font-bold">Location</th>
                <th className="p-4 font-bold">Courier</th>
                <th className="p-4 font-bold">Payment</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                  <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">{order.id}</td>
                  <td className="p-4 font-bold text-black dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{order.customer.name}</td>
                  <td className="p-4 text-slate-600 dark:text-slate-300 text-xs">{order.customer.city}, {order.customer.pinCode}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs shadow-sm">
                      {order.courier}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`font-bold text-xs ${order.paymentType === 'COD' ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {order.paymentType} {order.paymentType === 'COD' ? <span className="opacity-70 font-mono">(₹{order.codAmount})</span> : ''}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider shadow-sm ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onNavigateToGenerator(order)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold transition-all text-xs flex items-center gap-1.5 ml-auto"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Label
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* View All footer on mobile */}
        {recentOrders.length > 0 && (
          <button
            onClick={onNavigateToOrders}
            className="md:hidden w-full py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 border-t border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors active:scale-95"
          >
            View All Orders <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
