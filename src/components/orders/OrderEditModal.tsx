import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertTriangle, Printer } from 'lucide-react';
import type { Order } from '../../types';

export interface OrderChanges {
  name: string; phone: string; addressLine: string; landmark: string; city: string; district: string;
  state: string; pinCode: string; courier: string; paymentType: 'COD' | 'Prepaid';
  codAmount: number; advancePaid: number; notes: string;
  /** Warranty length in days. Left out when it was not changed. */
  warrantyDays?: number;
}

interface Props {
  order: Order;
  onClose: () => void;
  /** Resolves true when the change was saved. */
  onSave: (changes: OrderChanges) => Promise<boolean>;
  /** Called after a successful "Save and print label" with the order as it now reads. */
  onSavedAndPrint: (updated: Order) => void;
}

const WARRANTY_CHOICES: [string, string][] = [['0', 'No warranty'], ['3', '3 days'], ['30', '1 month'], ['180', '6 months'], ['365', '1 year']];
const currentWarrantyDays = (o: Order) => {
  if (!o.warrantyStart || !o.warrantyEnd) return 0;
  const d = Math.round((new Date(o.warrantyEnd).getTime() - new Date(o.warrantyStart).getTime()) / 86_400_000);
  return Number.isFinite(d) && d > 0 ? d : 0;
};

const COURIERS = ['India Post', 'DTDC'];

// The free-text note is whatever comes before the packed QTY:/ADV:/CTN: tokens.
const notesOf = (raw?: string) => {
  const t = raw || '';
  const i = t.indexOf('QTY:');
  return (i >= 0 ? t.slice(0, i) : '').trim();
};
// Old orders sometimes stored "district LMK:landmark" in one piece; keep only the district.
const cleanDistrict = (d?: string) => (d || '').split(/\s+LMK:/)[0].trim();

