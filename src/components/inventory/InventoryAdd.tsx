import React, { useEffect, useRef, useState } from 'react';
import { PackagePlus, Check, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2, Loader2, Box } from 'lucide-react';
import { DataService } from '../../services/dataService';
import { invalidate } from '../../services/swrCache';

const EMPTY = {
  productName: '', sku: '', totalCartons: '', piecesPerCarton: '',
  pricePerPiece: '', freightCost: '', otherCharges: '',
  supplierName: '', supplierPhone: '', supplierGst: '', supplierAddress: '', invoiceNo: '', poNo: '',
};
type Form = typeof EMPTY;
type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

const STEPS = ['Product', 'Quantity', 'Cost', 'Supplier'] as const;
const MAX_BOXES = 48;

const money = (n: number, d = 2) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/* eases a number toward its target; instant when motion is reduced */
const useEased = (target: number, ms = 450) => {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); from.current = target; return; }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const val = start + (target - start) * (1 - Math.pow(1 - p, 3));
      setV(val); from.current = val;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="k-label">{label}</span>
    {children}
    {hint && <span className="block text-xs k-muted mt-1.5">{hint}</span>}
  </label>
);

export const InventoryAdd = () => {
  const [f, setF] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const set = (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [e.target.name]: e.target.value }));

  const cartons = parseInt(f.totalCartons) || 0;
  const perCarton = parseInt(f.piecesPerCarton) || 0;
  const pieces = cartons * perCarton;
  const price = parseFloat(f.pricePerPiece) || 0;
  const freight = parseFloat(f.freightCost) || 0;
  const other = parseFloat(f.otherCharges) || 0;
  const productCost = pieces * price;
  const total = productCost + freight + other;
  const perPiece = pieces > 0 ? total / pieces : 0;

  const ePer = useEased(perPiece);
  const eTotal = useEased(total);

  const valid = [
    f.productName.trim().length > 0,
    cartons >= 1 && perCarton >= 1,
    f.pricePerPiece !== '' && price >= 0,
    true,
  ];
  const canReach = (i: number) => valid.slice(0, i).every(Boolean);

  const show = (n: Notice) => {
    setNotice(n);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 8000);
  };

  const submit = async () => {
    if (saving || !valid.every(Boolean)) return;
    setSaving(true);
    try {
      const result = await DataService.addInventoryBatch({
        arrival_date: new Date().toISOString(),
        product_name: f.productName,
        total_pieces: pieces,
        landed_cost_per_piece: parseFloat(perPiece.toFixed(2)),
        pieces_per_carton: perCarton,
        price_per_piece: price,
        freight_cost: freight,
        other_charges: other,
        supplier_name: f.supplierName || null,
        supplier_phone: f.supplierPhone || null,
        supplier_gst: f.supplierGst || null,
        supplier_address: f.supplierAddress || null,
        invoice_no: f.invoiceNo || null,
        po_no: f.poNo || null,
        sku: f.sku || undefined,
        total_cartons: cartons || undefined,
      });
      if (result) {
        try {
          await DataService.createInventoryCartons(result.id, cartons, f.sku || null);
          show({ kind: 'ok', text: `Received ${pieces.toLocaleString('en-IN')} units of ${f.productName}. The cartons are ready for tracking.` });
        } catch (err) {
          console.error(err);
          show({ kind: 'warn', text: 'The batch was saved, but its carton records could not be created. Add the cartons from the Cartons page.' });
        }
        invalidate('inventory-overview');
        setF(EMPTY);
        setStep(0);
      } else {
        show({ kind: 'error', text: 'Nothing was saved. Check your connection and try again.' });
      }
    } catch (err) {
      console.error(err);
      show({ kind: 'error', text: 'Nothing was saved. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!valid[step]) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  const boxes = Math.min(cartons, MAX_BOXES);
  const last = step === STEPS.length - 1;

  return (
    <div className="kdash min-h-full p-3 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="k-rise flex items-center gap-4" style={{ ['--i' as string]: 0 }}>
          <span className="w-12 h-12 rounded-2xl k-btn-lime flex items-center justify-center shrink-0"><PackagePlus className="w-6 h-6" /></span>
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold leading-none k-display">Receive inventory</h2>
            <p className="text-sm k-muted mt-1.5">Four short steps. The delivery note on the right fills in as you go.</p>
          </div>
        </header>

        {notice && (
          <div role="status" className="k-card px-4 py-3 flex items-start gap-3 text-sm font-medium">
            {notice.kind === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0 k-lime-text" /> : <AlertTriangle className={`w-5 h-5 shrink-0 ${notice.kind === 'warn' ? 'k-warn' : 'k-bad'}`} />}
            <span>{notice.text}</span>
          </div>
        )}

        {/* step track */}
        <ol className="k-rise flex items-center gap-2 overflow-x-auto" style={{ ['--i' as string]: 1 }} aria-label="Steps">
          {STEPS.map((name, i) => {
            const done = i < step && valid[i];
            const on = i === step;
            return (
              <li key={name} className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!canReach(i)}
                  onClick={() => setStep(i)}
                  aria-current={on ? 'step' : undefined}
                  className="flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
                  style={{ background: on ? 'var(--ink)' : 'var(--card)', color: on ? 'var(--bg)' : 'var(--ink)', border: '1px solid var(--line)' }}
                >
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: done ? 'var(--lime)' : on ? 'var(--bg)' : 'var(--card2)', color: done ? 'var(--on-lime)' : on ? 'var(--ink)' : 'var(--muted)' }}>
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </span>
                  {name}{i === 3 && <span className="font-normal opacity-60"> (optional)</span>}
                </button>
                {i < STEPS.length - 1 && <span className="w-6 h-px k-rule border-t" aria-hidden />}
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 items-start">
          {/* stage */}
          <form
            className="lg:col-span-7 k-card p-5 md:p-7 k-rise"
            style={{ ['--i' as string]: 2 }}
            onSubmit={(e) => { e.preventDefault(); next(); }}
          >
            <div key={step} className="tab-panel space-y-5 min-h-[260px]">
              {step === 0 && (
                <>
                  <h3 className="text-2xl font-bold k-display">What did you receive?</h3>
                  <Field label="Product name">
                    <input className="k-field text-lg" style={{ padding: '1rem 1.1rem', fontSize: '1.1rem' }} name="productName" value={f.productName} onChange={set} autoFocus placeholder="e.g. Period massager premium" />
                  </Field>
                  <Field label="SKU or model number" hint="Used to number each unit. You can leave it blank.">
                    <input className="k-field" name="sku" value={f.sku} onChange={set} placeholder="e.g. PM-PRM" />
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <h3 className="text-2xl font-bold k-display">How many came in?</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cartons">
                      <input className="k-field" style={{ padding: '1rem 1.1rem', fontSize: '1.5rem', fontWeight: 700 }} type="number" min="1" name="totalCartons" value={f.totalCartons} onChange={set} autoFocus placeholder="0" />
                    </Field>
                    <Field label="Pieces in each carton">
                      <input className="k-field" style={{ padding: '1rem 1.1rem', fontSize: '1.5rem', fontWeight: 700 }} type="number" min="1" name="piecesPerCarton" value={f.piecesPerCarton} onChange={set} placeholder="0" />
                    </Field>
                  </div>
                  <p className="text-sm k-muted">{pieces > 0 ? `${cartons} × ${perCarton} = ${pieces.toLocaleString('en-IN')} units` : 'The carton boxes below fill in as you type.'}</p>
                </>
              )}
              {step === 2 && (
                <>
                  <h3 className="text-2xl font-bold k-display">What did it cost?</h3>
                  <Field label="Price per piece (₹)">
                    <input className="k-field" style={{ padding: '1rem 1.1rem', fontSize: '1.5rem', fontWeight: 700 }} type="number" step="0.01" min="0" name="pricePerPiece" value={f.pricePerPiece} onChange={set} autoFocus placeholder="0.00" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Freight (₹)"><input className="k-field" type="number" step="0.01" min="0" name="freightCost" value={f.freightCost} onChange={set} placeholder="0.00" /></Field>
                    <Field label="Other charges (₹)"><input className="k-field" type="number" step="0.01" min="0" name="otherCharges" value={f.otherCharges} onChange={set} placeholder="0.00" /></Field>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <h3 className="text-2xl font-bold k-display">Who sent it?</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><Field label="Supplier name"><input className="k-field" name="supplierName" value={f.supplierName} onChange={set} autoFocus /></Field></div>
                    <Field label="Phone"><input className="k-field" name="supplierPhone" value={f.supplierPhone} onChange={set} placeholder="+91" /></Field>
                    <Field label="GSTIN"><input className="k-field" name="supplierGst" value={f.supplierGst} onChange={set} /></Field>
                    <div className="sm:col-span-2"><Field label="Address"><input className="k-field" name="supplierAddress" value={f.supplierAddress} onChange={set} /></Field></div>
                    <Field label="Invoice number"><input className="k-field" name="invoiceNo" value={f.invoiceNo} onChange={set} /></Field>
                    <Field label="PO number"><input className="k-field" name="poNo" value={f.poNo} onChange={set} /></Field>
                  </div>
                </>
              )}
            </div>

            {/* carton boxes */}
            <div className="mt-6 pt-5 border-t k-rule">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Box className="w-4 h-4 k-lime-text" /> {cartons > 0 ? `${cartons} carton${cartons === 1 ? '' : 's'}` : 'No cartons yet'}</p>
              {cartons > 0 ? (
                <ul className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))' }} aria-hidden>
                  {Array.from({ length: boxes }).map((_, i) => (
                    <li
                      key={i}
                      className="h-12 rounded-xl flex items-center justify-center text-xs font-bold"
                      style={{ background: 'color-mix(in srgb, var(--lime) 18%, var(--card2))', border: '1px solid color-mix(in srgb, var(--lime) 40%, var(--line))', animation: `kRise .35s cubic-bezier(.22,1,.36,1) both`, animationDelay: `${Math.min(i, 18) * 18}ms` }}
                    >
                      {perCarton > 0 ? `×${perCarton}` : ''}
                    </li>
                  ))}
                  {cartons > MAX_BOXES && <li className="h-12 rounded-xl flex items-center justify-center text-xs font-semibold k-muted">+{cartons - MAX_BOXES}</li>}
                </ul>
              ) : (
                <p className="text-sm k-muted">Set the number of cartons in step 2 and they appear here.</p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="k-btn k-btn-ghost px-5 py-3 text-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button type="submit" disabled={!valid[step] || saving} className="k-btn k-btn-lime px-7 py-3 text-sm" style={{ boxShadow: '0 10px 28px -10px var(--lime)' }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : last ? <>Receive {pieces > 0 ? pieces.toLocaleString('en-IN') : ''} units <Check className="w-4 h-4" /></> : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </form>

          {/* delivery note */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24 k-rise" style={{ ['--i' as string]: 3 }} aria-live="polite">
            <div className="k-card overflow-hidden">
              <div className="px-6 pt-6 pb-5">
                <p className="text-sm k-muted">Delivery note</p>
                <p className="text-xl font-bold mt-1 truncate">{f.productName.trim() || 'New delivery'}</p>
                {f.sku && <p className="font-mono text-xs k-muted mt-0.5">{f.sku}</p>}
              </div>
              <div className="border-t border-dashed k-rule mx-6" />
              <dl className="px-6 py-4 text-sm space-y-2.5">
                <div className="flex justify-between"><dt className="k-muted">Cartons × pieces</dt><dd className="font-semibold">{cartons || 0} × {perCarton || 0}</dd></div>
                <div className="flex justify-between"><dt className="k-muted">Total units</dt><dd className="font-semibold">{pieces.toLocaleString('en-IN')}</dd></div>
                <div className="flex justify-between"><dt className="k-muted">Price per piece</dt><dd className="font-semibold">{money(price)}</dd></div>
                <div className="flex justify-between"><dt className="k-muted">Product cost</dt><dd className="font-semibold">{money(productCost)}</dd></div>
                <div className="flex justify-between"><dt className="k-muted">Freight</dt><dd className="font-semibold">{money(freight)}</dd></div>
                <div className="flex justify-between"><dt className="k-muted">Other charges</dt><dd className="font-semibold">{money(other)}</dd></div>
              </dl>
              <div className="border-t border-dashed k-rule mx-6" />
              <div className="px-6 py-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm k-muted">Total landed cost</p>
                  <p className="text-2xl font-bold k-display mt-0.5">{money(eTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm k-muted">Per piece</p>
                  <p className="text-4xl font-bold k-display mt-0.5">{money(ePer)}</p>
                </div>
              </div>
              <div className="h-1.5 k-bar" style={{ opacity: pieces > 0 ? 1 : 0.25, transition: 'opacity .3s' }} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
