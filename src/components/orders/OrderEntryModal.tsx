import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, CourierName, PaymentType, CompanySettings } from '../../types';
import { ThermalLabel } from '../label/ThermalLabel';
import { AlertCircle, Download, Loader2, RefreshCw, Save, X } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { indiaStatesAndDistricts } from '../../constants/indiaStates';
import { parseAddress, districtFromPin } from '../../utils/parseAddress';
import { Scanner } from '../warehouse/Scanner';
import { useCached } from '../../hooks/useCached';
import { CACHE } from '../../services/prefetch';
import { priceKey, type PriceMap } from '../../services/priceService';

interface OrderEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Order) => Promise<void>;
  settings: CompanySettings;
}

interface StockRow { id: string; product_name: string; sku?: string; available?: number }

const COURIERS: CourierName[] = ['India Post', 'Delhivery', 'DTDC', 'Shiprocket', 'NimbusPost', 'Bluedart', 'Ekart', 'Custom'];
const WARRANTY = [
  { value: '0', label: 'None' },
  { value: '3', label: '3 days' },
  { value: '30', label: '1 month' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
  { value: 'custom', label: 'Other' },
];

const digits = (s: string) => s.replace(/\D/g, '');
const generateNewOrderId = () => `ZYL-${Math.floor(100000 + Math.random() * 900000)}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const Field: React.FC<{ id: string; label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }> = ({ id, label, error, hint, className, children }) => (
  <div className={className}>
    <label htmlFor={id} className="k-label">{label}</label>
    {children}
    {error ? <p role="alert" className="text-xs font-medium mt-1.5 flex items-center gap-1 k-bad"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p> : hint ? <p className="text-xs k-muted mt-1.5">{hint}</p> : null}
  </div>
);

const Choice: React.FC<{ options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; label: string }> = ({ options, value, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="k-chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
  </div>
);

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="k-card2 rounded-[24px] p-5 space-y-4">
    <div><h4 className="font-bold k-display">{title}</h4>{note && <p className="text-xs k-muted mt-0.5">{note}</p>}</div>
    {children}
  </section>
);

export const OrderEntryModal: React.FC<OrderEntryModalProps> = ({ isOpen, onClose, onSave, settings }) => {
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
  const [quantity, setQuantity] = useState('1');
  const [weightKg, setWeightKg] = useState('0.5');

  const [courier, setCourier] = useState<CourierName>('India Post');
  const [paymentType, setPaymentType] = useState<PaymentType>('COD');
  const [codAmount, setCodAmount] = useState('');
  const [advancePaid, setAdvancePaid] = useState('100');
  const [paidTouched, setPaidTouched] = useState(false);
  const pricesC = useCached<{ prices: PriceMap; shared: boolean }>(CACHE.prices.key, CACHE.prices.fetch);
  const [warrantyType, setWarrantyType] = useState('0');
  const [customWarrantyDays, setCustomWarrantyDays] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState<{ ok: string[]; check: string[] } | null>(null);
  const [districtHints, setDistrictHints] = useState<{ name: string; why: string }[]>([]);
  const pasteTicket = useRef(0);

  // One paste fills the customer and address boxes. Everything stays editable.
  const fillFromText = async (text: string) => {
    const ticket = ++pasteTicket.current;
    const r = parseAddress(text);
    if (!text.trim()) { setPasteNote(null); return; }
    // a new paste replaces the whole customer block, so nothing from an earlier customer is left behind
    setCustomerName(r.name); setPhone(r.phone); setAddressLine(r.addressLine); setLandmark(r.landmark);
    setCity(r.city); setPinCode(r.pinCode); setState(r.state); setDistrict(r.district);
    setErrors((p) => ({ ...p, customerName: '', phone: '', addressLine: '', city: '', pinCode: '' }));
    // the district is never chosen for you: the boxes below only get it when the message says "District: ...".
    // Otherwise the district the message names and the one the PIN points to are offered as buttons.
    setDistrictHints([]);
    if (!r.district) {
      const hints = r.districtHints.map((name) => ({ name, why: 'in the message' }));
      if (r.state && r.pinCode.length === 6) {
        const fromPin = await districtFromPin(r.pinCode, r.state);
        if (ticket !== pasteTicket.current) return; // a newer paste, or a new order, came in meanwhile
        if (fromPin && !hints.some((h) => h.name === fromPin)) hints.push({ name: fromPin, why: 'a guess from the PIN code' });
        else if (fromPin) hints.forEach((h) => { if (h.name === fromPin) h.why = 'in the message, and the PIN code agrees'; });
      }
      setDistrictHints(hints);
    }
    const got: [string, string][] = [['Name', r.name], ['Phone', r.phone && r.phone.length === 10 ? r.phone : ''], ['Address', r.addressLine], ['PIN code', r.pinCode.length === 6 ? r.pinCode : ''], ['State', r.state]];
    setPasteNote({ ok: got.filter(([, v]) => v).map(([k]) => k), check: [...got.filter(([, v]) => !v).map(([k]) => k), ...(r.district ? [] : ['District (choose it)'])] });
  };
  const [saveError, setSaveError] = useState('');

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [inventory, setInventory] = useState<StockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLabel, setShowLabel] = useState(false);

  const labelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // a fresh order every time the form opens
    setOrderId(generateNewOrderId());
    setCustomerName(''); setPhone(''); setAddressLine(''); setLandmark(''); setCity(''); setDistrict(''); setState(''); setPinCode('');
    setProductName(''); setSku(''); setQuantity('1'); setWeightKg('0.5');
    setCourier(settings.defaultCourier || 'India Post'); setPaymentType(settings.defaultPaymentType || 'COD');
    setCodAmount(''); setAdvancePaid('100'); setPaidTouched(false); setWarrantyType('0'); setCustomWarrantyDays('');
    setErrors({}); setSaveError(''); setIsScannerOpen(false); setPendingOrder(null);
    // the paste box and its notes start empty too, and a late answer for the old order is ignored
    pasteTicket.current += 1; setPasteText(''); setPasteNote(null); setDistrictHints([]);
    setStockLoading(true);
    DataService.getStockSummary().then((rows) => setInventory(rows as StockRow[])).catch(console.error).finally(() => setStockLoading(false));
    setTimeout(() => { if (window.matchMedia('(min-width: 768px)').matches) nameRef.current?.focus(); }, 50);
  }, [isOpen, settings.defaultCourier, settings.defaultPaymentType]);

  const qty = Math.max(parseInt(quantity, 10) || 1, 1);
  const cod = paymentType === 'COD' ? parseInt(codAmount, 10) || 0 : 0;
  const advance = Math.max(parseInt(advancePaid, 10) || 0, 0);
  const warrantyDays = warrantyType === 'custom' ? parseInt(customWarrantyDays, 10) || 0 : parseInt(warrantyType, 10);
  const unitPrice = pricesC.data?.prices[priceKey(productName)] ?? 0;
  const selectedStock = inventory.find((i) => i.product_name === productName);
  const available = selectedStock?.available ?? null;

  // Prepaid: fill the amount from the product's prepaid price (price x quantity) until you type your own amount.
  useEffect(() => {
    if (paidTouched) return;
    if (paymentType === 'Prepaid') setAdvancePaid(unitPrice > 0 ? String(unitPrice * qty) : '');
    else setAdvancePaid('100');
  }, [paymentType, unitPrice, qty, paidTouched]);

  const draftOrder: Order = useMemo(() => ({
    id: orderId || 'ZYL-PREVIEW',
    customer: { name: customerName, phone, addressLine, landmark, city, district, state, pinCode },
    item: { productName: productName || '[PRODUCT NAME REQUIRED]', sku: sku || '---', quantity: qty, weightKg: parseFloat(weightKg) || 0.5 },
    courier,
    paymentType,
    codAmount: cod,
    advancePaid: advance,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    date: new Date().toISOString(),
    ...(warrantyDays > 0 ? { warrantyStart: new Date().toISOString(), warrantyEnd: new Date(Date.now() + warrantyDays * 86400000).toISOString() } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [orderId, customerName, phone, addressLine, landmark, city, district, state, pinCode, productName, sku, qty, weightKg, courier, paymentType, cod, advance, warrantyDays]);

  if (!isOpen) return null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerName.trim()) e.customerName = 'Enter the customer name.';
    const ph = digits(phone);
    if (ph.length < 10 || ph.length > 12) e.phone = 'Enter a 10 digit phone number.';
    if (!addressLine.trim()) e.addressLine = 'Enter the delivery address.';
    if (!city.trim()) e.city = 'Enter the city.';
    if (!/^\d{6}$/.test(pinCode.trim())) e.pinCode = 'A PIN code has 6 digits.';
    if (!productName.trim()) e.productName = 'Choose a product.';
    else if (available !== null && available <= 0) e.productName = 'This product is out of stock. Add units in Cartons first.';
    if (available !== null && available > 0 && qty > available) e.quantity = `Only ${available} in stock.`;
    if (paymentType === 'COD' && codAmount !== '' && cod < 0) e.codAmount = 'Amount cannot be negative.';
    if (paymentType === 'Prepaid' && advance <= 0) e.advance = unitPrice > 0 ? 'Enter the amount the customer paid.' : 'No prepaid price is set for this product. Type the amount paid, or set the price in Products.';
    if (warrantyType === 'custom' && warrantyDays <= 0) e.warranty = 'Enter the number of days.';
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found); setSaveError('');
    const first = Object.keys(found)[0];
    if (first) {
      const ids: Record<string, string> = { customerName: 'oe-name', phone: 'oe-phone', addressLine: 'oe-address', city: 'oe-city', pinCode: 'oe-pin', productName: 'oe-product', quantity: 'oe-qty', codAmount: 'oe-cod', advance: 'oe-advance', warranty: 'oe-wdays' };
      const el = document.getElementById(ids[first]);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement | null)?.focus();
      return;
    }
    // scan the carton and each unit next: the order is saved once the units are reserved
    setPendingOrder({ ...draftOrder, item: { ...draftOrder.item, productName: productName.trim() } });
    setIsScannerOpen(true);
  };

  const handleDownload = async () => {
    if (!productName.trim()) { setErrors((p) => ({ ...p, productName: 'Choose a product before downloading the label.' })); document.getElementById('oe-product')?.focus(); return; }
    if (!labelRef.current) return;
    try {
      const { captureCanvas } = await import('../../utils/captureImage');
      const canvas = await captureCanvas(labelRef.current, 3);
      const link = document.createElement('a');
      link.download = `label-${draftOrder.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to download label:', err);
      setSaveError('Could not download the label. Try again.');
    }
  };

  const handleScanComplete = (_orderId: string, productId: string, cartonId: string) => {
    if (!pendingOrder) return;
    setIsSaving(true);
    const orderToSave = { ...pendingOrder, productId, cartonId };
    onSave(orderToSave)
      .then(() => { setIsSaving(false); onClose(); setIsScannerOpen(false); setPendingOrder(null); })
      .catch(async (error: unknown) => {
        setIsSaving(false);
        // give the reserved units back if the order could not be saved
        await DataService.releaseProductsForOrder(orderToSave.id, 'In Stock').catch(() => {});
        setIsScannerOpen(false); setPendingOrder(null);
        setSaveError(`The order was not saved. ${(error as Error)?.message || 'Try again.'} The units you scanned are back in stock.`);
      });
  };

  const handleScanCancel = () => {
    const id = pendingOrder?.id;
    setIsScannerOpen(false); setPendingOrder(null); // close at once; give units back in the background
    if (id) void DataService.releaseProductsForOrder(id, 'In Stock').catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:p-6 sm:overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label="New order" onKeyDown={(e) => { if (e.key === 'Escape' && !isScannerOpen) onClose(); }}>
      <div className="k-card w-full max-w-6xl sm:my-auto shadow-2xl flex flex-col k-rise max-sm:h-[100dvh] max-sm:rounded-none max-sm:!border-0" style={{ ['--i' as string]: 0 }}>
        <div className="px-4 py-3 sm:px-6 sm:py-5 flex items-start justify-between gap-4 border-b k-rule shrink-0">
          <div>
            <h3 className="text-2xl font-bold k-display">New order</h3>
            <p className="text-sm k-muted mt-0.5 max-sm:hidden">Fill in the order and the label updates beside it. You scan the units next.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-4 sm:gap-6 max-sm:flex-1 max-sm:min-h-0 max-sm:overflow-y-auto max-sm:content-start">
          <form id="order-form" onSubmit={handleSubmit} noValidate className="space-y-4 min-w-0">
            <Section title="Customer">
              <div className="rounded-2xl p-3 space-y-2 k-card2">
                <label htmlFor="oe-paste" className="k-label !mb-0">Paste the WhatsApp message</label>
                <textarea id="oe-paste" rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setPasteText(t); void fillFromText(t); } }} placeholder={'Paste here: name, phone, address, PIN code.\nThe boxes below fill in by themselves.'} className="k-field text-sm" />
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => void fillFromText(pasteText)} disabled={!pasteText.trim()} className="k-btn k-btn-soft px-4 py-2 text-sm">Fill the boxes</button>
                  {pasteText && <button type="button" onClick={() => { setPasteText(''); setPasteNote(null); setDistrictHints([]); }} className="text-sm font-semibold underline k-muted">Clear</button>}
                  {districtHints.length > 0 && <span className="flex items-center gap-1.5 flex-wrap text-xs">District? {districtHints.map((h) => <button key={h.name} type="button" onClick={() => { setDistrict(h.name); setDistrictHints([]); }} className="k-chip" title={`Found ${h.why}`}>{h.name} <span className="opacity-60 font-normal">({h.why})</span></button>)}</span>}
                  {pasteNote && <p role="status" className="text-xs" aria-live="polite">{pasteNote.ok.length > 0 && <span className="k-lime-text font-semibold">Filled: {pasteNote.ok.join(', ')}. </span>}{pasteNote.check.length > 0 && <span className="k-warn font-semibold">Please check: {pasteNote.check.join(', ')}.</span>}</p>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="oe-name" label="Name" error={errors.customerName}>
                  <input ref={nameRef} id="oe-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Aarav Sharma" className="k-field" autoComplete="off" />
                </Field>
                <Field id="oe-phone" label="Phone" error={errors.phone}>
                  <input id="oe-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className="k-field font-mono" autoComplete="off" />
                </Field>
              </div>
            </Section>

            <Section title="Delivery address">
              <Field id="oe-address" label="House, street, area" error={errors.addressLine}>
                <textarea id="oe-address" rows={2} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="House or flat number, street, colony" className="k-field" />
              </Field>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="col-span-2 sm:col-span-1"><Field id="oe-landmark" label="Landmark (optional)"><input id="oe-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near the bus stand" className="k-field" /></Field></div>
                <Field id="oe-city" label="City" error={errors.city}><input id="oe-city" value={city} onChange={(e) => setCity(e.target.value)} className="k-field" autoComplete="off" /></Field>
                <Field id="oe-pin" label="PIN code" error={errors.pinCode}><input id="oe-pin" inputMode="numeric" maxLength={6} value={pinCode} onChange={(e) => setPinCode(digits(e.target.value))} placeholder="686016" className="k-field font-mono font-semibold" autoComplete="off" /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="oe-state" label="State">
                  <select id="oe-state" value={state} onChange={(e) => { setState(e.target.value); setDistrict(''); }} className="k-field">
                    <option value="">Choose a state</option>
                    {Object.keys(indiaStatesAndDistricts).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="oe-district" label="District">
                  <select id="oe-district" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state} className="k-field disabled:opacity-50">
                    <option value="">{state ? 'Choose a district' : 'Pick a state first'}</option>
                    {state && indiaStatesAndDistricts[state]?.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Product and delivery" note="Only products with units in a carton can be sold.">
              <div className="grid sm:grid-cols-[1.6fr_1fr] gap-4">
                <Field id="oe-product" label="Product" error={errors.productName} hint={!errors.productName && productName && available !== null ? `${available} in stock` : stockLoading ? 'Loading stock…' : undefined}>
                  <select id="oe-product" value={productName} onChange={(e) => { const v = e.target.value; setProductName(v); setErrors((p) => ({ ...p, productName: '' })); const item = inventory.find((i) => i.product_name === v); if (item?.sku) setSku(item.sku); }} className="k-field">
                    <option value="">Choose a product</option>
                    {inventory.map((item) => <option key={item.id} value={item.product_name}>{item.product_name} ({item.available ?? 0} in stock)</option>)}
                  </select>
                </Field>
                <Field id="oe-sku" label="SKU"><input id="oe-sku" value={sku} onChange={(e) => setSku(e.target.value)} className="k-field font-mono" /></Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field id="oe-qty" label="Quantity" error={errors.quantity}><input id="oe-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} onBlur={() => setQuantity(String(qty))} className="k-field font-mono" /></Field>
                <Field id="oe-weight" label="Weight (kg)"><input id="oe-weight" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, ''))} className="k-field font-mono" /></Field>
                <div className="col-span-2 sm:col-span-1">
                  <Field id="oe-courier" label="Courier">
                    <select id="oe-courier" value={courier} onChange={(e) => setCourier(e.target.value as CourierName)} className="k-field">{COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  </Field>
                </div>
              </div>
            </Section>

            <Section title="Payment and warranty">
              <div>
                <p className="k-label">How is the customer paying?</p>
                <Choice label="Payment mode" value={paymentType} onChange={(v) => setPaymentType(v as PaymentType)} options={[{ value: 'COD', label: 'Cash on delivery' }, { value: 'Prepaid', label: 'Prepaid' }]} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {paymentType === 'COD' && (
                  <Field id="oe-cod" label="COD to collect (₹)" error={errors.codAmount}><input id="oe-cod" inputMode="numeric" value={codAmount} onChange={(e) => setCodAmount(digits(e.target.value))} className="k-field font-mono font-semibold" placeholder="0" /></Field>
                )}
                <Field id="oe-advance" label={paymentType === 'COD' ? 'Advance already paid (₹)' : 'Amount paid (₹)'} error={errors.advance} hint={paymentType === 'Prepaid' && unitPrice > 0 && !paidTouched ? `₹${unitPrice.toLocaleString('en-IN')} each × ${qty} from the product's prepaid price` : paymentType === 'Prepaid' && productName && unitPrice === 0 ? 'No prepaid price set for this product yet.' : undefined}><input id="oe-advance" inputMode="numeric" value={advancePaid} onChange={(e) => { setPaidTouched(true); setAdvancePaid(digits(e.target.value)); setErrors((p) => ({ ...p, advance: '' })); }} className="k-field font-mono font-semibold" /></Field>
              </div>
              <div>
                <p className="k-label">Warranty</p>
                <Choice label="Warranty" value={warrantyType} onChange={setWarrantyType} options={WARRANTY} />
                {warrantyType === 'custom' && (
                  <div className="mt-3 max-w-[10rem]"><Field id="oe-wdays" label="Days" error={errors.warranty}><input id="oe-wdays" inputMode="numeric" value={customWarrantyDays} onChange={(e) => setCustomWarrantyDays(digits(e.target.value))} className="k-field font-mono" /></Field></div>
                )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer k-muted font-semibold">Order ID</summary>
                <div className="relative mt-2 max-w-xs">
                  <label htmlFor="oe-id" className="sr-only">Order ID</label>
                  <input id="oe-id" value={orderId} onChange={(e) => setOrderId(e.target.value)} className="k-field font-mono font-semibold pr-10" />
                  <button type="button" onClick={() => setOrderId(generateNewOrderId())} aria-label="Make a new order ID" title="Make a new order ID" className="absolute right-3 top-1/2 -translate-y-1/2 k-muted"><RefreshCw className="w-4 h-4" /></button>
                </div>
              </details>
            </Section>
          </form>

          {/* Live label: stays in view while you scroll the form */}
          <button type="button" onClick={() => setShowLabel((v) => !v)} aria-expanded={showLabel} className="lg:hidden k-btn k-btn-soft w-full py-3 text-sm">{showLabel ? 'Hide label preview' : 'Show label preview'}</button>
          <aside className={`min-w-0 lg:sticky lg:top-4 self-start ${showLabel ? '' : 'max-lg:hidden'}`}>
            <div className="k-card2 rounded-[24px] p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div><p className="font-bold k-display">Label preview</p><p className="text-xs k-muted">4 × 6 inch thermal label</p></div>
                <button type="button" onClick={handleDownload} className="k-btn k-btn-soft px-3.5 py-2 text-sm"><Download className="w-4 h-4" /> Download</button>
              </div>
              {(() => {
                const wh = settings.warehouse;
                const missing = [!wh?.addressLine?.trim() && 'address', !wh?.pinCode?.trim() && 'PIN code', !wh?.phone?.trim() && 'phone'].filter(Boolean);
                return missing.length ? <p role="note" className="text-xs rounded-xl px-3 py-2 mb-3 k-warn" style={{ background: 'color-mix(in srgb, var(--warn) 14%, transparent)' }}>The FROM box on this label has no {missing.join(', ')}. Add it under Settings, then Sender address.</p> : null;
              })()}
              <div className="overflow-hidden rounded-xl mx-auto" style={{ width: 'min(100%, 17.5rem)', height: '26.5rem' }}>
                <div style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: 'max-content' }}>
                  <ThermalLabel order={draftOrder} settings={settings} scale={1} innerRef={labelRef} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        {saveError && <p role="alert" className="mx-4 sm:mx-6 mb-2 sm:mb-4 shrink-0 rounded-2xl px-4 py-3 text-sm font-medium flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}><AlertCircle className="w-4 h-4 mt-0.5 shrink-0 k-bad" />{saveError}</p>}

        <div className="sm:sticky bottom-0 shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t k-rule flex items-center justify-between gap-x-3 gap-y-2 flex-wrap rounded-b-[20px] max-sm:rounded-none max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--card)' }}>
          <p className="text-sm max-sm:w-full"><span className="k-muted">Order total </span><span className="text-xl font-bold k-display tabular-nums">{inr(cod + advance)}</span></p>
          <div className="flex gap-2 max-sm:w-full">
            <button type="button" onClick={onClose} className="k-btn k-btn-ghost px-5 py-3 text-sm">Cancel</button>
            <button type="submit" form="order-form" disabled={isSaving} className="k-btn k-btn-lime px-6 py-3 text-sm max-sm:flex-1">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {isSaving ? 'Saving…' : 'Next: scan the units'}
            </button>
          </div>
        </div>
      </div>

      {isScannerOpen && pendingOrder && <Scanner isOpen={isScannerOpen} onClose={handleScanCancel} onConfirm={handleScanComplete} order={pendingOrder} />}
    </div>
  );
};
