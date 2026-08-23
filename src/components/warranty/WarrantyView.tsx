import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { QrScanner } from '../../components/QrScanner';
import type { Order } from '../../types';

interface WarrantyFormState {
  query: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

export const WarrantyView = () => {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [formState, setFormState] = useState<WarrantyFormState>({
    query: '',
    status: 'idle',
    message: ''
  });

  useEffect(() => {
    // Clear previous search when query changes? Actually we search on submit.
  }, []);

  const getWarrantyStatus = (warrantyStart: string | null | undefined, warrantyEnd: string | null | undefined, orderStatus?: string) => {
    if (orderStatus && orderStatus !== 'Delivered') {
      return 'Pending Delivery';
    }
    
    if (!warrantyStart || !warrantyEnd) {
      return 'No warranty';
    }

    const now = new Date();
    const start = new Date(warrantyStart);
    const end = new Date(warrantyEnd);

    if (now < start) {
      return 'Not started';
    } else if (now > end) {
      return 'Expired';
    } else {
      return 'Active';
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 select-none max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-black dark:text-white tracking-tight">Warranty Lookup</h2>
          <p className="text-[10px] sm:text-xs text-black dark:text-white mt-0.5 sm:mt-0">Check warranty status by Order ID or Tracking Number.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
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
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter Order/Tracking ID manually..."
                />
              </div>
            </div>
          </div>

          <button type="submit" className="w-full py-3 rounded-xl bg-blue-500 text-slate-950 font-black flex items-center justify-center gap-2 hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/20 active:scale-[0.98]">
            <Clock className="w-5 h-5" />
            <span>Lookup Warranty</span>
          </button>
        </form>

        {/* Form Status */}
        {formState.status !== 'idle' && (
          <div className={`mt-2 p-3 rounded-lg text-sm font-medium ${
            formState.status === 'success'
              ? 'bg-blue-500/20 text-blue-400'
              : formState.status === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {formState.message}
          </div>
        )}
      </div>

      {/* Warranty Details */}
      {order && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-bold text-black dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
            Warranty Details for Order #{order.id}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Order ID:</span>
              <span className="font-mono font-bold text-blue-400">{order.id}</span>
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
              <span className="text-black dark:text-white">Warranty Start:</span>
              <span className="text-black dark:text-white">
                {order.warrantyStart ? new Date(order.warrantyStart).toLocaleDateString() : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-black dark:text-white">Warranty End:</span>
              <span className="text-black dark:text-white">
                {order.warrantyEnd ? new Date(order.warrantyEnd).toLocaleDateString() : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-black dark:text-white">Status:</span>
              <span className={`font-bold px-3 py-1 rounded-full text-xs uppercase ${
                getWarrantyStatus(order.warrantyStart, order.warrantyEnd, order.status) === 'Active' ? 'bg-green-500/20 text-green-500' :
                getWarrantyStatus(order.warrantyStart, order.warrantyEnd, order.status) === 'Pending Delivery' ? 'bg-yellow-500/20 text-yellow-500' :
                'bg-red-500/20 text-red-500'
              }`}>
                {getWarrantyStatus(order.warrantyStart, order.warrantyEnd, order.status)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};