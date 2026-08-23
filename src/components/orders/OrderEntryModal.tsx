import React, { useState, useEffect, useRef } from 'react';
import type { Order, CourierName, PaymentType, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import { Save, RefreshCw, Eye, Download, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import { DataService } from '../../services/dataService';
import { indiaStatesAndDistricts } from '../../constants/indiaStates';
import { Scanner } from '../warehouse/Scanner';

interface OrderEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Order) => Promise<void>;
  settings: CompanySettings;
}

export const OrderEntryModal: React.FC<OrderEntryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  settings
}) => {
  const generateNewOrderId = () => `ZYL-${Math.floor(100000 + Math.random() * 900000)}`;

  const [orderId, setOrderId] = useState(generateNewOrderId());
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');

  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [weightKg, setWeightKg] = useState(0.5);

  const [courier, setCourier] = useState<CourierName>('India Post');
  const [paymentType, setPaymentType] = useState<PaymentType>('COD');
  const [codAmount, setCodAmount] = useState<number | ''>('');
  const [warrantyType, setWarrantyType] = useState<string>('0');
  const [customWarrantyDays, setCustomWarrantyDays] = useState<number | ''>('');

  // Scanner workflow state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);

  const [inventory, setInventory] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset all form fields for a fresh order every time the modal opens
      setOrderId(generateNewOrderId());
      setCustomerName('');
      setPhone('');
      setAddressLine('');
      setLandmark('');
      setCity('');
      setDistrict('');
      setState('');
      setPinCode('');
      setProductName('');
      setSku('');
      setQuantity(1);
      setWeightKg(0.5);
      setCourier('India Post');
      setPaymentType('COD');
      setCodAmount('');
      setWarrantyType('0');
      setCustomWarrantyDays('');
      setIsScannerOpen(false);
      setPendingOrder(null);
      DataService.getStockSummary().then(setInventory).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Construct draft order for real-time live label preview
  const draftOrder: Order = {
    id: orderId || 'ZYL-PREVIEW',
    customer: {
      name: customerName,
      phone: phone,
      addressLine: addressLine,
      landmark: landmark,
      city: city,
      district: district,
      state: state,
      pinCode: pinCode
    },
    item: {
      productName: productName || 'Select a product...',
      sku: sku || '---',
      quantity: quantity || 1,
      weightKg: weightKg || 0.5
    },
    courier,
    paymentType,
    codAmount: paymentType === 'COD' ? (codAmount === '' ? 0 : codAmount) : 0,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    date: new Date().toISOString(),
    ...(() => {
      const days = warrantyType === 'custom' ? Number(customWarrantyDays) : parseInt(warrantyType);
      if (days > 0) {
        return {
          warrantyStart: new Date().toISOString(),
          warrantyEnd: new Date(new Date().setDate(new Date().getDate() + days)).toISOString()
        };
      }
      return {};
    })()
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone || !addressLine || !city || !pinCode) {
      alert('Please fill in required fields: Customer Name, Phone, Address, City, PIN Code');
      return;
    }

    // Create draft order for scanning workflow
    const draftOrder: Order = {
      id: orderId || 'ZYL-PREVIEW',
      customer: {
        name: customerName,
        phone: phone,
        addressLine: addressLine,
        landmark: landmark,
        city: city,
        district: district,
        state: state,
        pinCode: pinCode
      },
      item: {
        productName: productName || 'Select a product...',
        sku: sku || '---',
        quantity: quantity || 1,
        weightKg: weightKg || 0.5
      },
      courier,
      paymentType,
      codAmount: paymentType === 'COD' ? (codAmount === '' ? 0 : codAmount) : 0,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      ...(() => {
        const days = warrantyType === 'custom' ? Number(customWarrantyDays) : parseInt(warrantyType);
        if (days > 0) {
          return {
            warrantyStart: new Date().toISOString(),
            warrantyEnd: new Date(new Date().setDate(new Date().getDate() + days)).toISOString()
          };
        }
        return {};
      })()
    };

    // Set as pending order and open scanner
    setPendingOrder(draftOrder);
    setIsScannerOpen(true);
  };

  const handleDownload = async () => {
    if (!labelRef.current) return;
    try {
      const canvas = await html2canvas(labelRef.current, { scale: 3, useCORS: true });
      const link = document.createElement('a');
      link.download = `label-${draftOrder.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to download label:', err);
    }
  };

  // Scanner workflow handlers
  const handleScanComplete = (_orderId: string, _productId: string, _cartonId: string) => {
    // We already have the pendingOrder from the state, and the scanner has reserved the product.
    // Now we just need to save the order and close the modal and scanner.
    if (pendingOrder) {
      setIsSaving(true);
      
      const orderToSave = {
        ...pendingOrder,
        productId: _productId,
        cartonId: _cartonId
      };

      onSave(orderToSave)
        .then(() => {
          setIsSaving(false);
          onClose();
          // Reset scanner state
          setIsScannerOpen(false);
          setPendingOrder(null);
        })
        .catch((error) => {
          setIsSaving(false);
          alert('Failed to save order: ' + error.message);
        });
    }
  };

  const handleScanCancel = () => {
    setIsScannerOpen(false);
    setPendingOrder(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div>
            <h3 className="text-lg font-black text-black dark:text-white">Create New Order & Shipping Label</h3>
            <p className="text-xs text-black dark:text-white">Enter order details for instant 4×6 thermal label generation</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-black dark:text-white hover:text-black dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Split view (Form Left, Live Preview Right) */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
            {/* Order & Courier Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Order ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-emerald-400 text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setOrderId(generateNewOrderId())}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-emerald-400"
                    title="Generate Random Order ID"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Courier Partner
                </label>
                <select
                  value={courier}
                  onChange={(e) => setCourier(e.target.value as CourierName)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-semibold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="India Post">India Post</option>
                  <option value="Delhivery">Delhivery</option>
                  <option value="DTDC">DTDC</option>
                  <option value="Shiprocket">Shiprocket</option>
                  <option value="NimbusPost">NimbusPost</option>
                  <option value="Bluedart">Bluedart</option>
                  <option value="Ekart">Ekart</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Customer Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Address Lines */}
            <div>
              <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                Ship To Address *
              </label>
              <textarea
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="House / Flat No, Street, Colony..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-sm focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Landmark
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Near Metro Station"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  City *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Gurugram"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  PIN Code *
                </label>
                <input
                  type="text"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder="122001"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-emerald-400 font-mono font-bold text-xs focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  State
                </label>
                <select
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setDistrict('');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select State</option>
                  {Object.keys(indiaStatesAndDistricts).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  District
                </label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  disabled={!state}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="">Select District</option>
                  {state && indiaStatesAndDistricts[state]?.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product Details */}
            <div className="grid grid-cols-3 gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Product Name
                </label>
                <select
                  value={productName}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    setProductName(selectedName);
                    const item = inventory.find(i => i.product_name === selectedName);
                    if (item && item.sku) {
                      setSku(item.sku);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select Product</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.product_name}>{item.product_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  SKU
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="ZYL-TSH-BLK"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Quantity, Weight, Payment */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0.1}
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0.5)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-black dark:text-white uppercase tracking-wider block mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-black dark:text-white font-bold text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="COD">COD</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </div>

              {paymentType === 'COD' && (
                <div>
                  <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                    COD Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-amber-500/50 rounded-lg text-amber-400 font-mono font-bold text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-blue-500 uppercase tracking-wider block mb-1">
                  Warranty
                </label>
                <div className="flex gap-2">
                  <select
                    value={warrantyType}
                    onChange={(e) => setWarrantyType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-blue-500/50 rounded-lg text-blue-500 font-bold text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="0">None</option>
                    <option value="3">3 Days</option>
                    <option value="30">1 Month</option>
                    <option value="180">6 Months</option>
                    <option value="365">1 Year</option>
                    <option value="custom">Custom (Days)</option>
                  </select>
                  {warrantyType === 'custom' && (
                    <input
                      type="number"
                      min={1}
                      placeholder="Days"
                      value={customWarrantyDays}
                      onChange={(e) => setCustomWarrantyDays(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-blue-500/50 rounded-lg text-blue-500 font-bold text-xs focus:outline-none focus:border-blue-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Form Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-black dark:text-white font-bold text-xs hover:bg-slate-200 dark:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save & Generate Label'}</span>
              </button>
            </div>
          </form>

          {/* Right Live Preview */}
          <div className="lg:col-span-5 flex flex-col items-center justify-start p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-black dark:text-white">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>Real-time 4×6 Thermal Preview</span>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-black dark:text-white rounded-lg text-xs font-bold transition flex items-center gap-2 border border-slate-300 dark:border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>

            <div className="transform scale-[0.7] origin-top border-4 border-slate-200 dark:border-slate-800 shadow-2xl rounded-lg overflow-hidden mt-4">
              <ThermalLabel order={draftOrder} settings={settings} scale={1} innerRef={labelRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Scanner Modal */}
      {isScannerOpen && (
        <Scanner
          isOpen={isScannerOpen}
          onClose={handleScanCancel}
          onConfirm={handleScanComplete}
          order={pendingOrder!}
        />
      )}
    </div>
  );
};
