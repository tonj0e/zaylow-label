import React, { useEffect, useMemo, useState } from 'react';
import { Search, Store, Check, X } from 'lucide-react';
import { SupplierService, KIND_LABEL, friendlyError, type Supplier } from '../../services/supplierService';

/** Search the saved suppliers and pick one (or none). */
export const SupplierPicker: React.FC<{ value: string | null; onChange: (id: string | null) => void; label?: string }> = ({ value, onChange, label = 'Supplier' }) => {
  const [list, setList] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    SupplierService.list().then((l) => { if (alive) setList(l); }).catch((e) => { if (alive) setErr(friendlyError(e)); });
    return () => { alive = false; };
  }, []);
  const current = list.find((s) => s.id === value);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter((s) => !t || s.name.toLowerCase().includes(t) || (s.phone || '').includes(t));
  }, [list, q]);
  const pick = (id: string | null) => { onChange(id); setOpen(false); setQ(''); };
  return (
    <div className="space-y-2">
      <span className="k-label">{label}</span>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="k-field flex items-center gap-2 text-left w-full">
        <Store className="w-4 h-4 k-muted shrink-0" />
        <span className={`flex-1 truncate ${current ? '' : 'k-muted'}`}>{current ? current.name : 'No supplier'}</span>
        <span className="text-xs k-muted">{open ? 'Close' : 'Change'}</span>
      </button>
      {open && (
        <div className="k-card2 rounded-2xl p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier name or phone" aria-label="Search suppliers" className="k-field" style={{ paddingLeft: '2.4rem' }} autoFocus />
          </div>
          {err && <p role="alert" className="text-sm k-bad">{err}</p>}
          <ul className="max-h-52 overflow-y-auto space-y-1">
            <li><button type="button" onClick={() => pick(null)} className="w-full text-left text-sm px-3 py-2 rounded-xl flex items-center gap-2 hover:opacity-80">{!value && <Check className="w-4 h-4" />}<X className="w-4 h-4 k-muted" /> No supplier</button></li>
            {shown.map((s) => (
              <li key={s.id}><button type="button" onClick={() => pick(s.id)} className="w-full text-left text-sm px-3 py-2 rounded-xl flex items-center gap-2 hover:opacity-80">
                {value === s.id ? <Check className="w-4 h-4" /> : <span className="w-4" />}
                <span className="flex-1 truncate font-medium">{s.name}</span><span className="text-xs k-muted shrink-0">{KIND_LABEL[s.kind]}</span>
              </button></li>
            ))}
            {!err && shown.length === 0 && <li className="text-sm k-muted px-3 py-2">{list.length === 0 ? 'No suppliers saved yet. Add one in Suppliers.' : 'No supplier matches.'}</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
