import React, { useState, useEffect } from 'react';
import { X, Copy, Truck, MessageCircle, CheckCircle2 } from 'lucide-react';
import type { Order } from '../../types';

interface TrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSubmit: (trackingNumber: string, shippingLabelUrl: string | null) => void;
}

export function TrackingModal({ isOpen, onClose, order, onSubmit }: TrackingModalProps) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTrackingNumber('');
      setCopied(false);
      setSent(false);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const trackingUrl = trackingNumber
    ? 'https://myspeedpost.com/track?n=' + trackingNumber.toUpperCase()
    : '';

  const message =
    'Hello ' + order.customer.name + ', your order has been shipped via India Post!\n\n' +
    'Your Tracking Number: ' + trackingNumber.toUpperCase() + '\n' +
    'Track your package here: ' + trackingUrl + '\n\n' +
    'Thank you for shopping with us!';

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Exact same WhatsApp URL construction as the original that worked
  const openWhatsApp = () => {
    const phone = (order.customer.phone || '').replace(/\D/g, '');
    const waPhone = phone.length === 10 ? '91' + phone : phone;
    const url = 'https://wa.me/' + waPhone + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
    setSent(true);
  };

  const handleSaveAndSend = () => {
    if (!trackingNumber.trim()) return;
    onSubmit(trackingNumber.trim(), null);
    openWhatsApp();
  };

  const handleSaveOnly = () => {
    if (!trackingNumber.trim()) return;
    onSubmit(trackingNumber.trim(), null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 text-blue-500 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-black dark:text-white tracking-tight">Shipment Tracking</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {order.id} &nbsp;·&nbsp; {order.customer.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Tracking Number Input */}
          <div>
            <label className="block text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-2">
              India Post Tracking Number
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. EE123456789IN"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && trackingNumber.trim()) handleSaveAndSend(); }}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-black dark:text-white font-mono font-bold text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase"
            />
          </div>

          {/* Message Preview */}
          {trackingNumber && (
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider">
                  WhatsApp Message Preview
                </label>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-black dark:hover:text-white transition"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Copy text'}
                </button>
              </div>

              {/* WhatsApp-style bubble */}
              <div className="bg-[#d9fdd3] dark:bg-[#005c4b] rounded-xl rounded-tl-sm p-4 shadow-sm">
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap font-medium leading-relaxed">
                  {message}
                </p>
                <p className="text-right text-[10px] text-slate-500 dark:text-slate-300 mt-1">
                  {order.customer.phone}
                </p>
              </div>

              {sent && (
                <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  WhatsApp opened — just press Send!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 space-y-2">

          {/* Primary: Save + Send WhatsApp */}
          <button
            onClick={handleSaveAndSend}
            disabled={!trackingNumber.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-40 disabled:pointer-events-none text-white font-black rounded-xl text-sm shadow-lg shadow-[#25D366]/30 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Save &amp; Send via WhatsApp Business
          </button>

          {/* Secondary row */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 font-bold text-sm text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveOnly}
              disabled={!trackingNumber.trim()}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition"
            >
              Save Only
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