const Field: React.FC<{ label: string; error?: string; className?: string; children: React.ReactNode }> = ({ label, error, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="k-label">{label}</span>
    {children}
    {error && <span className="block text-xs mt-1.5 k-bad">{error}</span>}
  </label>
);

export const OrderEditModal: React.FC<Props> = ({ order, onClose, onSave, onSavedAndPrint }) => {
  const [f, setF] = useState({
    name: order.customer.name,
    phone: order.customer.phone,
    addressLine: order.customer.addressLine,
    landmark: order.customer.landmark || '',
    city: order.customer.city,
    district: cleanDistrict(order.customer.district),
    state: order.customer.state,
    pinCode: order.customer.pinCode,
    courier: order.courier,
    paymentType: order.paymentType as 'COD' | 'Prepaid',
    codAmount: String(order.codAmount ?? 0),
    advancePaid: String(order.advancePaid ?? 0),
    notes: notesOf(order.notes),
    warranty: WARRANTY_CHOICES.some(([v]) => v === String(currentWarrantyDays(order))) ? String(currentWarrantyDays(order)) : 'custom',
    warrantyCustom: String(currentWarrantyDays(order) || ''),
  });
  const [saving, setSaving] = useState<'save' | 'print' | null>(null);
  const [failed, setFailed] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [e.target.name]: e.target.value }));

  const errors = {
    name: f.name.trim() ? '' : 'Enter the customer name.',
    phone: f.phone.trim() ? '' : 'Enter a phone number.',
    addressLine: f.addressLine.trim() ? '' : 'Enter the address.',
    city: f.city.trim() ? '' : 'Enter the city.',
    pinCode: /^\d{6}$/.test(f.pinCode.trim()) ? '' : 'A PIN code has exactly 6 digits.',
  };
  const valid = Object.values(errors).every((e) => !e);
  const phoneDigits = f.phone.replace(/\D/g, '').length;

  const wantedWarranty = f.warranty === 'custom' ? Math.max(0, parseInt(f.warrantyCustom) || 0) : parseInt(f.warranty);
  const warrantyChanged = wantedWarranty !== currentWarrantyDays(order);

  const changes = (): OrderChanges => ({
    name: f.name, phone: f.phone, addressLine: f.addressLine, landmark: f.landmark, city: f.city, district: f.district, state: f.state, pinCode: f.pinCode, courier: f.courier, notes: f.notes,
    warrantyDays: warrantyChanged ? wantedWarranty : undefined,
    paymentType: f.paymentType,
    codAmount: Math.max(0, parseInt(f.codAmount) || 0),
    advancePaid: Math.max(0, parseInt(f.advancePaid) || 0),
  });

  const submit = async (thenPrint: boolean) => {
    if (!valid || saving) return;
    setSaving(thenPrint ? 'print' : 'save');
    setFailed('');
    const c = changes();
    const ok = await onSave(c);
    setSaving(null);
    if (!ok) { setFailed('The changes were not saved. Check your connection and try again.'); return; }
    if (thenPrint) {
      onSavedAndPrint({
        ...order,
        customer: { ...order.customer, name: c.name.trim(), phone: c.phone.trim(), addressLine: c.addressLine.trim(), landmark: c.landmark.trim() || undefined, city: c.city.trim(), district: c.district.trim(), state: c.state.trim(), pinCode: c.pinCode.trim() },
        courier: c.courier as Order['courier'],
        paymentType: c.paymentType,
        codAmount: c.paymentType === 'COD' ? c.codAmount : 0,
        advancePaid: c.advancePaid,
        ...(c.warrantyDays === undefined ? {} : c.warrantyDays > 0 ? { warrantyStart: order.warrantyStart || new Date().toISOString(), warrantyEnd: new Date(new Date(order.warrantyStart || Date.now()).getTime() + c.warrantyDays * 86_400_000).toISOString() } : { warrantyStart: undefined, warrantyEnd: undefined }),
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label={`Edit order ${order.id}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="k-card w-full max-w-3xl shadow-2xl my-auto k-rise" style={{ ['--i' as string]: 0 }} onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h3 className="text-2xl font-bold k-display">Edit order</h3>
            <p className="text-sm k-muted mt-1"><span className="font-mono font-semibold" style={{ color: 'var(--ink)' }}>{order.id}</span> · the product and stock stay as they are.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold mb-3">Customer</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name" error={errors.name}><input ref={first} className="k-field" name="name" value={f.name} onChange={set} /></Field>
              <Field label="Phone" error={errors.phone}>
                <input className="k-field" name="phone" value={f.phone} onChange={set} inputMode="tel" />
                {!errors.phone && phoneDigits > 0 && phoneDigits < 10 && <span className="block text-xs mt-1.5 k-warn">This number has only {phoneDigits} digits.</span>}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold mb-3">Delivery address</legend>
            <Field label="Address" error={errors.addressLine}><input className="k-field" name="addressLine" value={f.addressLine} onChange={set} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Landmark"><input className="k-field" name="landmark" value={f.landmark} onChange={set} /></Field>
              <Field label="City" error={errors.city}><input className="k-field" name="city" value={f.city} onChange={set} /></Field>
              <Field label="District"><input className="k-field" name="district" value={f.district} onChange={set} /></Field>
              <Field label="State"><input className="k-field" name="state" value={f.state} onChange={set} /></Field>
            </div>
            <Field label="PIN code" error={errors.pinCode} className="sm:max-w-[12rem]">
              <input className="k-field font-mono" name="pinCode" value={f.pinCode} onChange={(e) => setF((p) => ({ ...p, pinCode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" maxLength={6} />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold mb-3">Courier and payment</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Courier">
                <select className="k-field" name="courier" value={f.courier} onChange={set}>
                  {(COURIERS.includes(f.courier) ? COURIERS : [f.courier, ...COURIERS]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Payment">
                <select className="k-field" name="paymentType" value={f.paymentType} onChange={set}>
                  <option value="COD">COD</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </Field>
              {f.paymentType === 'COD' && <Field label="COD to collect (₹)"><input className="k-field" type="number" min="0" name="codAmount" value={f.codAmount} onChange={set} /></Field>}
              <Field label={f.paymentType === 'COD' ? 'Advance paid (₹)' : 'Amount paid (₹)'}><input className="k-field" type="number" min="0" name="advancePaid" value={f.advancePaid} onChange={set} /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Warranty">
                <select className="k-field" name="warranty" value={f.warranty} onChange={set}>
                  {WARRANTY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  <option value="custom">Other (days)</option>
                </select>
              </Field>
              {f.warranty === 'custom' && <Field label="Warranty days"><input className="k-field" type="number" min="1" name="warrantyCustom" value={f.warrantyCustom} onChange={set} /></Field>}
            </div>
            <Field label="Note"><input className="k-field" name="notes" value={f.notes} onChange={set} placeholder="Optional" /></Field>
          </fieldset>

          {failed && <p role="alert" className="text-sm font-medium flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 k-bad" /> {failed}</p>}
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3 flex-wrap">
          <button type="button" onClick={onClose} disabled={!!saving} className="k-btn k-btn-ghost px-5 py-3 text-sm">Cancel</button>
          <button type="submit" disabled={!valid || !!saving} className="k-btn k-btn-ink px-6 py-3 text-sm">
            {saving === 'save' ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save changes'}
          </button>
          <button type="button" onClick={() => submit(true)} disabled={!valid || !!saving} className="k-btn k-btn-lime px-6 py-3 text-sm" style={{ boxShadow: valid ? '0 10px 28px -10px var(--lime)' : undefined }}>
            {saving === 'print' ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Printer className="w-4 h-4" /> Save and print label</>}
          </button>
        </div>
      </form>
    </div>
  );
};
