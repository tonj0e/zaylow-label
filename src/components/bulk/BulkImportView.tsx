import React, { useRef, useState } from 'react';
import type { Order, CompanySettings } from '../../types';
import { BulkImporterService } from '../../services/bulkImporter';
import type { ParsedSpreadsheet, ColumnMapping } from '../../services/bulkImporter';
import { UploadCloud, FileSpreadsheet, Check, AlertTriangle, Loader2, ArrowRight, X, Download, ListChecks } from 'lucide-react';

interface BulkImportViewProps {
  settings: CompanySettings;
  onImportComplete: (importedOrders: Order[]) => void;
}

interface FieldDef { key: keyof ColumnMapping; label: string; required?: boolean; fallback?: string }

const FIELDS: FieldDef[] = [
  { key: 'orderId', label: 'Order ID', required: true, fallback: 'A new ID is made for each row' },
  { key: 'customerName', label: 'Customer name', required: true },
  { key: 'phone', label: 'Phone number', required: true },
  { key: 'addressLine', label: 'Address', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'pinCode', label: 'PIN code', required: true },
  { key: 'landmark', label: 'Landmark' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'productName', label: 'Product name' },
  { key: 'sku', label: 'SKU' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'weightKg', label: 'Weight (kg)' },
  { key: 'courier', label: 'Courier' },
  { key: 'paymentType', label: 'Payment type' },
  { key: 'codAmount', label: 'COD amount' },
];

const STEPS = ['Upload', 'Match columns', 'Create orders'] as const;

const TEMPLATE_HEADERS = ['Order ID', 'Customer Name', 'Phone', 'Address', 'Landmark', 'City', 'District', 'State', 'PIN Code', 'Product', 'SKU', 'Quantity', 'Weight (kg)', 'Courier', 'Payment Type', 'COD Amount'];
const TEMPLATE_ROW = ['ZYL-100001', 'Asha Nair', '9876543210', '12 Lake Road', 'Near temple', 'Kochi', 'Ernakulam', 'Kerala', '682001', 'Period massager premium', 'PM-PRM', '1', '0.5', 'India Post', 'COD', '600'];

