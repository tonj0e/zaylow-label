import React, { useRef, useState } from 'react';
import { X, FileSpreadsheet, Loader2, Check, AlertTriangle } from 'lucide-react';
import { BulkImporterService } from '../../services/bulkImporter';
import { COD_BILLS_KEY, readCodBills } from '../../utils/codBillsStore';
import type { CodBill } from '../../utils/codBillsStore';

const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const find = (headers: string[], ...res: RegExp[]) => { for (const re of res) { const h = headers.find((x) => re.test(x)); if (h) return h; } return ''; };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Props { onClose: () => void; onSaved: () => void }

/** Reads the "COD Bills Report" Excel from India Post. Bills from several files are merged by invoice number. */
export const CodBillsModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [bills, setBills] = useState<CodBill[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = async (f: File | undefined | null) => {
    if (!f) return;
    setReading(true); setError(''); setFileName(f.name);
    try {
      const data = await BulkImporterService.parseFile(f);
      const h = data.headers;
      const cId = find(h, /invoice/i, /bill[\s_-]*id/i);
      const cDate = find(h, /bill[\s_-]*date/i);
      const cAmt = find(h, /bill[\s_-]*amount/i, /amount/i);
      const cStatus = find(h, /payment[\s_-]*status/i, /status/i);
      const cPaid = find(h, /payment[\s_-]*date/i);
      if (!cId || !cAmt || !cStatus) throw new Error('This does not look like the COD Bills Report. It needs the columns: invoice number, bill amount and payment status.');
      const list = data.rows.map((r): CodBill => ({
        id: String(r[cId] ?? '').trim(),
        date: cDate ? String(r[cDate] ?? '') : '',
        amount: num(r[cAmt]),
        status: String(r[cStatus] ?? '').trim(),
        paidOn: cPaid && String(r[cPaid] ?? '').trim() !== '—' ? String(r[cPaid]) : undefined,
      })).filter((b) => b.id);
      if (list.length === 0) throw new Error('No bills were found in this file.');
      setBills(list);
    } catch (e: any) {
      setError(e?.message || 'That file could not be read.');
      setBills(null);
    } finally {
      setReading(false);
    }
  };

  const remitted = (bills || []).filter((b) => /remit/i.test(b.status)).reduce((n, b) => n + b.amount, 0);
  const pending = (bills || []).filter((b) => !/remit/i.test(b.status)).reduce((n, b) => n + b.amount, 0);

  const save = () => {
    if (!bills) return;
    const existing = readCodBills();
    const merged = new Map<string, CodBill>((existing?.bills || []).map((b) => [b.id, b]));
    bills.forEach((b) => merged.set(b.id, b)); // the newer file wins for the same invoice
    try { localStorage.setItem(COD_BILLS_KEY, JSON.stringify({ importedAt: new Date().toISOString(), bills: [...merged.values()] })); } catch { /* storage unavailable */ }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(0,0,0,.6)' }} role="dialog" aria-modal="true" aria-label="Import COD bills" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="k-card w-full max-w-2xl shadow-2xl my-auto k-rise" style={{ ['--i' as string]: 0 }}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h3 className="text-2xl font-bold k-display">Import COD bills</h3>
            <p className="text-sm k-muted mt-1">On the India Post site open <strong>COD Bills Report</strong> and press <strong>Export to Excel</strong>. Drop that file here to see how much India Post has paid you and how much is still pending.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p role="alert" className="text-sm font-medium flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 k-bad" /> {error}</p>}
          {!bills ? (
            <div
              className="rounded-2xl text-center px-6 py-12 transition-colors"
              style={{ border: `2px dashed ${dragging ? 'var(--ink)' : 'var(--line)'}`, background: dragging ? 'var(--card2)' : undefined }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files?.[0]); }}
            >
              <span className="w-14 h-14 rounded-2xl k-card2 mx-auto flex items-center justify-center mb-3">{reading ? <Loader2 className="w-7 h-7 animate-spin" /> : <FileSpreadsheet className="w-7 h-7" />}</span>
              <p className="text-lg font-bold k-display">{reading ? 'Reading…' : 'Drop the COD Bills file here'}</p>
              <button onClick={() => input.current?.click()} disabled={reading} className="k-btn k-btn-ink px-6 py-3 text-sm mt-4">Choose a file</button>
              <input ref={input} type="file" accept=".csv,.xlsx,.xls" className="hidden" aria-label="Choose the COD Bills file" onChange={(e) => load(e.target.files?.[0])} />
            </div>
          ) : (
            <>
              <p className="text-sm"><span className="font-semibold">{fileName}</span> <span className="k-muted">· {bills.length} bills</span></p>
              <dl className="grid grid-cols-2 gap-3">
                <div className="k-card p-4"><dt className="text-xs k-muted">Paid to you (remitted)</dt><dd className="text-3xl font-bold k-display mt-1">{inr(remitted)}</dd><dd className="text-xs k-muted mt-1">{bills.filter((b) => /remit/i.test(b.status)).length} bills</dd></div>
                <div className="k-card p-4"><dt className="text-xs k-muted">Still pending</dt><dd className="text-3xl font-bold k-display mt-1">{inr(pending)}</dd><dd className="text-xs k-muted mt-1">{bills.filter((b) => !/remit/i.test(b.status)).length} bills</dd></div>
              </dl>
              <p className="text-xs k-muted">Saving adds these bills to the ones already imported in this browser. The same invoice is never counted twice.</p>
            </>
          )}
        </div>

        {bills && (
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button onClick={onClose} className="k-btn k-btn-ghost px-5 py-3 text-sm">Cancel</button>
            <button onClick={save} className="k-btn k-btn-lime px-6 py-3 text-sm"><Check className="w-4 h-4" /> Save {bills.length} bills</button>
          </div>
        )}
      </div>
    </div>
  );
};
