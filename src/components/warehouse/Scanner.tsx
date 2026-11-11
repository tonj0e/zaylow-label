import React, { useState, useCallback, useRef } from 'react';
import type { Order } from '../../types';
import { X, Check, AlertTriangle, Loader2, ScanLine, Package, CheckCircle } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { ScannerDisplay } from './ScannerDisplay';

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
  const busy = useRef(false);
  const scannedRef = useRef<ScannedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  const scannedCount = scannedProducts.length;
  const _allProductsScanned = scannedCount >= requiredQty;

  // Handle scanned value (from QR code scanner or manual input)
  const handleScan = useCallback(async (value: string) => {
    if (busy.current || !value) return;
    busy.current = true;
    setIsScanning(true);
    setError(null);

    try {
      if (step === 'carton') {
        // Scan Carton QR Code
        const carton = await DataService.findCarton(value);
        if (!carton) {
          throw new Error(`No carton matches "${value}". Check the number or scan the QR code.`);
        }

        const productCount = await DataService.getProductCountInCarton(carton.id);

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
        const product = await DataService.findProduct(value);
        if (!product) {
          throw new Error(`No product matches "${value}". Check the number or scan the QR code.`);
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
        if (scannedRef.current.some(p => p.id === product.id)) {
          throw new Error(`This product (${product.sku || product.id}) was already scanned. Scan a different unit.`);
        }

        const newProduct: ScannedProduct = {
          id: product.id,
          sku: product.sku,
          productName: product.product_name
        };

        const updated = [...scannedRef.current, newProduct];
        scannedRef.current = updated;
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
      busy.current = false;
      setIsScanning(false);
    }
  }, [step, scannedCartonId, requiredQty]);

  // Handle manual entry
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scannedValue.trim());
    }
  };

  const shake = (v: string) => { setScannedValue(v); if (error) setError(null); };

  // Confirm reservation of all scanned products
  const handleConfirm = async () => {
    if (!scannedCartonId || scannedProducts.length === 0) return;

    setLoading(true);
    try {
      // Reserve all scanned products
      for (const product of scannedProducts) {
        const ok = await DataService.reserveProductForOrder(
          product.id,
          order.id,
          order.customer.name,
          new Date().toISOString()
        );
        if (!ok) {
          // Roll back anything already reserved for this order so stock isn't left stuck.
          await DataService.releaseProductsForOrder(order.id, 'In Stock').catch(() => {});
          throw new Error(`${product.sku || product.id} could not be reserved (already taken or network error). Please re-scan.`);
        }
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
    scannedRef.current = scannedRef.current.filter(p => p.id !== productId);
    setScannedProducts(scannedRef.current);
    if (step === 'confirmation') setStep('product');
  };

  // Go back to carton step
  const handleBackToCarton = () => {
    setStep('carton');
    setScannedCartonId(null);
    setCartonInfo(null);
    scannedRef.current = [];
    setScannedProducts([]);
    setScannedValue('');
  };


  // Early return AFTER all hooks
  if (!isOpen) return null;

  const title = step === 'carton' ? 'Scan the carton' : step === 'product' ? `Scan product ${scannedCount + 1} of ${requiredQty}` : 'Confirm and reserve';
  const hint = step === 'carton' ? 'Scan the QR on the carton box, or type its number.' : step === 'product' ? `${requiredQty - scannedCount} more to scan. Scan the QR or type the product number (SKU).` : 'All units scanned. Check them and confirm.';

  const entry = (kind: 'carton' | 'product') => (
    <>
      <ScannerDisplay label={kind} onScan={handleScan} />
      <div>
        <label htmlFor="scan-entry" className="k-label">Or type the {kind === 'carton' ? 'carton number' : 'product number'}</label>
        <div className="flex gap-2">
          <input
            id="scan-entry"
            type="text"
            value={scannedValue}
            onChange={(e) => shake(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={kind === 'carton' ? 'Carton ID or location' : 'e.g. PM-001'}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            className="k-field font-mono"
          />
          <button
            onClick={() => handleScan(scannedValue.trim())}
            disabled={!scannedValue.trim() || isScanning}
            className="k-btn k-btn-lime px-5 text-sm shrink-0"
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} Find
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="k-card w-full max-w-md my-auto p-6 shadow-2xl space-y-4 k-rise" style={{ ['--i' as string]: 0 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold k-display">{title}</h2>
            <p className="text-sm k-muted mt-0.5">{hint}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-1" aria-hidden="true">
          <div className="h-2 rounded-full w-8 shrink-0 k-track" style={step !== 'carton' ? { background: 'var(--lime)' } : undefined} />
          {Array.from({ length: requiredQty }).map((_, i) => (
            <div key={i} className="h-2 rounded-full flex-1 k-track" style={i < scannedCount ? { background: 'var(--lime)' } : undefined} />
          ))}
        </div>

        <div className="k-card2 rounded-2xl px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between gap-3"><span className="k-muted">Order</span><span className="font-mono font-semibold">{order.id}</span></div>
          <div className="flex justify-between gap-3"><span className="k-muted">Customer</span><span className="font-semibold truncate">{order.customer.name}</span></div>
          <div className="flex justify-between gap-3"><span className="k-muted flex items-center gap-1.5"><Package className="w-3.5 h-3.5 k-lime-text" /> Product</span><span className="font-semibold truncate">{order.item.productName} × {requiredQty}</span></div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl px-4 py-3 text-sm flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 k-bad" />
            <span>{error}</span>
          </div>
        )}

        {step === 'carton' && entry('carton')}

        {step === 'product' && cartonInfo && (
          <>
            <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm k-card2">
              <Check className="w-4 h-4 k-lime-text shrink-0" />
              <span className="k-muted">Carton</span>
              <span className="font-mono font-semibold truncate">{cartonInfo.location || cartonInfo.id}</span>
              <button onClick={handleBackToCarton} className="ml-auto text-xs font-semibold underline">Change</button>
            </div>
            {scannedProducts.length > 0 && (
              <ul className="space-y-1.5">
                {scannedProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm k-card2">
                    <CheckCircle className="w-4 h-4 k-lime-text shrink-0" />
                    <span className="font-medium flex-1 truncate">{p.sku || p.productName}</span>
                    <span className="text-xs k-muted">#{i + 1}</span>
                    <button onClick={() => handleRemoveProduct(p.id)} aria-label={`Remove ${p.sku || p.productName}`} className="k-btn k-btn-soft w-7 h-7"><X className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            {entry('product')}
          </>
        )}

        {step === 'confirmation' && cartonInfo && (
          <>
            <div className="k-card2 rounded-2xl px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between gap-3"><span className="k-muted">Carton</span><span className="font-mono font-semibold">{cartonInfo.location || cartonInfo.id}</span></div>
              <div className="flex justify-between gap-3"><span className="k-muted">Units reserved</span><span className="font-bold">{scannedProducts.length} of {requiredQty}</span></div>
            </div>
            <ul className="space-y-1.5">
              {scannedProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm k-card2">
                  <CheckCircle className="w-4 h-4 k-lime-text shrink-0" />
                  <span className="font-semibold flex-1 truncate">{p.sku || p.productName}</span>
                  <span className="text-xs k-muted">Unit {i + 1}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setStep('product')} className="k-btn k-btn-ghost px-5 py-3 text-sm">Back</button>
              <button onClick={handleConfirm} disabled={loading} className="k-btn k-btn-lime px-6 py-3 text-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm and make label
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
