import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw, Plus, Phone, X, FileDown, Paperclip, Trash2, Pencil, Store, Download, Loader2, Box, Link2, Phone as PhoneIcon } from 'lucide-react';
import {
  SupplierService, KIND_LABEL, friendlyError, totalsFor,
  type Supplier, type Purchase, type SupplierKind, type SupplierCarton,
} from '../../services/supplierService';

const KINDS = Object.keys(KIND_LABEL) as SupplierKind[];
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dmy = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const dmyShort = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');
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
const SupplierForm: React.FC<{ initial?: Supplier; kind?: SupplierKind; onSaved: (s: Supplier) => void; onClose: () => void }> = ({ initial, kind: startKind, onSaved, onClose }) => {
  const [f, setF] = useState({
    name: initial?.name || '', kind: (initial?.kind || startKind || 'product') as SupplierKind, phone: initial?.phone || '', address: initial?.address || '',
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
const TONE: Record<SupplierKind, { bg: string; fg: string }> = {
  product: { bg: 'var(--lime)', fg: 'var(--on-lime)' },
  box: { bg: 'var(--ink)', fg: 'var(--bg)' },
  cover: { bg: 'var(--card2)', fg: 'var(--ink)' },
  other: { bg: 'var(--card2)', fg: 'var(--muted)' },
};
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const STARTERS: { kind: SupplierKind; title: string; hint: string }[] = [
  { kind: 'product', title: 'Product supplier', hint: 'Massagers and other stock' },
  { kind: 'box', title: 'Packing box seller', hint: 'Boxes and cartons' },
  { kind: 'cover', title: 'Packing cover seller', hint: 'Covers and bags' },
  { kind: 'other', title: 'Shop or other', hint: 'Anything else you buy' },
];

export const SuppliersView: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cartons, setCartons] = useState<SupplierCarton[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<SupplierKind | 'all'>('all');
  const [form, setForm] = useState<Supplier | 'new' | null>(null);
  const [startKind, setStartKind] = useState<SupplierKind | undefined>(undefined);
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
    // unsold cartons per supplier: nice to have, never blocks the page (the carton link may not be set up yet)
    SupplierService.cartons().then((c) => { if (alive.current) setCartons(c); }).catch(() => { if (alive.current) setCartons(null); });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, Purchase[]>();
    purchases.forEach((p) => m.set(p.supplier_id, [...(m.get(p.supplier_id) || []), p]));
    return m;
  }, [purchases]);
  const unsold = useMemo(() => {
    const m = new Map<string, { cartons: number; units: number }>();
    (cartons || []).forEach((c) => { if (!c.supplier_id || c.inStock <= 0) return; const e = m.get(c.supplier_id) || { cartons: 0, units: 0 }; e.cartons++; e.units += c.inStock; m.set(c.supplier_id, e); });
    return m;
  }, [cartons]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => (kind === 'all' || s.kind === kind) && (!q || [s.name, s.phone, s.address, s.gst].some((v) => (v || '').toLowerCase().includes(q))));
  }, [suppliers, search, kind]);

  const all = totalsFor(purchases);
  const unsoldTotal = [...unsold.values()].reduce((n, e) => n + e.cartons, 0);
  const open = suppliers.find((s) => s.id === openId) || null;
  const count = (k: SupplierKind | 'all') => (k === 'all' ? suppliers.length : suppliers.filter((s) => s.kind === k).length);
  const add = (k?: SupplierKind) => { setStartKind(k); setForm('new'); };

  // where the money went: the biggest suppliers by spend, as shares of the total
  const share = useMemo(() => {
    const rows = suppliers.map((s) => ({ id: s.id, name: s.name, spent: totalsFor(byId.get(s.id) || []).spent })).filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
    const top = rows.slice(0, 3);
    const rest = rows.slice(3).reduce((n, r) => n + r.spent, 0);
    return rest > 0 ? [...top, { id: 'rest', name: 'Others', spent: rest }] : top;
  }, [suppliers, byId]);
  const SHADES = ['rgba(4,33,15,.92)', 'rgba(4,33,15,.62)', 'rgba(4,33,15,.38)', 'rgba(4,33,15,.2)'];

  const empty = !loading && suppliers.length === 0 && !error;

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 pb-28 md:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="k-rise space-y-3" style={{ ['--i' as string]: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[34px] sm:text-5xl font-bold leading-none k-display tracking-tight">Suppliers</h2>
              <p className="text-sm k-muted mt-2">{suppliers.length ? `${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'} saved` : 'Everyone you buy from, and what you paid.'}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={load} disabled={loading} aria-label="Refresh" className="k-btn k-btn-ghost w-11 h-11"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              <button onClick={() => setReport(true)} aria-label="Report" className="k-btn k-btn-ghost h-11 px-3.5 sm:px-4"><FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Report</span></button>
              <button onClick={() => add()} className="k-btn k-btn-lime h-11 px-4 sm:px-5"><Plus className="w-4 h-4" /> <span><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add supplier</span></span></button>
            </div>
          </div>
          {!empty && (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppliers" placeholder="Search name, phone, GST" className="k-field !rounded-full !h-12" style={{ paddingLeft: '2.8rem' }} />
            </div>
          )}
        </header>

        {error && <div role="alert" className="k-card p-4 text-sm k-bad">{error}</div>}

        {empty ? (
          <section className="k-card rounded-[28px] p-6 sm:p-10 text-center k-rise" style={{ ['--i' as string]: 1 }}>
            <span className="w-20 h-20 rounded-full grid place-items-center mx-auto" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}><Store className="w-9 h-9" aria-hidden="true" /></span>
            <h3 className="text-3xl sm:text-4xl font-bold k-display tracking-tight mt-5">Who do you buy from?</h3>
            <p className="text-sm sm:text-base k-muted mt-2 max-w-md mx-auto">Save each supplier once. Then add what you bought, the price per carton and the bill, and see where your money goes.</p>
            <div className="grid grid-cols-2 gap-3 mt-7 max-w-xl mx-auto text-left">
              {STARTERS.map((st) => (
                <button key={st.kind} type="button" onClick={() => add(st.kind)} className="k-card2 rounded-3xl p-4 min-h-[96px] flex flex-col justify-between hover:opacity-90 active:scale-[.98] transition">
                  <span className="w-9 h-9 rounded-xl grid place-items-center" style={st.kind === 'cover' || st.kind === 'other' ? { background: 'var(--card)', color: 'var(--ink)' } : { background: TONE[st.kind].bg, color: TONE[st.kind].fg }}><Plus className="w-4 h-4" aria-hidden="true" /></span>
                  <span><span className="block font-bold text-[15px] leading-tight">{st.title}</span><span className="block text-xs k-muted mt-0.5">{st.hint}</span></span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {/* hero: the one big number, and where it went */}
            <section className="grid gap-3 md:gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] k-rise" style={{ ['--i' as string]: 1 }} aria-label="Summary">
              <div className="rounded-[28px] p-5 sm:p-7 flex flex-col justify-between min-h-[190px]" style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}>
                <div>
                  <p className="text-sm font-semibold opacity-80">Money spent on suppliers</p>
                  <p className="text-5xl sm:text-6xl font-bold k-display tabular-nums leading-none mt-2 tracking-tight">{inr(all.spent)}</p>
                </div>
                {share.length > 0 ? (
                  <div className="mt-6">
                    <div className="flex h-3 rounded-full overflow-hidden gap-[3px]" role="img" aria-label={`Share of spending: ${share.map((r) => `${r.name} ${Math.round((r.spent / (all.spent || 1)) * 100)} percent`).join(', ')}`}>
                      {share.map((r, i) => <span key={r.id} style={{ width: `${(r.spent / (all.spent || 1)) * 100}%`, background: SHADES[i], minWidth: 6 }} className="rounded-full" />)}
                    </div>
                    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                      {share.map((r, i) => <li key={r.id} className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SHADES[i] }} aria-hidden="true" /><span className="truncate">{r.name}</span><span className="ml-auto font-semibold tabular-nums">{Math.round((r.spent / (all.spent || 1)) * 100)}%</span></li>)}
                    </ul>
                  </div>
                ) : <p className="text-sm opacity-80 mt-6">Add a purchase to see where the money goes.</p>}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-1 gap-3 md:gap-4">
                {([['Suppliers', suppliers.length, 'saved'], ['Cartons bought', all.cartons, 'all time'], ['Unsold cartons', cartons === null ? '–' : unsoldTotal, cartons === null ? 'link cartons first' : 'still in stock']] as const).map(([l, v, h]) => (
                  <div key={l} className="k-card rounded-3xl p-3.5 sm:p-5 md:flex md:items-center md:justify-between md:gap-4">
                    <div><p className="text-xs sm:text-sm k-muted leading-tight">{l}</p><p className="text-[11px] k-muted opacity-70 hidden md:block">{h}</p></div>
                    <p className="text-2xl sm:text-4xl font-bold k-display tabular-nums mt-1 md:mt-0">{v}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1 k-rise -mx-3 px-3 sm:mx-0 sm:px-0" style={{ ['--i' as string]: 2, scrollbarWidth: 'none' }} role="group" aria-label="Filter by type">
              {(['all', ...KINDS] as const).map((k) => <button key={k} className="k-chip shrink-0" style={{ minHeight: 44 }} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : KIND_LABEL[k]} <span className="opacity-60">· {count(k)}</span></button>)}
            </div>

            {loading && suppliers.length === 0 ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="k-card k-skel h-44" />)}</div>
            ) : shown.length === 0 ? (
              <div className="k-card p-8 text-center"><p className="font-semibold">No supplier matches.</p><p className="text-sm k-muted mt-1">Clear the search or pick another type.</p></div>
            ) : (
              <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {shown.map((s, i) => {
                  const t = totalsFor(byId.get(s.id) || []);
                  const u = unsold.get(s.id);
                  const tone = TONE[s.kind];
                  const stats: [string, string | number][] = s.kind === 'product'
                    ? [['Cartons', t.cartons], ['Spent', inr(t.spent)], ['Unsold', cartons === null ? '–' : u ? u.cartons : 0]]
                    : [['Buys', t.count], ['Spent', inr(t.spent)], ['Last', dmyShort(t.last)]];
                  return (
                    <li key={s.id} className="k-rise" style={{ ['--i' as string]: Math.min(i, 8) + 3 }}>
                      <article className="k-card rounded-3xl p-4 sm:p-5 relative h-full flex flex-col gap-4">
                        <button type="button" onClick={() => setOpenId(s.id)} aria-label={`Open ${s.name}`} className="absolute inset-0 rounded-3xl" />
                        <div className="flex items-center gap-3 relative pointer-events-none">
                          <span className="w-12 h-12 rounded-full grid place-items-center font-bold text-[15px] shrink-0" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">{initials(s.name)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[17px] leading-tight truncate">{s.name}</p>
                            <p className="text-xs k-muted mt-0.5 truncate">{KIND_LABEL[s.kind]}{s.phone ? ` · ${s.phone}` : ''}</p>
                          </div>
                          {s.phone && <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${s.name}`} className="k-btn k-btn-soft w-11 h-11 rounded-full shrink-0 pointer-events-auto relative z-10"><PhoneIcon className="w-4 h-4" /></a>}
                        </div>
                        <dl className="grid grid-cols-3 gap-2 mt-auto relative pointer-events-none">
                          {stats.map(([l, v]) => (
                            <div key={l} className="k-card2 rounded-2xl px-3 py-2.5 min-w-0"><dt className="text-[11px] k-muted">{l}</dt><dd className="font-bold tabular-nums text-[15px] truncate">{v}</dd></div>
                          ))}
                        </dl>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {form && <SupplierForm initial={form === 'new' ? undefined : form} kind={form === 'new' ? startKind : undefined} onClose={() => setForm(null)} onSaved={(s) => { setForm(null); setOpenId(s.id); void load(); }} />}
      {open && !form && <SupplierDetail supplier={open} names={new Map(suppliers.map((x) => [x.id, x.name]))} purchases={byId.get(open.id) || []} onChanged={load} onEdit={() => setForm(open)} onDeleted={() => { setOpenId(null); void load(); }} onClose={() => setOpenId(null)} />}
      {report && <ReportSheet suppliers={suppliers} purchases={purchases} onClose={() => setReport(false)} />}
    </div>
  );
};