const downloadTemplate = () => {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_ROW].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'zaylow-order-template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export const BulkImportView: React.FC<BulkImportViewProps> = ({ settings, onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setBusy(true);
    setError('');
    try {
      const data = await BulkImporterService.parseFile(f);
      setParsed(data);
      setMapping(BulkImporterService.autoDetectMapping(data.headers));
    } catch (err: any) {
      setError(err.message || 'That file could not be read. Check that it is a .xlsx or .csv sheet.');
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setParsed(null); setFile(null); setMapping(null); setError(''); if (inputRef.current) inputRef.current.value = ''; };

  const create = () => {
    if (!parsed || !mapping) return;
    setBusy(true);
    try {
      onImportComplete(BulkImporterService.convertRowsToOrders(parsed.rows, mapping, settings.defaultCourier, settings.defaultPaymentType));
    } catch (err: any) {
      setError('Orders could not be created from this file: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const matched = mapping ? FIELDS.filter((f) => mapping[f.key]) : [];
  const missingRequired = mapping ? FIELDS.filter((f) => f.required && !mapping[f.key] && f.key !== 'orderId') : [];
  const step = parsed ? 1 : 0;

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="space-y-5">
        <header className="k-rise flex items-center gap-4" style={{ ['--i' as string]: 0 }}>
          <span className="w-12 h-12 rounded-2xl k-card flex items-center justify-center shrink-0"><UploadCloud className="w-6 h-6" /></span>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Bulk import</h2>
            <p className="text-sm k-muted mt-1.5">Turn an Excel or CSV sheet into orders and labels in one go.</p>
          </div>
        </header>

        <ol className="k-rise flex items-center gap-2 overflow-x-auto" style={{ ['--i' as string]: 1 }} aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name} className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 text-sm font-semibold" style={{ background: i === step ? 'var(--ink)' : 'var(--card)', color: i === step ? 'var(--bg)' : 'var(--ink)', border: '1px solid var(--line)', opacity: i > step ? 0.5 : 1 }} aria-current={i === step ? 'step' : undefined}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i < step ? 'var(--lime)' : i === step ? 'var(--bg)' : 'var(--card2)', color: i < step ? 'var(--on-lime)' : i === step ? 'var(--ink)' : 'var(--muted)' }}>
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                {name}
              </span>
              {i < STEPS.length - 1 && <span className="w-6 border-t k-rule" aria-hidden />}
            </li>
          ))}
        </ol>

        {error && (
          <div role="alert" className="k-card px-4 py-3 flex items-start gap-3 text-sm font-medium">
            <AlertTriangle className="w-5 h-5 shrink-0 k-bad" /> <span>{error}</span>
          </div>
        )}

        {!parsed && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5 items-stretch">
            <section
              className="xl:col-span-8 k-card k-rise flex flex-col items-center justify-center text-center px-6 py-20 transition-colors min-h-[420px]"
              style={{ ['--i' as string]: 2, borderStyle: 'dashed', borderWidth: 2, borderColor: dragging ? 'var(--ink)' : 'var(--line)', background: dragging ? 'var(--card2)' : undefined }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
            >
              <span className="w-20 h-20 rounded-3xl k-card2 flex items-center justify-center mb-5">
                {busy ? <Loader2 className="w-9 h-9 animate-spin" /> : <FileSpreadsheet className="w-9 h-9" />}
              </span>
              <h3 className="text-2xl font-bold k-display">{busy ? 'Reading your sheet…' : 'Drop your order sheet here'}</h3>
              <p className="text-sm k-muted mt-2 max-w-md">Works with .xlsx, .xls and .csv files, including exports from Shopify, WooCommerce and Shiprocket.</p>
              <button onClick={() => inputRef.current?.click()} disabled={busy} className="k-btn k-btn-ink mt-6 px-7 py-3 text-sm">Choose a file</button>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" aria-label="Choose an order sheet" />
            </section>

            <aside className="xl:col-span-4 space-y-4 md:space-y-5">
              <div className="k-card p-5 md:p-6 k-rise" style={{ ['--i' as string]: 3 }}>
                <h3 className="text-xl font-bold k-display flex items-center gap-2"><ListChecks className="w-5 h-5" /> What your sheet needs</h3>
                <p className="text-sm k-muted mt-1 mb-4">One row per order, with the column names in the first row.</p>
                <ul className="space-y-2.5 text-sm">
                  {FIELDS.filter((f) => f.required).map((f) => (
                    <li key={f.key} className="flex items-center gap-3"><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--ink)' }} />{f.label}</li>
                  ))}
                </ul>
                <p className="text-xs k-muted mt-4">Product, quantity, courier, payment type and COD amount are optional. Anything missing gets a placeholder on the label.</p>
                <button onClick={downloadTemplate} className="k-btn k-btn-soft w-full mt-5 py-3 text-sm"><Download className="w-4 h-4" /> Download a template sheet</button>
              </div>

              <div className="k-card p-5 md:p-6 k-rise" style={{ ['--i' as string]: 4 }}>
                <h3 className="text-xl font-bold k-display mb-3">Before you import</h3>
                <ol className="space-y-3 text-sm k-muted list-decimal pl-5">
                  <li>Check that phone numbers are 10 digits and PIN codes are 6 digits.</li>
                  <li>Use your own order numbers, or leave the column empty and new ones are made.</li>
                  <li>Stock is not reserved by bulk import. Scan the products when you pack.</li>
                </ol>
              </div>
            </aside>
          </div>
        )}

        {parsed && mapping && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 items-start">
            <section className="lg:col-span-8 xl:col-span-9 space-y-4 md:space-y-5">
              <div className="k-card p-5 md:p-6 k-rise k-hot" style={{ ['--i' as string]: 2 }}>
                <h3 className="text-2xl font-bold k-display">Match your columns</h3>
                <p className="text-sm k-muted mb-5">We matched what we could. Check each field and fix any that look wrong.</p>
                {(['required', 'optional'] as const).map((group) => (
                  <div key={group} className="mb-5 last:mb-0">
                    <p className="text-xs font-semibold k-muted mb-2">{group === 'required' ? 'Needed on every label' : 'Optional'}</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                      {FIELDS.filter((f) => !!f.required === (group === 'required')).map((f) => {
                        const value = mapping[f.key] || '';
                        const ok = !!value;
                        return (
                          <li key={f.key} className="rounded-2xl k-card2 p-3">
                            <label className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-sm font-semibold">{f.label}</span>
                              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: ok ? 'var(--lime-text)' : f.required ? 'var(--warn)' : 'var(--muted)' }}>
                                {ok ? <><Check className="w-3.5 h-3.5" /> Matched</> : f.required ? <><AlertTriangle className="w-3.5 h-3.5" /> Not matched</> : 'Skipped'}
                              </span>
                            </label>
                            <select aria-label={f.label} value={value} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })} className="k-field" style={{ padding: '.5rem .8rem', borderRadius: 12 }}>
                              <option value="">Skip this field</option>
                              {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="k-card p-5 md:p-6 k-rise" style={{ ['--i' as string]: 3 }}>
                <h3 className="text-xl font-bold k-display mb-3">First rows of your sheet</h3>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>{parsed.headers.map((h) => <th key={h} className="px-3 py-2 font-semibold k-muted whitespace-nowrap border-b k-rule">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 4).map((row, i) => (
                        <tr key={i}>{parsed.headers.map((h) => <td key={h} className="px-3 py-2 border-t k-rule truncate max-w-[160px] font-mono">{String(row[h] ?? '')}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-24 k-card p-5 md:p-6 k-rise" style={{ ['--i' as string]: 3 }} aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm k-muted">Your file</p>
                  <p className="font-semibold truncate">{file?.name}</p>
                </div>
                <button onClick={reset} aria-label="Choose a different file" className="k-btn k-btn-ghost w-9 h-9 shrink-0"><X className="w-4 h-4" /></button>
              </div>

              <p className="text-5xl font-bold k-display mt-5 leading-none">{parsed.totalRows.toLocaleString('en-IN')}</p>
              <p className="text-sm k-muted mt-1">orders found · {parsed.headers.length} columns</p>

              <div className="mt-5">
                <div className="h-2 rounded-full k-track overflow-hidden"><div className="h-full k-bar" style={{ width: `${(matched.length / FIELDS.length) * 100}%`, transition: 'width .4s' }} /></div>
                <p className="text-xs k-muted mt-2">{matched.length} of {FIELDS.length} fields matched</p>
              </div>

              {missingRequired.length > 0 && (
                <div className="mt-4 rounded-2xl k-card2 p-3 text-sm">
                  <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 k-warn" /> Not matched: {missingRequired.map((f) => f.label).join(', ')}</p>
                  <p className="text-xs k-muted mt-1">These get a placeholder value on the label, such as PIN 000000. Match them if your sheet has them.</p>
                </div>
              )}

              <button onClick={create} disabled={busy} className="k-btn k-btn-lime w-full mt-6 py-3.5 text-sm" style={{ boxShadow: '0 10px 28px -10px var(--lime)' }}>
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <>Create {parsed.totalRows.toLocaleString('en-IN')} orders <ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-xs k-muted mt-3">Each order is added with its label. Stock is not reserved by bulk import.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
