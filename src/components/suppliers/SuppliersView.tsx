import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, Plus, Phone, X, FileDown, Paperclip, Trash2, Pencil, Store, Download, Loader2, Box, Link2 } from 'lucide-react';
import {
  SupplierService, KIND_LABEL, friendlyError, totalsFor,
  type Supplier, type Purchase, type SupplierKind, type SupplierCarton,
} from '../../services/supplierService';

const KINDS = Object.keys(KIND_LABEL) as SupplierKind[];
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dmy = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block"><span className="k-label">{label}</span>{children}</label>
);

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div className={`k-card relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[28px] p-5 sm:p-7`} style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-xl font-bold k-display">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ── Add / edit supplier ─────────────────────────────────────────────────────
const SupplierForm: React.FC<{ initial?: Supplier; onSaved: (s: Supplier) => void; onClose: () => void }> = ({ initial, onSaved, onClose }) => {
  const [f, setF] = useState({
    name: initial?.name || '', kind: (initial?.kind || 'product') as SupplierKind, phone: initial?.phone || '', address: initial?.address || '',
    gst: initial?.gst || '', bank_details: initial?.bank_details || '', notes: initial?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [e.target.name]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) { setErr('Enter the supplier name.'); return; }
    setBusy(true); setErr('');
    try {
      const s = await SupplierService.save({ ...f, name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null, gst: f.gst.trim() || null, bank_details: f.bank_details.trim() || null, notes: f.notes.trim() || null }, initial?.id);
      onSaved(s);
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet title={initial ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="What do they supply?">
          <div className="flex flex-wrap gap-2 mt-1.5">
            {KINDS.map((k) => <button type="button" key={k} className="k-chip" aria-pressed={f.kind === k} onClick={() => setF((p) => ({ ...p, kind: k }))}>{KIND_LABEL[k]}</button>)}
          </div>
        </Field>
        <Field label="Supplier name"><input className="k-field" name="name" value={f.name} onChange={set} autoFocus /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone"><input className="k-field" name="phone" inputMode="tel" value={f.phone} onChange={set} placeholder="+91" /></Field>
          <Field label="GST number"><input className="k-field" name="gst" value={f.gst} onChange={set} /></Field>
        </div>
        <Field label="Address"><input className="k-field" name="address" value={f.address} onChange={set} /></Field>
        <Field label="Bank details"><textarea className="k-field" name="bank_details" rows={2} value={f.bank_details} onChange={set} placeholder="Account name, number, IFSC, UPI" /></Field>
        <Field label="Notes"><textarea className="k-field" name="notes" rows={2} value={f.notes} onChange={set} /></Field>
        {err && <p role="alert" className="text-sm k-bad">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="k-btn k-btn-ghost px-5 h-11">Cancel</button>
          <button onClick={save} disabled={busy} className="k-btn k-btn-lime px-6 h-11">{busy ? 'Saving…' : 'Save supplier'}</button>
        </div>
      </div>
    </Sheet>
  );
};

// ── Add / edit purchase ─────────────────────────────────────────────────────
const PurchaseForm: React.FC<{ supplier: Supplier; initial?: Purchase; onSaved: () => void; onClose: () => void }> = ({ supplier, initial, onSaved, onClose }) => {
  const loose = supplier.kind !== 'product';
  const [f, setF] = useState({
    purchase_date: initial?.purchase_date || today(), item_name: initial?.item_name || '',
    cartons: initial ? String(initial.cartons || '') : '', units_per_carton: initial?.units_per_carton != null ? String(initial.units_per_carton) : '',
    quantity: initial?.quantity != null ? String(initial.quantity) : '', price: initial?.price_per_carton != null ? String(initial.price_per_carton) : '',
    total: initial ? String(initial.total_paid) : '', notes: initial?.notes || '',
  });
  const [totalEdited, setTotalEdited] = useState(!!initial);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [e.target.name]: e.target.value }));

  const count = parseFloat(loose ? f.quantity : f.cartons) || 0;
  const price = parseFloat(f.price) || 0;
  const auto = count * price;
  const total = totalEdited ? f.total : (auto ? String(Math.round(auto * 100) / 100) : '');

  const save = async () => {
    if (!f.item_name.trim()) { setErr(loose ? 'Enter what you bought, for example "Box 4x6".' : 'Enter the product name.'); return; }
    if (!(count > 0)) { setErr(loose ? 'Enter the quantity.' : 'Enter the number of cartons.'); return; }
    if (!(parseFloat(total) >= 0) || total === '') { setErr('Enter the total money paid.'); return; }
    setBusy(true); setErr('');
    try {
      let bill = { path: initial?.bill_path || null as string | null, name: initial?.bill_name || null as string | null };
      if (file) {
        const up = await SupplierService.uploadBill(file); bill = { path: up.path, name: up.name };
      }
      await SupplierService.savePurchase({
        supplier_id: supplier.id, purchase_date: f.purchase_date, item_name: f.item_name.trim(),
        cartons: loose ? 0 : count, units_per_carton: loose ? null : (parseFloat(f.units_per_carton) || null),
        quantity: loose ? count : null, price_per_carton: price || null, total_paid: parseFloat(total),
        bill_path: bill.path, bill_name: bill.name, batch_id: initial?.batch_id || null, notes: f.notes.trim() || null,
      }, initial?.id);
      onSaved();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet title={`${initial ? 'Edit' : 'Add'} purchase · ${supplier.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date"><input className="k-field" type="date" name="purchase_date" value={f.purchase_date} onChange={set} /></Field>
          <Field label={loose ? 'What did you buy?' : 'Product'}><input className="k-field" name="item_name" value={f.item_name} onChange={set} placeholder={loose ? 'Box 4x6' : 'Period Massager Premium'} autoFocus /></Field>
        </div>
        {loose ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity"><input className="k-field" type="number" min="0" name="quantity" value={f.quantity} onChange={set} /></Field>
            <Field label="Price per item (₹)"><input className="k-field" type="number" min="0" step="0.01" name="price" value={f.price} onChange={set} /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Cartons"><input className="k-field" type="number" min="0" name="cartons" value={f.cartons} onChange={set} /></Field>
            <Field label="Units in one carton"><input className="k-field" type="number" min="0" name="units_per_carton" value={f.units_per_carton} onChange={set} placeholder="100" /></Field>
            <Field label="Price per carton (₹)"><input className="k-field" type="number" min="0" step="0.01" name="price" value={f.price} onChange={set} /></Field>
          </div>
        )}
        <Field label="Total money paid (₹)">
          <input className="k-field" type="number" min="0" step="0.01" value={total} onChange={(e) => { setTotalEdited(true); setF((p) => ({ ...p, total: e.target.value })); }} placeholder="0.00" />
          {!totalEdited && auto > 0 && <span className="block text-xs k-muted mt-1.5">Worked out from quantity × price. Change it if you paid a different amount.</span>}
        </Field>
        <Field label="Bill or invoice (photo or PDF)">
          <input className="k-field" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {initial?.bill_name && !file && <span className="block text-xs k-muted mt-1.5">Saved bill: {initial.bill_name}. Choose a file to replace it.</span>}
        </Field>
        <Field label="Notes"><input className="k-field" name="notes" value={f.notes} onChange={set} /></Field>
        {err && <p role="alert" className="text-sm k-bad">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="k-btn k-btn-ghost px-5 h-11">Cancel</button>
          <button onClick={save} disabled={busy} className="k-btn k-btn-lime px-6 h-11">{busy ? 'Saving…' : 'Save purchase'}</button>
        </div>
      </div>
    </Sheet>
  );
};

// ── Link old cartons to a supplier ──────────────────────────────────────────
const cartonName = (c: SupplierCarton) => c.location || c.products.slice(0, 2).join(', ') || `Carton ${c.id.slice(0, 6)}`;
const LinkCartons: React.FC<{ supplier: Supplier; all: SupplierCarton[]; names: Map<string, string>; onClose: () => void; onSaved: () => void }> = ({ supplier, all, names, onClose, onSaved }) => {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<'free' | 'all'>('free');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((c) => c.supplier_id !== supplier.id && (only === 'all' || !c.supplier_id) && (!t || cartonName(c).toLowerCase().includes(t) || c.products.some((n) => n.toLowerCase().includes(t)) || c.id.toLowerCase().includes(t)));
  }, [all, q, only, supplier.id]);
  const toggle = (id: string) => setPick((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = rows.length > 0 && rows.every((c) => pick.has(c.id));
  const save = async () => {
    setBusy(true); setErr('');
    try { await SupplierService.linkCartons([...pick], supplier.id); onSaved(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Link cartons to ${supplier.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by location or product" aria-label="Search cartons" className="k-field" style={{ paddingLeft: '2.4rem' }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="k-chip" aria-pressed={only === 'free'} onClick={() => setOnly('free')}>No supplier yet</button>
          <button type="button" className="k-chip" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>All cartons</button>
          <button type="button" className="text-sm font-semibold ml-auto" onClick={() => setPick(allShown ? new Set() : new Set(rows.map((c) => c.id)))}>{allShown ? 'Clear' : `Select all ${rows.length}`}</button>
        </div>
        <ul className="max-h-[46vh] overflow-y-auto space-y-1.5">
          {rows.map((c) => (
            <li key={c.id}>
              <label className="k-card2 rounded-2xl px-3 py-2.5 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={pick.has(c.id)} onChange={() => toggle(c.id)} className="w-5 h-5 shrink-0" aria-label={`Select ${cartonName(c)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{cartonName(c)}</span>
                  <span className="block text-xs k-muted truncate">{c.products.slice(0, 2).join(', ') || 'Empty'} · {c.inStock} of {c.total} units left{c.supplier_id ? ` · now: ${names.get(c.supplier_id) || 'another supplier'}` : ''}</span>
                </span>
              </label>
            </li>
          ))}
          {rows.length === 0 && <li className="k-muted text-sm py-6 text-center">{only === 'free' ? 'Every carton already has a supplier. Choose “All cartons” to move one.' : 'No carton matches.'}</li>}
        </ul>
        {err && <p role="alert" className="text-sm k-bad">{err}</p>}
        <button type="button" disabled={busy || pick.size === 0} onClick={save} className="k-btn k-btn-lime w-full py-3 text-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} {pick.size ? `Link ${pick.size} carton${pick.size === 1 ? '' : 's'}` : 'Pick cartons to link'}</button>
      </div>
    </Sheet>
  );
};

