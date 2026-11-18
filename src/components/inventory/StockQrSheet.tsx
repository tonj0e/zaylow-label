import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, Search, X } from 'lucide-react';
import { supabase } from '../../services/supabase';

const db = supabase as any;

interface Unit { id: string; sku: string | null; product_name: string; carton_id: string | null }
interface CartonInfo { id: string; location: string | null }

const shortCode = (id: string) => id.slice(-6).toUpperCase();
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const skuNum = (s: string | null) => parseInt((s || '').replace(/\D/g, ''), 10) || 0;

/** Every unit of one product that is in stock right now, with its own QR code, grouped by carton. Read only. */
export const StockQrSheet: React.FC<{ productName: string; onClose: () => void }> = ({ productName, onClose }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cartons, setCartons] = useState<Record<string, CartonInfo>>({});
  const [qr, setQr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const rows: Unit[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error: e } = await db.from('inventory_items').select('id, sku, product_name, carton_id')
            .eq('status', 'In Stock').ilike('product_name', productName.replace(/[%_]/g, (m) => '\\' + m))
            .order('id').range(from, from + 999);
          if (e) throw e;
          rows.push(...((data || []) as Unit[]));
          if (!data || data.length < 1000) break;
        }
        const { data: cs, error: ce } = await db.from('cartons').select('id, location');
        if (ce) throw ce;
        const map: Record<string, CartonInfo> = {};
        ((cs || []) as CartonInfo[]).forEach((c) => { map[c.id] = c; });
        const urls: Record<string, string> = {};
        await Promise.all(rows.map(async (u) => { urls[u.id] = await QRCode.toDataURL(u.id, { width: 220, margin: 1, errorCorrectionLevel: 'H' }); }));
        if (dead) return;
        setUnits(rows); setCartons(map); setQr(urls);
      } catch (e: any) {
        if (!dead) setError(e?.message || 'Could not load the stock. Try again.');
      } finally { if (!dead) setLoading(false); }
    })();
    return () => { dead = true; };
  }, [productName]);

  const cartonName = (id: string | null) => {
    if (!id) return 'No carton';
    const c = cartons[id];
    return `${c?.location?.trim() || 'Carton'} · ${shortCode(id)}`;
  };

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = new Map<string, Unit[]>();
    units.filter((u) => !t || (u.sku || '').toLowerCase().includes(t) || shortCode(u.id).toLowerCase().includes(t)).forEach((u) => {
      const key = u.carton_id || 'none';
      m.set(key, [...(m.get(key) || []), u]);
    });
    return [...m.entries()]
      .map(([id, list]) => ({ id, name: cartonName(id === 'none' ? null : id), list: list.sort((a, b) => skuNum(a.sku) - skuNum(b.sku)) }))
      .sort((a, b) => b.list.length - a.list.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, cartons, q]);

  const shown = groups.reduce((s, g) => s + g.list.length, 0);

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const html = groups.map((g) => `
      <h2>${esc(g.name)} · ${g.list.length} in stock</h2>
      <div class="grid">${g.list.map((u) => `
        <div class="label">
          <div class="name">${esc(u.product_name)}</div>
          <img class="qr" src="${qr[u.id] || ''}" />
          <div class="sku">${esc(u.sku || shortCode(u.id))}</div>
          <div class="ct">${esc(g.name)}</div>
        </div>`).join('')}</div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${esc(productName)} stock QR codes</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;background:#fff;padding:5mm}
    h2{font-size:10pt;margin:6mm 0 3mm}.grid{display:flex;flex-wrap:wrap;gap:3mm}
    .label{width:42mm;padding:2mm;border:1px solid #000;text-align:center;page-break-inside:avoid}
    .name{font-size:7pt;font-weight:900;margin-bottom:1px}.qr{width:32mm;height:32mm;display:block;margin:0 auto}
    .sku{font-size:9pt;font-weight:900;margin-top:1px}.ct{font-size:5.5pt;color:#555}
    @media print{@page{margin:5mm}}</style></head><body>${html}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`${productName} stock QR codes`}>
      <button aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div className="k-card relative w-full sm:max-w-4xl max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-[28px]" style={{ background: 'var(--card)' }}>
        <div className="p-5 sm:p-7 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-bold k-display capitalize">{productName.toLowerCase()}: stock QR codes</h3>
            <p className="text-sm k-muted mt-0.5">{loading ? 'Loading…' : `${units.length} unit${units.length === 1 ? '' : 's'} in stock, by carton. Each QR is that unit's own code.`}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 sm:px-7 pb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 k-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a unit number" placeholder="Find a unit, for example PM-161" className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999 }} />
          </div>
          <button onClick={print} disabled={loading || shown === 0} className="k-btn k-btn-lime px-4 py-3 text-sm shrink-0"><Printer className="w-4 h-4" /> Print {shown}</button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-7 pb-6 flex-1">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin" /></div>
          ) : error ? (
            <p className="py-10 text-center k-bad">{error}</p>
          ) : shown === 0 ? (
            <p className="py-12 text-center k-muted">{units.length === 0 ? 'No unit of this product is in stock.' : 'No unit matches that number.'}</p>
          ) : groups.map((g) => (
            <section key={g.id} className="mt-4 first:mt-1">
              <h4 className="font-bold text-sm mb-2">{g.name} <span className="k-muted font-normal">· {g.list.length} in stock</span></h4>
              <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {g.list.map((u) => (
                  <li key={u.id} className="rounded-xl p-2 text-center" style={{ background: '#fff', color: '#0b0d0a' }}>
                    {qr[u.id] ? <img src={qr[u.id]} className="w-full aspect-square" alt={`QR code for ${u.sku || shortCode(u.id)}`} /> : <div className="w-full aspect-square" />}
                    <p className="text-[11px] font-bold mt-1 truncate">{u.sku || shortCode(u.id)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
