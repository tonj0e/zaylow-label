import React, { useCallback, useState } from 'react';
import { Camera, Loader2, Search, X } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { ScannerDisplay } from '../warehouse/ScannerDisplay';
import type { Order } from '../../types';

/** A QR may hold plain text or JSON like {"id":"ZYL-1"}; return the bare value either way. */
const readScanned = (text: string): string => {
  try { const p = JSON.parse(text); if (p && typeof p === 'object' && p.id) return String(p.id); } catch { /* plain text */ }
  return text.trim();
};

const digits = (s: string) => s.replace(/\D/g, '');

/** Order ID (with or without ZYL-), tracking number, or phone number. Case and spaces do not matter. */
const findOrder = (orders: Order[], raw: string): Order | undefined => {
  const q = raw.trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
  if (!q) return undefined;
  const withPrefix = q.startsWith('zyl-') ? q : `zyl-${q}`;
  const byId = orders.find((o) => {
    const id = (o.id || '').toLowerCase();
    return id === q || id === withPrefix || id.replace(/^zyl-/, '') === q;
  });
  if (byId) return byId;
  const byTrack = orders.find((o) => (o.trackingNumber || '').replace(/\s+/g, '').toLowerCase() === q);
  if (byTrack) return byTrack;
  if (digits(q).length >= 10) {
    const tail = digits(q).slice(-10);
    return orders.find((o) => digits(o.customer.phone || '').slice(-10) === tail);
  }
  return undefined;
};

interface Props {
  buttonLabel: string;
  onFound: (order: Order | null) => void;
}

/** Scan a label with the camera or type the number, then look the order up. */
export const OrderLookup: React.FC<Props> = ({ buttonLabel, onFound }) => {
  const [query, setQuery] = useState('');
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lookup = useCallback(async (raw: string) => {
    const value = readScanned(raw);
    if (!value) { setError('Type or scan an order ID, tracking number or phone number.'); return; }
    setBusy(true); setError('');
    try {
      const order = findOrder(await DataService.getOrders(), value);
      if (!order) { setError(`No order matches "${value}". Check the number and try again.`); onFound(null); }
      else { onFound(order); setQuery(''); }
    } catch {
      setError('Could not load orders. Check your connection and try again.');
      onFound(null);
    } finally { setBusy(false); }
  }, [onFound]);

  const onScan = useCallback((text: string) => {
    const v = readScanned(text);
    setQuery(v); setCamera(false);
    void lookup(v);
  }, [lookup]);

  return (
    <div className="k-card p-5 space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); void lookup(query); }} className="space-y-3">
        <label htmlFor="order-lookup" className="k-label">Order ID, tracking number or phone</label>
        <div className="flex gap-2 flex-wrap">
          <input id="order-lookup" value={query} onChange={(e) => { setQuery(e.target.value); if (error) setError(''); }} className="k-field font-mono flex-1 min-w-[12rem]" style={{ width: 'auto' }} placeholder="e.g. 107036 or CL431677163IN" autoComplete="off" />
          <button type="button" onClick={() => setCamera((v) => !v)} aria-pressed={camera} className="k-btn k-btn-soft px-4 text-sm shrink-0">
            {camera ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />} {camera ? 'Close camera' : 'Scan'}
          </button>
          <button type="submit" disabled={busy} className="k-btn k-btn-lime px-5 py-3 text-sm shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {buttonLabel}
          </button>
        </div>
      </form>
      {camera && <ScannerDisplay label="order" onScan={onScan} />}
      {error && <p role="alert" className="text-sm font-medium k-bad">{error}</p>}
    </div>
  );
};
