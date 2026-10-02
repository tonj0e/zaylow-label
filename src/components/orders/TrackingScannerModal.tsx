import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, QrCode, Truck, CheckCircle2, Search, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../../types';
import { parseTrackingCode } from '../../utils/trackingParser';

interface TrackingScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateTracking: (id: string, trackingNumber: string, shippingLabelUrl: string | null) => void;
  initialOrder?: Order | null;
}

// Audio chime for immediate tactile confirmation
const playSuccessChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // Ignore audio context restrictions
  }
};



export const TrackingScannerModal: React.FC<TrackingScannerModalProps> = ({
  isOpen,
  onClose,
  orders,
  onUpdateStatus,
  onUpdateTracking,
  initialOrder
}) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialOrder || null);
  const [scannedTracking, setScannedTracking] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastShipped, setLastShipped] = useState<{ order: Order; tracking: string } | null>(null);
  const [recentShippedList, setRecentShippedList] = useState<Array<{ orderId: string; customer: string; tracking: string; time: string }>>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (initialOrder) {
      setSelectedOrder(initialOrder);
    }
  }, [initialOrder]);

  const executeShipOrder = useCallback((targetOrder: Order, tracking: string) => {
    onUpdateStatus(targetOrder.id, 'Shipped');
    onUpdateTracking(targetOrder.id, tracking, null);
    playSuccessChime();

    setLastShipped({ order: targetOrder, tracking });
    setRecentShippedList(prev => [
      {
        orderId: targetOrder.id,
        customer: targetOrder.customer.name,
        tracking: tracking,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      },
      ...prev.slice(0, 4)
    ]);

    // Reset selection for next scan
    setSelectedOrder(null);
    setScannedTracking('');
  }, [onUpdateStatus, onUpdateTracking]);

  // Handle successful scan from Camera or USB Barcode gun
  const handleCodeScanned = useCallback(async (rawText: string) => {
    const now = Date.now();
    // Debounce duplicate scans within 1.5 seconds
    if (now - lastScannedTimeRef.current < 1500) return;
    lastScannedTimeRef.current = now;

    const trimmed = rawText.trim();
    if (!trimmed) return;

    // Check if the scan is a Shipping Label QR Code payload
    let scannedOrderId: string | null = null;
    try {
      if (trimmed.startsWith('{') && trimmed.includes('id')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.id) scannedOrderId = parsed.id;
      }
    } catch {
      // not JSON
    }

    if (!scannedOrderId && (trimmed.startsWith('ZYL-') || trimmed.toLowerCase().startsWith('zyl-'))) {
      scannedOrderId = trimmed.toUpperCase();
    }

    // If a parcel box QR was scanned, select that order
    if (scannedOrderId) {
      const match = orders.find(o => o.id.toUpperCase() === scannedOrderId?.toUpperCase());
      if (match) {
        setSelectedOrder(match);
        playSuccessChime();
        return;
      }
    }

    // Otherwise, treat as India Post tracking barcode (e.g. CL575897302IN)
    const trackingCode = parseTrackingCode(trimmed);
    if (!trackingCode) return;

    setScannedTracking(trackingCode);

    // If an order is already selected (e.g. initialOrder or previously picked/scanned)
    if (selectedOrder) {
      executeShipOrder(selectedOrder, trackingCode);
      return;
    }

    // If an order already possesses this tracking ID in the system
    const existingWithTracking = orders.find(o => (o.trackingNumber || '').toUpperCase() === trackingCode);
    if (existingWithTracking) {
      executeShipOrder(existingWithTracking, trackingCode);
      return;
    }

    // If only 1 order is in "Printed" status, or first filtered match
    const printedOrders = orders.filter(o => o.status === 'Printed' || o.status === 'Label Generated' || o.status === 'Processing');
    if (printedOrders.length === 1) {
      executeShipOrder(printedOrders[0], trackingCode);
      return;
    }

    playSuccessChime();
  }, [orders, selectedOrder, executeShipOrder]);

  // Video scanner initialization with @zxing/browser
  useEffect(() => {
    if (!isOpen || !cameraActive) return;

    let controls: { stop: () => void } | null = null;
    let isMounted = true;

    const startCamera = async () => {
      try {
        setCameraError(null);
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.EAN_13
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });

        if (!videoRef.current || !isMounted) return;

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const ctrl = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result, _error) => {
            if (result && isMounted) {
              handleCodeScanned(result.getText());
            }
          }
        );
        controls = ctrl;
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Camera init error:', msg);
          setCameraError('Camera not accessible or permission denied. You can still scan with a USB barcode scanner or select order manually.');
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (controls) {
        controls.stop();
      }
    };
  }, [isOpen, cameraActive, handleCodeScanned]);

  // Support USB / Bluetooth handheld barcode scanner keyboard wedges
  useEffect(() => {
    if (!isOpen) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in the search input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 6) {
          handleCodeScanned(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCodeScanned]);

  if (!isOpen) return null;

  // Orders eligible for shipping (Printed, Label Generated, Processing, Pending)
  const candidateOrders = orders.filter(o => {
    if (o.status === 'Delivered' || o.status === 'Cancelled' || o.status === 'Returned') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer.name.toLowerCase().includes(q) ||
      o.customer.phone.includes(q) ||
      (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-black dark:text-white tracking-tight flex items-center gap-2">
                India Post Tracking Scanner
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Scan to Ship
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Scan tracking barcode/QR code on India Post label to automatically mark orders as Shipped.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition text-slate-500 hover:text-black dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Success Flash Banner */}
          {lastShipped && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    Order #{lastShipped.order.id.replace('ZYL-', '')} Marked as SHIPPED!
                  </span>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    {lastShipped.order.customer.name} &nbsp;·&nbsp; Tracking: <strong className="font-mono text-black dark:text-white">{lastShipped.tracking}</strong>
                  </span>
                </div>
              </div>
              <span className="px-2 py-1 bg-emerald-500 text-slate-950 font-black text-[10px] rounded-lg shrink-0">
                Shipped
              </span>
            </div>
          )}

          {/* Active Target Order Banner (if an order is selected) */}
          {selectedOrder && (
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Assigning to Customer:
                  </span>
                  <h4 className="font-black text-black dark:text-white text-sm leading-tight">
                    {selectedOrder.customer.name} <span className="font-mono font-normal text-xs text-slate-500">(#{selectedOrder.id.replace('ZYL-', '')})</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedOrder.customer.city || 'India'} &nbsp;·&nbsp; {selectedOrder.paymentType} {selectedOrder.codAmount ? `₹${selectedOrder.codAmount}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-red-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Change
              </button>
            </div>
          )}

          {/* Camera Scanner View */}
          <div className="relative rounded-2xl bg-black overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video max-h-[220px] flex items-center justify-center shadow-inner">
            {cameraActive && !cameraError ? (
              <>
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                
                {/* Aiming Reticle & Animated Scan Bar */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  <div className="relative w-48 sm:w-64 h-24 sm:h-28 border-2 border-emerald-400/80 rounded-xl shadow-lg">
                    {/* Animated scanning beam */}
                    <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
                    
                    {/* Corner marks */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>

                <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-black/70 text-white backdrop-blur-sm">
                    Aim camera at India Post tracking barcode or QR code
                  </span>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <p>{cameraError || 'Camera paused.'}</p>
                <button
                  onClick={() => { setCameraActive(true); setCameraError(null); }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 transition inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
              </div>
            )}
          </div>

          {/* Scanned Tracking Barcode Banner (if code was read but order not confirmed yet) */}
          {scannedTracking && !selectedOrder && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs animate-in slide-in-from-top-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                  Scanned Tracking Number:
                </span>
                <span className="font-mono font-black text-sm text-black dark:text-white">
                  {scannedTracking}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Select customer below or scan their box QR to pair and mark Shipped.
                </span>
              </div>
              <button
                onClick={() => setScannedTracking('')}
                className="p-1 rounded-lg hover:bg-amber-500/20 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Select Order List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Select Order To Ship</span>
                <span className="text-[10px] font-normal text-slate-400">
                  ({candidateOrders.length} ready)
                </span>
              </label>

              <div className="relative w-48 sm:w-56">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer, phone, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              {candidateOrders.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No orders waiting to ship matching your search.
                </div>
              ) : (
                candidateOrders.slice(0, 15).map(o => {
                  const isCurrent = selectedOrder?.id === o.id;
                  return (
                    <div
                      key={o.id}
                      className={`p-2.5 rounded-xl transition flex items-center justify-between gap-3 text-xs ${
                        isCurrent
                          ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-500/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-black dark:text-white truncate">
                            {o.customer.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            #{o.id.replace('ZYL-', '')}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {o.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {o.item?.productName || 'Order'} &nbsp;·&nbsp; {o.customer.phone} &nbsp;·&nbsp; {o.customer.city || 'India'}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {scannedTracking ? (
                          <button
                            onClick={() => executeShipOrder(o, scannedTracking)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs"
                          >
                            <span>Ship</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedOrder(o)}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                              isCurrent
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {isCurrent ? 'Selected' : 'Select'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Scans History */}
          {recentShippedList.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Recent Scanned Dispatches:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {recentShippedList.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-medium"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <strong>{item.customer}</strong>
                    <span className="font-mono text-slate-400">({item.tracking})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            💡 Supports both device camera and USB/Bluetooth handheld barcode scanner guns.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-black dark:text-white transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
