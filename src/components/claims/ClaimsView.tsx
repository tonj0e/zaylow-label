import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { QrScanner } from '../../components/QrScanner';
import type { Order } from '../../types';

interface ClaimsFormState {
  query: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

export const ClaimsView = () => {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [formState, setFormState] = useState<ClaimsFormState>({
    query: '',
    status: 'idle',
    message: ''
  });

  useEffect(() => {
    // Clear previous search when query changes? Actually we search on submit.
  }, []);

  const getClaimStatusBadge = (status: string | null | undefined) => {
    if (!status) return 'bg-slate-500/20 text-black dark:text-white';
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-amber-500/20 text-amber-400';
      case 'approved':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'rejected':
        return 'bg-red-500/20 text-red-400';
      case 'processed':
        return 'bg-blue-500/20 text-blue-400';
      default:
        return 'bg-slate-500/20 text-black dark:text-white';
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setFormState({ query, status: 'error', message: 'Please enter an Order/Tracking ID' });
      return;
    }

    setFormState({ query, status: 'loading', message: 'Looking up order...' });

    try {
      // First, find the order by ID or tracking number
      const orders = await DataService.getOrders();
      const foundOrder = orders.find(o => o.id === query || o.trackingNumber === query);

      if (!foundOrder) {
        setFormState({ query, status: 'error', message: 'Order not found with that ID or tracking number' });
        setOrder(null);
        return;
      }

      setOrder(foundOrder);
      setFormState({ query, status: 'success', message: 'Order found!' });

      // Clear form after success
      setTimeout(() => {
        setFormState({ query: '', status: 'idle', message: '' });
      }, 3000);
    } catch (error) {
      console.error('Error looking up order:', error);
      setFormState({ query, status: 'error', message: 'Failed to look up order. Please try again.' });
      setOrder(null);
    }
  };

  const handleScan = (scannedValue: string) => {
    try {
      const parsed = JSON.parse(scannedValue);
      if (parsed && parsed.id) {
        setQuery(parsed.id);
        return;
      }
    } catch {
      // Not JSON, just use raw string
    }
    setQuery(scannedValue);
  };

  return (
    <div className="p-6 space-y-6 select-none max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white tracking-tight">Claims Lookup</h2>
          <p className="text-xs text-black dark:text-white">Check claim status by Order ID or Tracking Number.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <form onSubmit={handleLookup} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-black dark:text-white mb-1">Order ID / Tracking ID</label>
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <QrScanner
                  className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white rounded-lg font-bold text-sm transition-colors"
                  onScan={handleScan}
                  onError={(error) => alert(`Scan error: ${error}`)}
                />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white dark:bg-slate-900 px-2 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Or</span>
                  </div>
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Enter Order/Tracking ID manually..."
                />
              </div>
            </div>
          </div>

          <button type="submit" className="w-full py-3 rounded-xl bg-purple-500 text-slate-950 font-black flex items-center justify-center gap-2 hover:bg-purple-400 transition-colors shadow-lg shadow-purple-500/20">
            <FileText className="w-5 h-5" />
            <span>Lookup Claim</span>
          </button>
        </form>

        {/* Form Status */}
        {formState.status !== 'idle' && (
          <div className={`mt-2 p-3 rounded-lg text-sm font-medium ${
            formState.status === 'success'
              ? 'bg-purple-500/20 text-purple-400'
              : formState.status === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}>
            {formState.message}
          </div>
        )}
      </div>

      {/* Claim Details */}
      {order && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-black dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
            Claim Details for Order #{order.id}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Order ID:</span>
              <span className="font-mono font-bold text-purple-400">{order.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Customer:</span>
              <span className="font-bold text-black dark:text-white">{order.customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Product:</span>
              <span className="font-bold text-black dark:text-white">{order.item.productName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Claim Date:</span>
              <span className="text-black dark:text-white">
                {order.claimDate ? new Date(order.claimDate).toLocaleDateString() : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Claim Reason:</span>
              <span className="text-black dark:text-white">
                {order.claimReason || 'Not provided'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Status:</span>
              <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                getClaimStatusBadge(order.claimStatus)
              }`}>
                {order.claimStatus || 'No claim'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};