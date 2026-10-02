import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Truck, MessageCircle, CheckCircle2, QrCode, Camera, Upload } from 'lucide-react';
import type { Order } from '../../types';
import { parseTrackingCode } from '../../utils/trackingParser';
import { playScanSuccessSound } from '../../utils/audioFeedback';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

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

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle successful barcode / QR detection
  const handleSuccessfulDetection = useCallback((rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    // Check if user accidentally scanned the Order's own parcel label QR code
    if (order && (trimmed.includes(order.id) || (trimmed.startsWith('{') && trimmed.includes('id')))) {
      setCameraError(`You scanned the parcel Order ID (${order.id}). Please point at the India Post tracking sticker!`);
      return;
    }

    const code = parseTrackingCode(trimmed);
    if (!code) {
      setCameraError(`Could not extract tracking number from: ${trimmed.slice(0, 20)}`);
      return;
    }

    // 1. Play loud POS scanner beep + vibration
    playScanSuccessSound();

    // 2. Shut off camera
    stopCamera();
    setIsScanning(false);

    // 3. Set visual success confirmation state
    setTrackingNumber(code);
    setScanSuccessFeedback({ code });

    // 4. Give the user clear visual feedback (850ms) then auto-submit & mark Shipped
    setTimeout(() => {
      onSubmit(code, null);
    }, 850);
  }, [order, onSubmit]);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
  };

  // Video scanner effect using Html5Qrcode
  useEffect(() => {
    if (!isOpen || !isScanning) {
      stopCamera();
      return;
    }

    let isMounted = true;

    const startScanner = async () => {
      try {
        setCameraError(null);
        // Wait for DOM node to mount
        await new Promise(r => setTimeout(r, 120));
        if (!isMounted) return;

        const readerElem = document.getElementById('tracking-modal-qr-reader');
        if (!readerElem) return;

        const scanner = new Html5Qrcode('tracking-modal-qr-reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: (w, h) => ({
              width: Math.min(Math.floor(w * 0.9), 360),
              height: Math.min(Math.floor(h * 0.7), 240)
            }),
            aspectRatio: 1.777778
          },
          (decodedText) => {
            if (isMounted) {
              handleSuccessfulDetection(decodedText);
            }
          },
          () => {
            // Normal scan frame miss - ignore
          }
        );
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Camera scanner start error:', msg);
          setCameraError('Camera unavailable. You can enter tracking ID manually or snap a photo.');
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen, isScanning, handleSuccessfulDetection]);

  // Handle image / photo file upload scan
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCameraError(null);
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode('tracking-modal-file-reader-hidden', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
      }
      const decodedText = await scanner.scanFile(file, true);
      handleSuccessfulDetection(decodedText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('File scan error:', msg);
      setCameraError('Could not detect barcode/QR code in the photo. Please ensure clear focus and lighting.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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

        {/* Hidden element for file scanning */}
        <div id="tracking-modal-file-reader-hidden" className="hidden" />

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

          {/* Camera Scanner View (Toggleable) */}
          {isScanning ? (
            <div className="space-y-2">
              <div className="relative rounded-2xl bg-black overflow-hidden border border-blue-500/40 min-h-[200px] flex items-center justify-center">
                <div id="tracking-modal-qr-reader" className="w-full h-full" />
                <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-black/80 hover:bg-black text-white text-[11px] font-bold rounded-lg transition border border-white/20 flex items-center gap-1 backdrop-blur-sm"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Snap / Upload</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScanning(false)}
                    className="px-2.5 py-1 bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition"
                  >
                    Close
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-center text-slate-400 font-medium">
                Aim at India Post barcode or QR code · Auto-marks as Shipped upon scan
              </p>
            </div>
          ) : cameraError ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between">
              <span>{cameraError}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs shrink-0 ml-2"
              >
                Snap Photo
              </button>
            </div>
          ) : null}

          {/* Hidden File Input for high-res photo scan */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileScan}
          />

          {/* Tracking Number Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-black dark:text-white uppercase tracking-wider">
                India Post Tracking Number
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                  title="Snap a photo of the tracking label"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Snap Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScanning(!isScanning)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    isScanning
                      ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Live Scan</span>
                    </>
                  )}
                </button>
              </div>
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