// ── Supplier page (details + purchases) ─────────────────────────────────────
const SupplierDetail: React.FC<{ supplier: Supplier; names: Map<string, string>; purchases: Purchase[]; onChanged: () => void; onEdit: () => void; onDeleted: () => void; onClose: () => void }> = ({ supplier, names, purchases, onChanged, onEdit, onDeleted, onClose }) => {
  const [allCartons, setAllCartons] = useState<SupplierCarton[]>([]);
  const [cartonMsg, setCartonMsg] = useState('');
  const [linking, setLinking] = useState(false);
  const loadCartons = useCallback(() => { SupplierService.cartons().then((c) => { setAllCartons(c); setCartonMsg(''); }).catch((e) => setCartonMsg(friendlyError(e))); }, []);
  useEffect(() => { loadCartons(); }, [loadCartons]);
  const mine = allCartons.filter((c) => c.supplier_id === supplier.id);
  const unsold = mine.filter((c) => c.inStock > 0);
  const unitsLeft = mine.reduce((n, c) => n + c.inStock, 0);
  const unlink = async (c: SupplierCarton) => { try { await SupplierService.linkCartons([c.id], null); loadCartons(); } catch (e) { setCartonMsg(friendlyError(e)); } };
  const [adding, setAdding] = useState<Purchase | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const t = totalsFor(purchases);
  const loose = supplier.kind !== 'product';

  const openBill = async (p: Purchase) => {
    if (!p.bill_path) return;
    const w = window.open('', '_blank');
    const url = await SupplierService.billUrl(p.bill_path);
    if (url && w) w.location.href = url; else { w?.close(); setMsg('The bill could not be opened.'); }
  };
  const delPurchase = async (p: Purchase) => {
    if (!window.confirm(`Delete this purchase (${p.item_name}, ${inr(p.total_paid)})? This also removes its bill.`)) return;
    try { await SupplierService.removePurchase(p); onChanged(); } catch (e) { setMsg(friendlyError(e)); }
  };
  const delSupplier = async () => {
    try { await SupplierService.remove(supplier.id); onDeleted(); } catch (e) { setMsg(friendlyError(e)); }
  };

  const info: [string, string | null | undefined][] = [['Address', supplier.address], ['GST', supplier.gst], ['Bank details', supplier.bank_details], ['Notes', supplier.notes]];
  return (
    <>
      <Sheet title={supplier.name} onClose={onClose} wide>
        <div className="flex flex-wrap items-center gap-2 -mt-2 mb-4">
          <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: 'var(--card2)' }}>{KIND_LABEL[supplier.kind]}</span>
          {supplier.phone && <a href={`tel:${supplier.phone}`} className="k-btn k-btn-soft h-9 px-3 text-sm"><Phone className="w-3.5 h-3.5" /> {supplier.phone}</a>}
          <button onClick={onEdit} className="k-btn k-btn-ghost h-9 px-3 text-sm"><Pencil className="w-3.5 h-3.5" /> Edit</button>
        </div>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-5">
          {info.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt className="k-label">{k}</dt><dd className="text-sm whitespace-pre-line">{v}</dd></div>))}
        </dl>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[[loose ? 'Purchases' : 'Cartons bought', loose ? t.count : t.cartons], ['Money spent', inr(t.spent)], [loose ? 'Last bought' : 'Avg per carton', loose ? dmy(t.last) : (t.perCarton ? inr(t.perCarton) : '—')]].map(([l, v]) => (
            <div key={String(l)} className="k-card2 rounded-2xl p-3 sm:p-4"><p className="text-xs k-muted">{l}</p><p className="text-lg sm:text-2xl font-bold k-display tabular-nums mt-1">{v}</p></div>
          ))}
        </div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold">Purchases</h4>
          <button onClick={() => setAdding('new')} className="k-btn k-btn-lime h-10 px-4 text-sm"><Plus className="w-4 h-4" /> Add purchase</button>
        </div>
        {msg && <p role="alert" className="text-sm k-bad mb-2">{msg}</p>}
        {purchases.length === 0 ? (
          <p className="k-muted text-sm py-6 text-center">No purchases yet. Add the first one when you buy from {supplier.name}.</p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((p) => (
              <li key={p.id} className="k-card2 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1" style={{ minWidth: '12rem' }}>
                  <p className="font-semibold truncate">{p.item_name}</p>
                  <p className="text-xs k-muted">
                    {dmy(p.purchase_date)} · {p.cartons > 0 ? `${p.cartons} carton${p.cartons === 1 ? '' : 's'}${p.units_per_carton ? ` × ${p.units_per_carton} units` : ''}` : `${p.quantity ?? 0} pcs`}
                    {p.price_per_carton ? ` · ${inr(p.price_per_carton)} each` : ''}
                  </p>
                </div>
                <p className="font-bold tabular-nums">{inr(p.total_paid)}</p>
                <div className="flex items-center gap-1">
                  {p.bill_path && <button onClick={() => openBill(p)} className="k-btn k-btn-ghost h-9 px-3 text-sm" aria-label={`Open bill ${p.bill_name || ''}`}><Paperclip className="w-3.5 h-3.5" /> Bill</button>}
                  <button onClick={() => setAdding(p)} className="k-btn k-btn-ghost w-9 h-9" aria-label="Edit purchase"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => delPurchase(p)} className="k-btn k-btn-ghost w-9 h-9" aria-label="Delete purchase"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between mt-7 mb-2 gap-2">
          <h4 className="font-semibold">Cartons from this supplier</h4>
          <button onClick={() => setLinking(true)} className="k-btn k-btn-soft h-10 px-4 text-sm"><Link2 className="w-4 h-4" /> Link old cartons</button>
        </div>
        {cartonMsg ? <p role="alert" className="text-sm k-bad mb-2">{cartonMsg}</p> : (
          <p className="text-sm k-muted mb-2">{mine.length === 0 ? 'No cartons linked yet.' : `${unsold.length} unsold carton${unsold.length === 1 ? '' : 's'} with ${unitsLeft} unit${unitsLeft === 1 ? '' : 's'} left · ${mine.length - unsold.length} sold out`}</p>
        )}
        {mine.length > 0 && (
          <ul className="space-y-2">
            {[...mine].sort((a, b) => (b.inStock > 0 ? 1 : 0) - (a.inStock > 0 ? 1 : 0) || b.inStock - a.inStock).map((c) => (
              <li key={c.id} className="k-card2 rounded-2xl p-3 flex items-center gap-3">
                <Box className="w-4 h-4 k-muted shrink-0" />
                <div className="min-w-0 flex-1"><p className="font-semibold truncate">{cartonName(c)}</p><p className="text-xs k-muted truncate">{c.products.slice(0, 2).join(', ') || 'Empty'} · {c.inStock} of {c.total} units left</p></div>
                <span className="text-xs font-semibold rounded-full px-2.5 py-1 shrink-0" style={c.inStock > 0 ? { background: 'var(--lime)', color: '#0a0a0a' } : { background: 'var(--card)' }}>{c.inStock > 0 ? 'Unsold' : 'Sold out'}</span>
                <button onClick={() => unlink(c)} className="k-btn k-btn-ghost w-9 h-9" aria-label={`Unlink ${cartonName(c)}`}><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 pt-4 border-t k-rule flex items-center justify-between gap-3">
          {confirmDel ? (
            <>
              <p className="text-sm">Delete {supplier.name} and all its {purchases.length} purchases and bills? This cannot be undone.</p>
              <div className="flex gap-2 shrink-0"><button onClick={() => setConfirmDel(false)} className="k-btn k-btn-ghost h-10 px-4 text-sm">Keep</button><button onClick={delSupplier} className="k-btn h-10 px-4 text-sm" style={{ background: 'var(--bad)', color: '#fff' }}>Delete</button></div>
            </>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-sm k-bad font-semibold">Delete supplier</button>
          )}
        </div>
      </Sheet>
      {linking && <LinkCartons supplier={supplier} all={allCartons} names={names} onClose={() => setLinking(false)} onSaved={() => { setLinking(false); loadCartons(); }} />}
      {adding && <PurchaseForm supplier={supplier} initial={adding === 'new' ? undefined : adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); onChanged(); }} />}
    </>
  );
};

// ── PDF and Excel report ────────────────────────────────────────────────────
interface ReportRow { name: string; kind: string; purchases: number; cartons: number; spent: number; perCarton: number }
const buildReport = (suppliers: Supplier[], purchases: Purchase[], from: string, to: string): ReportRow[] =>
  suppliers.map((s) => {
    const t = totalsFor(purchases.filter((p) => p.supplier_id === s.id && p.purchase_date >= from && p.purchase_date <= to));
    return { name: s.name, kind: KIND_LABEL[s.kind], purchases: t.count, cartons: t.cartons, spent: t.spent, perCarton: t.perCarton };
  }).filter((r) => r.purchases > 0).sort((a, b) => b.spent - a.spent);

const downloadBlob = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

const makePdf = async (rows: ReportRow[], from: string, to: string) => {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('ZAYLOW · Supplier report', 40, 52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110); doc.text(`${dmy(from)} to ${dmy(to)}`, 40, 70); doc.setTextColor(0);
  const cols = [40, 210, 300, 360, 420, 500]; // name, type, buys, cartons, spent, per carton
  const head = (y: number) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ['Supplier', 'Type', 'Buys', 'Cartons', 'Spent', 'Per carton'].forEach((h, i) => doc.text(h, i >= 2 ? cols[i] + 42 : cols[i], y, i >= 2 ? { align: 'right' } : undefined)); doc.setDrawColor(190); doc.line(40, y + 6, W - 40, y + 6); doc.setFont('helvetica', 'normal'); };
  let y = 104; head(y); y += 24;
  rows.forEach((r) => {
    if (y > 780) { doc.addPage(); y = 52; head(y); y += 24; }
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(r.name, 160)[0], cols[0], y); doc.text(r.kind, cols[1], y);
    doc.text(String(r.purchases), cols[2] + 42, y, { align: 'right' }); doc.text(String(r.cartons), cols[3] + 42, y, { align: 'right' });
    doc.text(`Rs ${Math.round(r.spent).toLocaleString('en-IN')}`, cols[4] + 42, y, { align: 'right' }); doc.text(r.perCarton ? `Rs ${Math.round(r.perCarton).toLocaleString('en-IN')}` : '-', cols[5] + 42, y, { align: 'right' });
    y += 20;
  });
  doc.setDrawColor(190); doc.line(40, y - 8, W - 40, y - 8);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', cols[0], y + 8);
  doc.text(String(rows.reduce((s, r) => s + r.cartons, 0)), cols[3] + 42, y + 8, { align: 'right' });
  doc.text(`Rs ${Math.round(rows.reduce((s, r) => s + r.spent, 0)).toLocaleString('en-IN')}`, cols[4] + 42, y + 8, { align: 'right' });
  if (!rows.length) { doc.setFont('helvetica', 'normal'); doc.text('No purchases in these dates.', 40, 130); }
  doc.save(`supplier-report-${from}_to_${to}.pdf`);
};

const makeCsv = (rows: ReportRow[], from: string, to: string) => {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Supplier', 'Type', 'Purchases', 'Cartons', 'Money spent', 'Per carton'].join(',')].concat(rows.map((r) => [esc(r.name), esc(r.kind), r.purchases, r.cartons, Math.round(r.spent * 100) / 100, Math.round(r.perCarton * 100) / 100].join(',')));
  downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `supplier-report-${from}_to_${to}.csv`);
};

const ReportSheet: React.FC<{ suppliers: Supplier[]; purchases: Purchase[]; onClose: () => void }> = ({ suppliers, purchases, onClose }) => {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => buildReport(suppliers, purchases, from, to), [suppliers, purchases, from, to]);
  const cheapest = rows.filter((r) => r.perCarton > 0).sort((a, b) => a.perCarton - b.perCarton)[0];
  return (
    <Sheet title="Supplier report" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="From"><input type="date" className="k-field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className="k-field" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="k-chip" onClick={() => { setFrom(monthStart()); setTo(today()); }}>This month</button>
        <button className="k-chip" onClick={() => { setFrom(today().slice(0, 4) + '-01-01'); setTo(today()); }}>This year</button>
        <button className="k-chip" onClick={() => { setFrom('2000-01-01'); setTo(today()); }}>Everything</button>
      </div>
      {rows.length === 0 ? <p className="k-muted text-sm py-6 text-center">No purchases in these dates.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left k-muted"><th className="py-2 pr-3 font-medium">Supplier</th><th className="py-2 pr-3 font-medium text-right">Cartons</th><th className="py-2 pr-3 font-medium text-right">Spent</th><th className="py-2 font-medium text-right">Per carton</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t k-rule"><td className="py-2.5 pr-3"><span className="font-semibold">{r.name}</span><span className="block text-xs k-muted">{r.kind} · {r.purchases} buy{r.purchases === 1 ? '' : 's'}</span></td><td className="py-2.5 pr-3 text-right tabular-nums">{r.cartons}</td><td className="py-2.5 pr-3 text-right tabular-nums">{inr(r.spent)}</td><td className="py-2.5 text-right tabular-nums">{r.perCarton ? inr(r.perCarton) : '—'}</td></tr>
              ))}
              <tr className="border-t k-rule font-bold"><td className="py-3 pr-3">Total</td><td className="py-3 pr-3 text-right tabular-nums">{rows.reduce((s, r) => s + r.cartons, 0)}</td><td className="py-3 pr-3 text-right tabular-nums">{inr(rows.reduce((s, r) => s + r.spent, 0))}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {cheapest && <p className="text-sm mt-3"><span className="k-muted">Lowest price per carton:</span> <b>{cheapest.name}</b> at {inr(cheapest.perCarton)}</p>}
      <div className="flex flex-wrap justify-end gap-2 mt-5">
        <button disabled={!rows.length} onClick={() => makeCsv(rows, from, to)} className="k-btn k-btn-ghost h-11 px-5"><Download className="w-4 h-4" /> Excel file</button>
        <button disabled={busy} onClick={async () => { setBusy(true); try { await makePdf(rows, from, to); } finally { setBusy(false); } }} className="k-btn k-btn-lime h-11 px-5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download PDF</button>
      </div>
    </Sheet>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────
