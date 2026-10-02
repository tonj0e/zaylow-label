import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Truck, MessageCircle, CheckCircle2, QrCode, Camera } from 'lucide-react';
import type { Order } from '../../types';
import { parseTrackingCode } from '../../utils/trackingParser';
import { playScanSuccessSound } from '../../utils/audioFeedback';

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
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSuccessFeedback, setScanSuccessFeedback] = useState<{ code: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTrackingNumber(order?.trackingNumber || '');
      setCopied(false);
      setSent(false);
      setIsScanning(false);
      setCameraError(null);
      setScanSuccessFeedback(null);
    }
  }, [isOpen, order]);

  // Video scanner effect when isScanning is active
  useEffect(() => {
    if (!isOpen || !isScanning) return;

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

        const ctrl = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          videoRef.current,
          (result) => {
            if (result && isMounted) {
              const code = parseTrackingCode(result.getText());
              if (code) {
                // 1. Play loud POS scanner beep + vibration
                playScanSuccessSound();
                // 2. Shut off camera immediately
                if (controls) {
                  controls.stop();
                  controls = null;
                }
                setIsScanning(false);
                // 3. Set visual success confirmation state
                setTrackingNumber(code);
                setScanSuccessFeedback({ code });

                // 4. Give the user clear visual feedback (850ms) then auto-submit & mark Shipped
                setTimeout(() => {
                  if (isMounted) {
                    onSubmit(code, null);
                  }
                }, 850);
              }
            }
          }
        );
        controls = ctrl;
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Camera error:', msg);
          setCameraError('Camera unavailable. You can enter the tracking number manually below.');
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (controls) controls.stop();
    };
  }, [isOpen, isScanning, onSubmit]);

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

        <div className="p-5 space-y-4">

          {/* Scan Success Banner */}
          {scanSuccessFeedback && (
            <div className="rounded-2xl bg-emerald-500/10 border-2 border-emerald-500 p-5 flex flex-col items-center justify-center text-center space-y-2 animate-in zoom-in-95 duration-200 shadow-lg shadow-emerald-500/10">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg animate-bounce">
                <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                QR / Barcode Scanned Successfully!
              </div>
              <div className="font-mono text-lg font-black bg-slate-900 text-emerald-300 px-3.5 py-1 rounded-lg tracking-wider border border-emerald-500/30">
                {scanSuccessFeedback.code}
              </div>
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Marking order as <span className="text-blue-500 uppercase font-extrabold">Shipped</span>...
              </div>
            </div>
          )}

          {/* Camera Scanner Section (Toggleable) */}
          {isScanning ? (
            <div className="relative rounded-2xl bg-black overflow-hidden aspect-video border border-blue-500/40 flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
                <div className="relative w-48 h-24 border-2 border-emerald-400 rounded-lg shadow-sm">
                  <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 animate-pulse" />
                </div>
              </div>
              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={() => setIsScanning(false)}
                  className="px-2.5 py-1 bg-black/70 hover:bg-black text-white text-[11px] font-bold rounded-lg transition"
                >
                  Close Camera
                </button>
              </div>
              <div className="absolute bottom-2 text-center pointer-events-none">
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-black/70 text-white backdrop-blur-sm">
                  Aim at India Post barcode or QR code
                </span>
              </div>
            </div>
          ) : cameraError ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
              {cameraError}
            </div>
          ) : null}

          {/* Tracking Number Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-black dark:text-white uppercase tracking-wider">
                India Post Tracking Number
              </label>
              <button
                type="button"
                onClick={() => setIsScanning(!isScanning)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  isScanning
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                {isScanning ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Scan</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan Barcode / QR</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="e.g. EE123456789IN"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && trackingNumber.trim()) handleSaveAndSend(); }}
                className={`w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border ${
                  scanSuccessFeedback
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-700'
                } rounded-xl text-black dark:text-white font-mono font-bold text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase pr-10`}
              />
              {trackingNumber.trim() && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
            </div>
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
