import React, { useState, useEffect, useRef } from 'react';
import {
  Undo2, CheckCircle, XCircle, Loader2, AlertTriangle, Search,
  Package, User, Tag, RefreshCw, ScanLine
} from 'lucide-react';
import { ScannerDisplay } from './ScannerDisplay';
import { DataService } from '../../services/dataService';
import { supabase } from '../../services/supabase';

type ReturnItem = {
  id: number;
  order_id: string;
  customer: string;
  mobile?: string;
  product: string;
  product_id?: string;
  return_reason: string;
  courier?: string;
  tracking_id?: string;
  status: string;
  date_received: string;
  week_label?: string;
  created_at?: string;
};

const anySupabase = supabase as any;

const RETURN_REASONS = [
  'Customer Return',
  'Damaged in Transit',
  'Wrong Product Delivered',
  'Product Defective',
  'Customer Refused Delivery',
  'Address Not Found',
  'Other',
];

export const ReturnsView = () => {
  const [orderId, setOrderId] = useState('');
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [foundOrder, setFoundOrder] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    const { data, error } = await anySupabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setReturnsList(data);
  };

  const getWeekLabel = (date = new Date()): string => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  const handleSearch = async (scanValue?: string) => {
    let raw = (typeof scanValue === 'string' ? scanValue : orderId).trim();
    if (!raw) return;
    
    // Check if the scanned value is a JSON string (from shipping label QR)
    try {
      if (raw.startsWith('{') && raw.endsWith('}')) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) {
          raw = parsed.id;
          setOrderId(raw); // Update the input field to show just the ID
        }
      }
    } catch {
      // Not a valid JSON string, continue with the raw string
    }

    setIsSearching(true);
    setFoundOrder(null);
    setMessage('');
    try {
      const orders = await DataService.getOrders();

      // Normalise the input — try multiple formats:
      // "#406419" → strip # → "406419"
      // "406419"  → also try "ZYL-406419"
      // "ZYL-406419" → exact match
      const stripped = raw.replace(/^#/, '');                   // remove leading #
      const withPrefix = stripped.startsWith('ZYL-') ? stripped : `ZYL-${stripped}`;

      const order = orders.find(o =>
        o.id === raw ||                  // exact match (ZYL-406419)
        o.id === stripped ||             // without # (406419)
        o.id === withPrefix ||           // auto-prefix (ZYL-406419)
        o.trackingNumber === raw ||      // tracking number exact
        o.trackingNumber === stripped || // tracking number stripped
        o.id.replace('ZYL-', '') === stripped  // numeric-only part match
      );

      if (!order) {
        setMessage(`No order found for "${raw}". Make sure you enter the Order ID from the label (e.g. ZYL-406419 or #406419).`);
        setStatus('error');
      } else if (order.status === 'Returned' || order.status === 'Claims') {
        setMessage('This order has already been returned or claimed.');
        setStatus('error');
      } else {
        setFoundOrder(order);
        setStatus('idle');
        setMessage('');
      }
    } catch {
      setMessage('Error looking up order. Please try again.');
      setStatus('error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleLogReturn = async () => {
    if (!foundOrder) return;
    setStatus('loading');
    setMessage('Logging return...');
    try {
      const now = new Date();
      const { error } = await anySupabase.from('returns').insert({
        order_id: foundOrder.id,
        customer: foundOrder.customer.name,
        mobile: foundOrder.customer.phone,
        product: foundOrder.item.productName,
        product_id: foundOrder.item.sku,
        return_reason: returnReason,
        courier: foundOrder.courier,
        tracking_id: foundOrder.trackingNumber || '',
        status: 'Pending Inspection',
        date_received: now.toISOString().split('T')[0],
        week_label: getWeekLabel(now),
      });

      if (error) throw error;

      // Update order status to Claims
      await DataService.updateOrderStatus(foundOrder.id, 'Claims');

      setStatus('success');
      setMessage(`Return logged for ${foundOrder.customer.name}'s order (${foundOrder.id}). Awaiting inspection.`);
      setOrderId('');
      setFoundOrder(null);
      await loadReturns();

      setTimeout(() => { setStatus('idle'); setMessage(''); }, 4000);
    } catch (err: any) {
      console.error('Error logging return:', err);
      setStatus('error');
      setMessage('Failed to log return: ' + (err.message || 'Unknown error'));
    }
  };

  const handleApproveReturn = async (ret: ReturnItem) => {
    if (!window.confirm('Approve this return and restock the product into inventory?')) return;
    try {
      // Release the individual scanned QR product units back into stock
      await DataService.releaseProductsForOrder(ret.order_id, 'In Stock');

      // Update return status
      const { error } = await anySupabase
        .from('returns')
        .update({ status: 'Restocked' })
        .eq('id', ret.id);
      if (error) throw error;

      await loadReturns();
    } catch (err: any) {
      alert('Failed to approve return: ' + (err.message || 'Unknown error'));
    }
  };

  const handleRejectReturn = async (ret: ReturnItem) => {
    if (!window.confirm('Reject this return? The item will be written off (not restocked).')) return;
    try {
      // Mark the individual scanned QR product units as written off
      await DataService.releaseProductsForOrder(ret.order_id, 'Written Off');

      const { error } = await anySupabase
        .from('returns')
        .update({ status: 'Rejected' })
        .eq('id', ret.id);
      if (error) throw error;

      await loadReturns();
    } catch (err: any) {
      alert('Failed to reject return: ' + (err.message || 'Unknown error'));
    }
  };

  const pendingCount = returnsList.filter(r => r.status === 'Pending Inspection').length;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 select-none max-w-6xl mx-auto pb-24 md:pb-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Undo2 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Returns Management</h2>
            <p className="text-xs text-black dark:text-white">Log customer returns and manage restocking.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black border border-amber-500/30">
              {pendingCount} Pending Inspection
            </span>
          )}
          <button onClick={loadReturns} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-black dark:text-white hover:text-black dark:text-white transition">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: Log New Return Form ── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-black dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3">
              Log New Return
            </h3>

            {/* Step 1: Search Order */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider block">
                Step 1 — Enter Order ID or Tracking Number
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={orderId}
                  onChange={e => { setOrderId(e.target.value); setFoundOrder(null); }}
                  onKeyPress={handleKeyPress}
                  placeholder="e.g. ZYL-123456 or TRK001..."
                  className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-black dark:text-white text-sm font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition"
                />
                <button
                  onClick={() => setShowScanner(!showScanner)}
                  className={`px-3 py-2.5 rounded-xl text-slate-950 font-black text-xs transition flex items-center gap-1 ${
                    showScanner ? 'bg-slate-200 dark:bg-slate-700 text-black dark:text-white' : 'bg-emerald-500 hover:bg-emerald-400'
                  }`}
                  title="Scan QR Code"
                >
                  <ScanLine className={`w-4 h-4 ${showScanner ? 'text-black dark:text-white' : 'text-slate-950'}`} />
                </button>
                <button
                  onClick={() => handleSearch()}
                  disabled={!orderId.trim() || isSearching}
                  className="px-3 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition disabled:opacity-40 flex items-center gap-1"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {/* Scanner Modal */}
            {showScanner && (
              <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl space-y-4 relative">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-xl font-bold text-black dark:text-white">Scan Order QR</h2>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Point your camera at the tracking or order label</p>
                    </div>
                    <button onClick={() => setShowScanner(false)} className="p-1 flex-shrink-0 rounded-lg text-slate-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <ScannerDisplay 
                    label="order label" 
                    onScan={(text) => {
                      setOrderId(text);
                      setShowScanner(false);
                      handleSearch(text);
                    }} 
                  />
                  
                  <button onClick={() => setShowScanner(false)} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Found Order Preview */}
            {foundOrder && (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
                  <p className="font-bold text-emerald-400 mb-1 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Order Found
                  </p>
                  <div className="flex items-center gap-2 text-black dark:text-white">
                    <User className="w-3 h-3 text-black dark:text-white" />
                    <span className="font-bold text-black dark:text-white">{foundOrder.customer.name}</span>
                    <span className="text-slate-400 dark:text-slate-500">{foundOrder.customer.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-black dark:text-white">
                    <Package className="w-3 h-3 text-black dark:text-white" />
                    <span>{foundOrder.item.productName}</span>
                    <span className="ml-auto text-slate-400 dark:text-slate-500 font-mono">{foundOrder.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-black dark:text-white">
                    <Tag className="w-3 h-3 text-black dark:text-white" />
                    <span className={`font-bold ${foundOrder.paymentType === 'COD' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {foundOrder.paymentType}{foundOrder.paymentType === 'COD' ? ` ₹${foundOrder.codAmount}` : ''}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">via {foundOrder.courier}</span>
                  </div>
                </div>

                {/* Step 2: Return Reason */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider block">
                    Step 2 — Return Reason
                  </label>
                  <select
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-black dark:text-white text-sm focus:outline-none focus:border-amber-500 transition"
                  >
                    {RETURN_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Step 3: Confirm */}
                <button
                  onClick={handleLogReturn}
                  disabled={status === 'loading'}
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {status === 'loading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span>Logging Return...</span></>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /><span>Confirm & Log Return</span></>
                  )}
                </button>
              </div>
            )}

            {/* Status Message */}
            {message && (
              <div className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                status === 'success'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : status === 'error'
                  ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                  : 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
              }`}>
                {status === 'error' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                {status === 'success' && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span>{message}</span>
              </div>
            )}
          </div>

          {/* Pipeline Info Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-black dark:text-white uppercase tracking-wider">Return Pipeline</h3>
            {[
              { step: '1', label: 'Log Return', desc: 'Enter order ID & reason', color: 'bg-amber-500' },
              { step: '2', label: 'Pending Inspection', desc: 'Product physically received & checked', color: 'bg-orange-500' },
              { step: '3', label: 'Approve → Restocked', desc: 'Item goes back into inventory', color: 'bg-emerald-500' },
              { step: '4', label: 'Reject → Written Off', desc: 'Damaged item, not restocked', color: 'bg-red-500' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full ${s.color} flex items-center justify-center text-[10px] font-black text-black dark:text-white flex-shrink-0 mt-0.5`}>
                  {s.step}
                </div>
                <div>
                  <p className="text-xs font-bold text-black dark:text-white">{s.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Returns List ── */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-black dark:text-white uppercase tracking-wider">Recent Returns</h3>
              <span className="text-xs text-slate-400 dark:text-slate-500">{returnsList.length} total</span>
            </div>

            {returnsList.length === 0 ? (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <Undo2 className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                <p className="font-bold text-black dark:text-white">No Returns Yet</p>
                <p className="text-xs">When a customer returns a product, log it using the form.</p>
              </div>
            ) : (
              <>
                {/* Mobile View: Cards */}
                <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
                  {returnsList.map((ret) => (
                    <div key={ret.id} className="p-4 active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="font-mono font-black text-amber-500 dark:text-amber-400 text-sm tracking-tight block">RET-{ret.id}</span>
                          <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {new Date(ret.date_received).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                          ret.status === 'Restocked'
                            ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/30'
                            : ret.status === 'Rejected'
                            ? 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/30'
                            : 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30'
                        }`}>
                          {ret.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Customer</span>
                          <span className="font-bold text-black dark:text-white block truncate">{ret.customer}</span>
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 block">{ret.order_id}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Reason</span>
                          <span className="font-semibold text-black dark:text-white block">{ret.return_reason}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 mb-3 border border-slate-100 dark:border-slate-800/60">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Product</span>
                        <span className="font-bold text-black dark:text-white leading-tight block line-clamp-1">{ret.product}</span>
                      </div>

                      {ret.status === 'Pending Inspection' ? (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleApproveReturn(ret)}
                            className="flex-1 py-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 active:bg-emerald-500 active:text-slate-950 transition-colors text-xs font-black flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle className="w-4 h-4" /> Restock
                          </button>
                          <button
                            onClick={() => handleRejectReturn(ret)}
                            className="flex-1 py-2 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 active:bg-red-500 active:text-white transition-colors text-xs font-black flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </div>
                      ) : (
                        <div className="pt-1 text-center border-t border-slate-100 dark:border-slate-800/60 pt-3 mt-1">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic font-medium">
                            {ret.status === 'Restocked' ? '✓ Item has been restocked to inventory' : '✗ Item was written off'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-black dark:text-white">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-black dark:text-white font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3.5">Return ID</th>
                        <th className="p-3.5">Order & Customer</th>
                        <th className="p-3.5">Product</th>
                        <th className="p-3.5">Reason</th>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {returnsList.map((ret) => (
                        <tr key={ret.id} className="hover:bg-slate-100 dark:bg-slate-800/40 transition">
                          <td className="p-3.5 font-mono font-black text-amber-400">RET-{ret.id}</td>
                          <td className="p-3.5">
                            <span className="font-bold text-black dark:text-white block">{ret.customer}</span>
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono">{ret.order_id}</span>
                          </td>
                          <td className="p-3.5 text-black dark:text-white font-medium max-w-[120px] truncate">{ret.product}</td>
                          <td className="p-3.5 text-black dark:text-white">{ret.return_reason}</td>
                          <td className="p-3.5 text-slate-400 dark:text-slate-500 text-[10px]">
                            {new Date(ret.date_received).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                              ret.status === 'Restocked'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : ret.status === 'Rejected'
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                              {ret.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {ret.status === 'Pending Inspection' ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleApproveReturn(ret)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 transition text-[10px] font-black flex items-center gap-1"
                                  title="Approve & Restock"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" /> Restock
                                </button>
                                <button
                                  onClick={() => handleRejectReturn(ret)}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-slate-950 transition text-[10px] font-black flex items-center gap-1"
                                  title="Reject / Write-off"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-600 italic">
                                {ret.status === 'Restocked' ? '✓ Restocked' : '✗ Written off'}
                              </span>
                            )}
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
    </div>
  );
};