export const SuppliersView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<SupplierKind | 'all'>('all');
  const [form, setForm] = useState<Supplier | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([SupplierService.list(), SupplierService.purchases()]);
      if (!alive.current) return;
      setSuppliers(s); setPurchases(p); setError('');
    } catch (e) { if (alive.current) setError(friendlyError(e)); } finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, Purchase[]>();
    purchases.forEach((p) => m.set(p.supplier_id, [...(m.get(p.supplier_id) || []), p]));
    return m;
  }, [purchases]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => (kind === 'all' || s.kind === kind) && (!q || [s.name, s.phone, s.address, s.gst].some((v) => (v || '').toLowerCase().includes(q))));
  }, [suppliers, search, kind]);

  const all = totalsFor(purchases);
  const open = suppliers.find((s) => s.id === openId) || null;
  const count = (k: SupplierKind | 'all') => (k === 'all' ? suppliers.length : suppliers.filter((s) => s.kind === k).length);

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="k-rise flex flex-col lg:flex-row lg:items-center justify-between gap-4" style={{ ['--i' as string]: 0 }}>
          <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Suppliers</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 lg:w-72 min-w-[12rem]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppliers" placeholder="Search name, phone, GST" className="k-field" style={{ paddingLeft: '2.6rem' }} />
            </div>
            <button onClick={load} disabled={loading} aria-label="Refresh" className="k-btn k-btn-ghost w-11 h-11 shrink-0"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={() => setReport(true)} className="k-btn k-btn-ghost h-11 px-4"><FileDown className="w-4 h-4" /> Report</button>
            <button onClick={() => setForm('new')} className="k-btn k-btn-lime h-11 px-5"><Plus className="w-4 h-4" /> Add supplier</button>
          </div>
        </header>

        {error && <div role="alert" className="k-card p-4 text-sm k-bad">{error}</div>}

        <div className="grid grid-cols-3 gap-3 sm:gap-4 k-rise" style={{ ['--i' as string]: 1 }}>
          {[['Suppliers', suppliers.length], ['Cartons bought', all.cartons], ['Money spent', inr(all.spent)]].map(([l, v]) => (
            <div key={String(l)} className="k-card p-4 sm:p-6"><p className="text-xs sm:text-sm k-muted">{l}</p><p className="text-lg min-[400px]:text-2xl sm:text-4xl font-bold k-display tabular-nums mt-1 sm:mt-2 truncate">{v}</p></div>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 k-rise" style={{ ['--i' as string]: 2, scrollbarWidth: 'none' }}>
          {(['all', ...KINDS] as const).map((k) => <button key={k} className="k-chip shrink-0" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_LABEL[k]} · {count(k)}</button>)}
        </div>

        {loading && suppliers.length === 0 ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="k-card k-skel h-40" />)}</div>
        ) : shown.length === 0 ? (
          <div className="k-card p-8 sm:p-12 text-center">
            <Store className="w-8 h-8 mx-auto k-muted" />
            <p className="font-semibold mt-3">{suppliers.length ? 'No supplier matches.' : 'No suppliers yet.'}</p>
            <p className="text-sm k-muted mt-1">{suppliers.length ? 'Clear the search or pick another type.' : 'Add the people you buy from: product makers, box and cover sellers, shops.'}</p>
            {!suppliers.length && !error && <button onClick={() => setForm('new')} className="k-btn k-btn-lime h-11 px-6 mt-5"><Plus className="w-4 h-4" /> Add the first supplier</button>}
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map((s, i) => {
              const t = totalsFor(byId.get(s.id) || []);
              const tone = i === 0 && kind === 'all' && !search && t.count > 0;
              return (
                <li key={s.id} className="k-rise" style={{ ['--i' as string]: Math.min(i, 8) + 3 }}>
                  <button onClick={() => setOpenId(s.id)} className={`${tone ? 'rounded-[28px]' : 'k-card'} w-full text-left p-4 sm:p-6 flex flex-col h-full`} style={tone ? { background: 'var(--lime)', color: 'var(--on-lime)' } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-lg leading-tight min-w-0 break-words">{s.name}</p>
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: 'rgba(128,128,128,.22)' }}>{KIND_LABEL[s.kind]}</span>
                    </div>
                    <p className="text-sm opacity-70 mt-1 truncate">{s.phone || 'No phone saved'}</p>
                    <div className="grid grid-cols-3 gap-2 mt-5">
                      {[[s.kind === 'product' ? 'Cartons' : 'Buys', s.kind === 'product' ? t.cartons : t.count], ['Spent', inr(t.spent)], ['Last', dmy(t.last)]].map(([l, v]) => (
                        <div key={String(l)} className="rounded-2xl px-3 py-2" style={{ background: 'rgba(128,128,128,.16)' }}><p className="text-[11px] opacity-70">{l}</p><p className="font-bold tabular-nums text-sm sm:text-base truncate">{v}</p></div>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && <SupplierForm initial={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={(s) => { setForm(null); setOpenId(s.id); void load(); }} />}
      {open && !form && <SupplierDetail supplier={open} names={new Map(suppliers.map((x) => [x.id, x.name]))} purchases={byId.get(open.id) || []} onChanged={load} onEdit={() => setForm(open)} onDeleted={() => { setOpenId(null); void load(); }} onClose={() => setOpenId(null)} />}
      {report && <ReportSheet suppliers={suppliers} purchases={purchases} onClose={() => setReport(false)} />}
    </div>
  );
};
