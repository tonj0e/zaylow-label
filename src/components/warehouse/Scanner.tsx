import React, { useState, useCallback, useEffect } from 'react';
import type { Order } from '../../types';
import { X, Check, AlertTriangle, Loader2, ScanLine, Box, Package, CheckCircle } from 'lucide-react';
import { DataService } from '../../services/dataService';

interface ScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (orderId: string, productId: string, cartonId: string) => void;
  order: Order;
}

interface ScannedProduct {
  id: string;
  sku: string;
  productName: string;
}

export const Scanner: React.FC<ScannerProps> = ({
  isOpen,
  onClose,
  onConfirm,
  order
}) => {
  const requiredQty = order.item.quantity || 1;

  // ALL hooks must be called before any early return (Rules of Hooks)
  const [step, setStep] = useState<'carton' | 'product' | 'confirmation'>('carton');
  const [scannedValue, setScannedValue] = useState('');
  const [scannedCartonId, setScannedCartonId] = useState<string | null>(null);
  const [cartonInfo, setCartonInfo] = useState<{
    id: string;
    location: string | null;
    productCount: number;
  } | null>(null);
  // Tracks all scanned products (supports multi-unit orders)
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  const scannedCount = scannedProducts.length;
  const _allProductsScanned = scannedCount >= requiredQty;

  // Handle scanned value (from QR code scanner or manual input)
  const handleScan = useCallback(async (value: string) => {
    if (isScanning || !value) return;

    setIsScanning(true);
    setError(null);

    try {
      if (step === 'carton') {
        // Scan Carton QR Code
        const carton = await DataService.getCartonById(value);
        if (!carton) {
          throw new Error(`Carton with ID "${value}" not found`);
        }

        const productCount = await DataService.getProductCountInCarton(value);

        setScannedCartonId(carton.id);
        setCartonInfo({
          id: carton.id,
          location: carton.location || null,
          productCount
        });
        setStep('product');
        setScannedValue('');

      } else if (step === 'product') {
        // Scan Product QR Code
        const product = await DataService.getProductById(value);
        if (!product) {
          throw new Error(`Product "${value}" not found. Check the QR code and try again.`);
        }

        // Verify product is in the scanned carton
        if (product.carton_id !== scannedCartonId) {
          throw new Error(
            product.carton_id
              ? `This product belongs to a different carton. Please scan a product from the correct carton.`
              : `This product is not assigned to any carton.`
          );
        }

        // Verify product is available (In Stock)
        if (product.status !== 'In Stock') {
          throw new Error(`Product "${product.product_name}" is not available (status: ${product.status})`);
        }

        // Check not already scanned in this session
        if (scannedProducts.some(p => p.id === product.id)) {
          throw new Error(`This product (${product.sku || product.id}) was already scanned. Scan a different unit.`);
        }

        const newProduct: ScannedProduct = {
          id: product.id,
          sku: product.sku,
          productName: product.product_name
        };

        const updated = [...scannedProducts, newProduct];
        setScannedProducts(updated);
        setScannedValue('');

        // If all required products have been scanned, move to confirmation
        if (updated.length >= requiredQty) {
          setStep('confirmation');
        }
        // Otherwise stay on 'product' step for next scan
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during scanning');
    } finally {
      setIsScanning(false);
    }
  }, [step, scannedCartonId, isScanning, scannedProducts, requiredQty]);

  // Handle manual entry
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(scannedValue.trim());
    }
  };

  // Confirm reservation of all scanned products
  const handleConfirm = async () => {
    if (!scannedCartonId || scannedProducts.length === 0) return;

    setLoading(true);
    try {
      // Reserve all scanned products
      for (const product of scannedProducts) {
        await DataService.reserveProductForOrder(
          product.id,
          order.id,
          order.customer.name,
          new Date().toISOString()
        );
      }

      // Use human-readable names for the label
      const displayProductId = scannedProducts.map(p => p.sku || p.id).join(', ');
      const displayCartonId = cartonInfo?.location || scannedCartonId;

      onConfirm(order.id, displayProductId, displayCartonId);
    } catch (err: any) {
      setError(`Failed to reserve products: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Remove a scanned product (undo)
  const handleRemoveProduct = (productId: string) => {
    setScannedProducts(prev => prev.filter(p => p.id !== productId));
    if (step === 'confirmation') setStep('product');
  };

  // Go back to carton step
  const handleBackToCarton = () => {
    setStep('carton');
    setScannedCartonId(null);
    setCartonInfo(null);
    setScannedProducts([]);
    setScannedValue('');
  };

  // Actual QR code scanner using @zxing/browser
  const ScannerDisplay = ({ label, onScan }: { label: string, onScan: (text: string) => void }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    useEffect(() => {
      let controls: any = null;
      let mounted = true;

      const startScanner = async () => {
        try {
          const { BrowserQRCodeReader } = await import('@zxing/browser');
          const codeReader = new BrowserQRCodeReader();

          if (!videoRef.current || !mounted) return;

          const constraints = { video: { facingMode: 'environment' } };

          await codeReader.decodeFromConstraints(constraints, videoRef.current, (result, error, ctrl) => {
            if (!controls && ctrl) {
              controls = ctrl;
            }
            if (result && mounted) {
              onScan(result.getText());
            }
          });
        } catch (err: any) {
          if (mounted) {
            console.error('Camera error:', err);
            setCameraError('Camera access denied or not available. Please enter the ID manually.');
          }
        }
      };

      startScanner();

      return () => {
        mounted = false;
        if (controls) {
          controls.stop();
        }
      };
    }, [onScan]);

    if (cameraError) {
      return (
        <div className="relative w-full rounded-2xl border-2 border-dashed border-red-500/40 bg-slate-50 dark:bg-slate-950/60 flex flex-col items-center justify-center py-8 mb-4 overflow-hidden">
          <AlertTriangle className="w-10 h-10 mb-2 text-red-400" />
          <p className="text-sm text-red-400 text-center px-4">{cameraError}</p>
        </div>
      );
    }

    return (
      <div className="relative w-full rounded-2xl border-2 border-emerald-500/40 bg-slate-50 dark:bg-slate-950 overflow-hidden mb-4 aspect-video flex items-center justify-center">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <div className="absolute inset-0 z-10 pointer-events-none">
          <div className="w-full h-full border-[40px] border-slate-950/50" />
        </div>
        <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-emerald-400 z-20" />
        <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-emerald-400 z-20" />
        <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-emerald-400 z-20" />
        <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-emerald-400 z-20" />
        <div className="absolute bottom-2 left-0 right-0 z-20 text-center">
          <p className="text-xs text-black dark:text-white bg-white dark:bg-slate-900/80 inline-block px-3 py-1 rounded-full backdrop-blur-sm">
            Point camera at <span className="text-emerald-400 font-bold">{label}</span> QR code
          </p>
        </div>
      </div>
    );
  };

  // Early return AFTER all hooks
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-black dark:text-white">
              {step === 'carton' ? 'Step 1: Scan Carton' :
               step === 'product' ? `Step 2: Scan Product ${scannedCount + 1} of ${requiredQty}` :
               '✓ Confirm & Reserve'}
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {step === 'carton' ? 'Scan the carton box QR code first' :
               step === 'product' ? `${requiredQty - scannedCount} more product${requiredQty - scannedCount !== 1 ? 's' : ''} to scan` :
               'All products scanned — review and confirm'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar — splits into segments for each required product */}
        <div className="flex items-center gap-1">
          {/* Carton step */}
          <div className={`h-2 rounded-full flex-shrink-0 w-8 ${step !== 'carton' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
          {/* One segment per required product */}
          {Array.from({ length: requiredQty }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full flex-1 transition-all ${
                i < scannedCount ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Quantity badge */}
        <div className="flex items-center gap-3 text-sm text-black dark:text-white">
          <div className="flex justify-between w-full px-1">
            <span>Order: <span className="font-mono text-emerald-400">{order.id}</span></span>
            <span>Customer: <span className="font-medium text-black dark:text-white">{order.customer.name}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-sm">
          <Package className="w-4 h-4 text-orange-400" />
          <span className="text-black dark:text-white">Product:</span>
          <span className="text-black dark:text-white font-medium">{order.item.productName}</span>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-black">
            Qty: {requiredQty}
          </span>
        </div>

        {/* ── CARTON STEP ── */}
        {step === 'carton' && (
          <>
            <ScannerDisplay label="carton" onScan={handleScan} />
            <div className="space-y-3">
              <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider block">
                <Box className="w-3 h-3 inline mr-1" />
                Carton ID (or scan QR)
              </label>
              <input
                type="text"
                value={scannedValue}
                onChange={(e) => setScannedValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scan or enter carton ID..."
                autoFocus
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
              <button
                onClick={() => handleScan(scannedValue.trim())}
                disabled={!scannedValue.trim() || isScanning}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isScanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Verifying...</span></>
                ) : (
                  <><ScanLine className="w-4 h-4" /><span>Confirm Carton</span></>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── PRODUCT STEP ── */}
        {step === 'product' && cartonInfo && (
          <>
            {/* Carton confirmed banner */}
            <div className="flex items-center gap-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="text-xs">
                <span className="text-black dark:text-white">Carton: </span>
                <span className="font-mono text-emerald-400 font-bold">{cartonInfo.location || cartonInfo.id}</span>
              </div>
              <button onClick={handleBackToCarton} className="ml-auto text-xs text-slate-400 dark:text-slate-500 hover:text-black dark:text-white">change</button>
            </div>

            {/* Already scanned products */}
            {scannedProducts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-slateald-400 uppercase tracking-wider text-black dark:text-white">Scanned so far:</p>
                {scannedProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-black dark:text-white font-medium flex-1">{p.sku || p.productName}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">#{i + 1}</span>
                    <button onClick={() => handleRemoveProduct(p.id)} className="text-red-400 hover:text-red-300 text-xs ml-1">✕</button>
                  </div>
                ))}
              </div>
            )}

            <ScannerDisplay label="product" onScan={handleScan} />
            <div className="space-y-3">
              <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider block">
                <Package className="w-3 h-3 inline mr-1" />
                Product {scannedCount + 1} of {requiredQty} — scan QR or enter ID
              </label>
              <input
                type="text"
                value={scannedValue}
                onChange={(e) => setScannedValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scan or enter product ID..."
                autoFocus
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-black dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
              <button
                onClick={() => handleScan(scannedValue.trim())}
                disabled={!scannedValue.trim() || isScanning}
                className="w-full px-3 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isScanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Verifying Product...</span></>
                ) : (
                  <><ScanLine className="w-4 h-4" /><span>Confirm Product {scannedCount + 1}</span></>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── CONFIRMATION STEP ── */}
        {step === 'confirmation' && cartonInfo && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg">
                <span className="text-sm font-semibold text-black dark:text-white">Carton</span>
                <span className="font-mono text-emerald-400">{cartonInfo.location || cartonInfo.id}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg">
                <span className="text-sm font-semibold text-black dark:text-white">Customer</span>
                <span className="text-black dark:text-white">{order.customer.name}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-950 rounded-lg">
                <span className="text-sm font-semibold text-black dark:text-white">Products Reserved</span>
                <span className="font-black text-emerald-400">{scannedProducts.length} / {requiredQty}</span>
              </div>

              {/* List all scanned products */}
              <div className="space-y-1 pt-1">
                {scannedProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-black dark:text-white truncate">{p.sku || p.productName}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{p.id.slice(0, 20)}...</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">Unit {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => { setStep('product'); }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white font-bold text-xs hover:bg-slate-200 dark:bg-slate-700 transition"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Confirming...</span></>
                ) : (
                  <><Check className="w-4 h-4" /><span>Confirm & Generate Label</span></>
                )}
              </button>
            </div>
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
            <span className="text-red-300">{error}</span>
          </div>
        )}

        {/* Instructions */}
        {step !== 'confirmation' && (
          <div className="text-xs text-slate-400 dark:text-slate-500 text-center italic">
            Scan the QR code on the {step === 'carton' ? 'carton box' : 'product unit'} or manually enter the ID above
          </div>
        )}
      </div>
    </div>
  );
};