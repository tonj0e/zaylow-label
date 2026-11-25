import { PriceService } from '../../services/priceService';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Settings as Cog, X, Trash2, Megaphone, FileSpreadsheet } from 'lucide-react';
import { BulkImporterService } from '../../services/bulkImporter';
import { detectColumns, cleanArticle, looksLikeArticle } from '../../utils/bookingMatcher';
import type { Order } from '../../types';
import {
  AdsService, adsError, buildStats, dailySpend, weekKey, monthKey, DEFAULT_SETTINGS, SETTING_LABEL,
  type Fund, type BalanceRow, type Settings, type DayStat, type OrderGap,
} from '../../services/adsService';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const per = (a: number, b: number) => (a > 0 && b > 0 ? inr(a / b) : '—');

type Range = 'day' | 'week' | 'month';

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
    <button aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
    <div className="k-card relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[28px] p-5 sm:p-7" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-xl font-bold k-display">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="k-btn k-btn-ghost w-10 h-10"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: 'good' | 'bad' }> = ({ label, value, sub, tone }) => (
  <div className="k-card p-4">
    <p className="text-sm k-muted">{label}</p>
    <p className={`text-2xl font-bold tabular-nums mt-1 ${tone === 'bad' ? 'k-bad' : tone === 'good' ? 'k-good' : ''}`}>{value}</p>
    {sub && <p className="text-xs k-muted mt-1">{sub}</p>}
  </div>
);

export const AdsView: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tariffs, setTariffs] = useState<Map<string, number>>(new Map());
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [fixes, setFixes] = useState<{ id: string; remarks: string }[] | null>(null);
  const [fixMsg, setFixMsg] = useState('');
  const [shipMsg, setShipMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('day');
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [f, b, s, t] = await Promise.all([AdsService.funds(), AdsService.balances(), AdsService.settings(), AdsService.tariffs()]);
      setFunds(f); setBalances(b); setSettings(s); setTariffs(t);
      PriceService.getAll().then((r) => setPrices(r.prices)).catch(() => {});
    } catch (e) { setErr(adsError(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const spend = useMemo(() => dailySpend(balances, funds), [balances, funds]);
  const keyOf = range === 'day' ? (d: string) => d : range === 'week' ? weekKey : monthKey;
  const rows = useMemo(() => buildStats(orders, spend, settings, keyOf, tariffs, prices), [orders, spend, settings, range, tariffs, prices]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayKey = localDay();
  const monthStats = useMemo(() => buildStats(orders, spend, settings, monthKey, tariffs, prices).find((r) => r.key === todayKey.slice(0, 7)), [orders, spend, settings, todayKey, tariffs, prices]);
  const latest = balances[balances.length - 1];
  const lastSpendDay = [...spend.keys()].sort().pop();
  const lastDay = lastSpendDay ? buildStats(orders, spend, settings, (d) => d, tariffs, prices).find((r) => r.key === lastSpendDay) : undefined;
  const fundsMonth = funds.filter((f) => f.fund_date.startsWith(todayKey.slice(0, 7))).reduce((s, f) => s + f.amount, 0);
  const fundsToday = funds.filter((f) => f.fund_date === todayKey).reduce((s, f) => s + f.amount, 0);
  const avgSpend = (() => { const v = [...spend.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7).map((e) => e[1]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; })();
  const runway = latest && avgSpend > 0 ? latest.balance / avgSpend : null;

  // forms
  const [fAmount, setFAmount] = useState(''); const [fDate, setFDate] = useState(todayKey); const [fNote, setFNote] = useState('');
  const [bAmount, setBAmount] = useState(''); const [bDate, setBDate] = useState(localDay(new Date(Date.now() - 86400000)));
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e) { setErr(adsError(e)); } finally { setBusy(false); } };

  const withTracking = orders.filter((o) => o.trackingNumber && (o.status === 'Delivered' || o.status === 'Returned'));
  const known = withTracking.filter((o) => tariffs.has((o.trackingNumber || '').toUpperCase())).length;
  const [gaps, setGaps] = useState<OrderGap[] | null>(null);
  const gapMonths = useMemo(() => {
    const m = new Map<string, { cod: number; pre: number }>();
    (gaps || []).forEach((g) => { const k = g.date.slice(0, 7); const r = m.get(k) || { cod: 0, pre: 0 }; if (g.payment === 'COD') r.cod++; else r.pre++; m.set(k, r); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [gaps]);
  const loadGaps = async () => { setBusy(true); setErr(''); try { setGaps(await AdsService.orderGaps()); } catch (e) { setErr(adsError(e)); } finally { setBusy(false); } };
  const downloadGaps = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ['Order,Date,Customer,Phone,Product,Payment,COD amount,Status,Problem,Advance paid (fill in),Total amount (fill in)',
      ...(gaps || []).map((g) => [g.id, g.date, g.customer, g.phone, g.product, g.payment, g.cod, g.status, g.kind, '', ''].map(q).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'orders-missing-amount.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const checkFixes = async () => {
    setBusy(true); setErr(''); setFixMsg('');
    try { setFixes(await AdsService.orderFixes('2026-10-01', settings, prices)); } catch (e) { setErr(adsError(e)); } finally { setBusy(false); }
  };
  const runFixes = async () => {
    if (!fixes?.length) return;
    setBusy(true); setErr('');
    try {
      await AdsService.applyOrderFixes(fixes);
      setFixMsg(`Updated ${fixes.length} orders. Reloading...`); setFixes([]);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setErr(adsError(e)); } finally { setBusy(false); }
  };
  const importShipping = async (f: File | undefined | null) => {
    if (!f) return;
    setBusy(true); setErr(''); setShipMsg('');
    try {
      const data = await BulkImporterService.parseFile(f);
      const art = detectColumns(data.headers).article;
      const tcol = data.headers.find((h) => /tarr?if+|tariff|postage|booking[\s_-]*charge|total[\s_-]*charge/i.test(h)) || '';
      if (!art || !tcol) throw new Error('Could not find the article number and tariff columns in that file.');
      const map = new Map<string, number>();
      data.rows.forEach((r) => { const a = cleanArticle(r[art]); const t = parseFloat(String(r[tcol]).replace(/[^\d.]/g, '')); if (looksLikeArticle(a) && t > 0) map.set(a, t); });
      if (!map.size) throw new Error('No parcels with a tariff were found in that file.');
      await AdsService.saveTariffs([...map.entries()].map(([tracking_number, tariff]) => ({ tracking_number, tariff })));
      setShipMsg(`Saved the shipping charge of ${map.size} parcels.`);
      await load();
    } catch (e) { setErr(adsError(e)); } finally { setBusy(false); }
  };

  const labelOf = (k: string) => (range === 'day' ? dmy(k) : range === 'week' ? `Week of ${dmy(k)}` : new Date(k + '-01T00:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' }));

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold k-display flex items-center gap-2"><Megaphone className="w-7 h-7" /> Meta ads</h2>
          <p className="text-sm k-muted mt-1">Spend, balance, cost per order and profit.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} aria-label="Refresh" className="k-btn k-btn-ghost w-11 h-11"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setShowSettings(true)} className="k-btn k-btn-ghost h-11 px-4"><Cog className="w-4 h-4" /> Costs</button>
        </div>
      </div>

      {err && <p role="alert" className="text-sm k-bad k-card p-4">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Balance now" value={latest ? inr(latest.balance) : '—'} sub={latest ? `Read on ${dmy(latest.balance_date)} at 12 a.m.` : 'Add a balance reading below'} />
        <Stat label={lastSpendDay ? `Spent on ${dmy(lastSpendDay)}` : 'Spent (last day)'} value={lastSpendDay ? inr(spend.get(lastSpendDay) || 0) : '—'} sub={lastDay ? `${lastDay.orders} orders · ${per(lastDay.spend, lastDay.orders)} each` : undefined} />
        <Stat label="Spent this month" value={monthStats ? inr(monthStats.spend) : '—'} sub={monthStats ? `${monthStats.orders} orders · ${per(monthStats.spend, monthStats.orders)} each` : undefined} />
        <Stat label="Funds added this month" value={inr(fundsMonth)} sub={`Today ${inr(fundsToday)}`} />
        <Stat label="Real cost per delivered order" value={monthStats ? per(monthStats.spend, monthStats.delivered) : '—'} sub={monthStats ? `${monthStats.delivered} delivered · ${monthStats.returned} returned · ${monthStats.open} on the way` : undefined} />
        <Stat label="Profit this month" value={monthStats ? inr(monthStats.profit) : '—'} tone={monthStats ? (monthStats.profit >= 0 ? 'good' : 'bad') : undefined} sub={monthStats && monthStats.spend > 0 ? 'After product, packing, shipping and ads' : 'Ads NOT included yet. Add balance readings.'} />
        <Stat label="Average spend per day" value={avgSpend ? inr(avgSpend) : '—'} sub="Last 7 days" />
        <Stat label="Money lasts about" value={runway !== null ? `${runway.toFixed(1)} days` : '—'} tone={runway !== null && runway < 1.5 ? 'bad' : undefined} sub={runway !== null && runway < 1.5 ? 'Add funds today' : 'At the current spend'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="k-card p-5 space-y-3" aria-label="Funds added">
          <h3 className="font-bold">I added money to Meta</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="k-label">Amount (₹)</span><input className="k-field" type="number" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="5000" /></label>
            <label className="block"><span className="k-label">Date</span><input className="k-field" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} /></label>
          </div>
          <label className="block"><span className="k-label">Note</span><input className="k-field" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Only count payments that went through" /></label>
          <button disabled={busy || !(parseFloat(fAmount) > 0)} onClick={() => void run(async () => { await AdsService.addFund(fDate, parseFloat(fAmount), fNote.trim()); setFAmount(''); setFNote(''); })} className="k-btn k-btn-lime h-11 px-5">Add funds</button>
          {funds.length > 0 && (
            <ul className="divide-y k-rule text-sm max-h-48 overflow-y-auto">
              {funds.slice(0, 20).map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2 gap-2">
                  <span>{dmy(f.fund_date)}{f.note ? <span className="k-muted"> · {f.note}</span> : null}</span>
                  <span className="flex items-center gap-2"><b className="tabular-nums">{inr(f.amount)}</b>
                    <button aria-label="Delete this entry" onClick={() => { if (window.confirm(`Delete ${inr(f.amount)} on ${dmy(f.fund_date)}?`)) void run(() => AdsService.removeFund(f.id)); }} className="k-btn k-btn-ghost w-8 h-8"><Trash2 className="w-3.5 h-3.5" /></button></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="k-card p-5 space-y-3" aria-label="Balance reading">
          <h3 className="font-bold">Balance at 12 a.m.</h3>
          <p className="text-sm k-muted">Open Billing in Meta right after 12 a.m. and type the prepaid balance. It gives the day that just ended.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="k-label">Balance (₹)</span><input className="k-field" type="number" step="0.01" value={bAmount} onChange={(e) => setBAmount(e.target.value)} placeholder="4801.31" /></label>
            <label className="block"><span className="k-label">For the day</span><input className="k-field" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} /></label>
          </div>
          <button disabled={busy || bAmount === ''} onClick={() => void run(async () => { await AdsService.saveBalance(bDate, parseFloat(bAmount)); setBAmount(''); })} className="k-btn k-btn-lime h-11 px-5">Save balance</button>
          {balances.length > 0 && (
            <ul className="divide-y k-rule text-sm max-h-48 overflow-y-auto">
              {[...balances].reverse().slice(0, 14).map((b) => (
                <li key={b.balance_date} className="flex justify-between py-2"><span>{dmy(b.balance_date)}</span><b className="tabular-nums">{inr(b.balance)}</b></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="k-card p-5 space-y-2" aria-label="Shipping charges">
        <h3 className="font-bold flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Shipping charge from India Post</h3>
        <p className="text-sm k-muted">Upload the India Post booking file (Excel or CSV). The app reads each parcel's article number and tariff, so profit uses the real shipping charge.</p>
        <input className="k-field" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => { void importShipping(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="text-xs k-muted">{withTracking.length > 0 ? `${known} of ${withTracking.length} delivered or returned parcels have a known shipping charge. The rest use the default in Costs.` : 'No delivered or returned parcels with tracking yet.'}</p>
        {shipMsg && <p className="text-sm k-good">{shipMsg}</p>}
      </section>

      <section className="k-card p-5 space-y-3" aria-label="Orders with missing amounts">
        <h3 className="font-bold">Orders with no advance or no amount saved</h3>
        <p className="text-sm k-muted">COD orders where the ₹100 advance was never saved, and prepaid orders showing ₹0. Download the list, fill in the real amounts, and send it to me.</p>
        {gaps === null
          ? <button className="k-btn k-btn-ghost h-10 px-4" disabled={busy} onClick={() => void loadGaps()}>Show the list</button>
          : <>
              <ul className="text-sm space-y-1">
                {gapMonths.map(([m, v]) => <li key={m} className="flex justify-between gap-3"><span>{m}</span><span className="tabular-nums"><b>{v.cod}</b> COD without advance · <b>{v.pre}</b> prepaid without amount</span></li>)}
                {gaps.length === 0 && <li className="k-good">Every order has its amount saved.</li>}
              </ul>
              {gaps.length > 0 && <>
                <button className="k-btn k-btn-lime h-10 px-4" onClick={downloadGaps}>Download list ({gaps.length} orders)</button>
                <div className="max-h-72 overflow-auto rounded-xl border k-rule">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 k-card"><tr className="text-left k-muted"><th className="p-2">Order</th><th className="p-2">Date</th><th className="p-2">Product</th><th className="p-2">Type</th><th className="p-2 text-right">COD</th><th className="p-2">Status</th></tr></thead>
                    <tbody>{gaps.slice(0, 300).map((g) => <tr key={g.id} className="border-t k-rule"><td className="p-2 font-mono">{g.id}</td><td className="p-2">{dmy(g.date)}</td><td className="p-2">{g.product}</td><td className="p-2">{g.payment}</td><td className="p-2 text-right tabular-nums">{g.cod || '—'}</td><td className="p-2">{g.status}</td></tr>)}</tbody>
                  </table>
                </div>
                {gaps.length > 300 && <p className="text-xs k-muted">Showing the first 300. The download has all {gaps.length}.</p>}
              </>}
            </>}
      </section>

      <section className="k-card p-5 space-y-2" aria-label="Fix old orders">
        <h3 className="font-bold">Fix old orders (October and November)</h3>
        <p className="text-sm k-muted">Old COD orders get the ₹100 advance saved. Old prepaid orders showing ₹0 get their product's prepaid price. Nothing else changes.</p>
        {fixes === null
          ? <button className="k-btn k-btn-ghost h-10 px-4" disabled={busy} onClick={() => void checkFixes()}>Check how many orders</button>
          : fixes.length === 0
            ? <p className="text-sm k-good">All orders from October already have their amount saved.</p>
            : <div className="flex items-center gap-3 flex-wrap"><p className="text-sm"><b>{fixes.length}</b> orders will be updated.</p><button className="k-btn k-btn-lime h-10 px-4" disabled={busy} onClick={() => void runFixes()}>Update {fixes.length} orders</button></div>}
        {fixMsg && <p className="text-sm k-good">{fixMsg}</p>}
      </section>

      <section className="k-card p-5" aria-label="Cost per order and profit">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-bold">Cost per order and profit</h3>
          <div className="flex gap-2" role="group" aria-label="Range">
            {(['day', 'week', 'month'] as Range[]).map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} className={`k-btn h-9 px-4 ${range === r ? 'k-btn-lime' : 'k-btn-ghost'}`}>{r === 'day' ? 'Daily' : r === 'week' ? 'Weekly' : 'Monthly'}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="text-left k-muted"><th className="py-2 pr-3 font-medium">{range === 'day' ? 'Day' : range === 'week' ? 'Week' : 'Month'}</th><th className="py-2 pr-3 text-right font-medium">Ad spend</th><th className="py-2 pr-3 text-right font-medium">Orders</th><th className="py-2 pr-3 text-right font-medium">Cost / order</th><th className="py-2 pr-3 text-right font-medium">Delivered</th><th className="py-2 pr-3 text-right font-medium">Returned</th><th className="py-2 pr-3 text-right font-medium">Cost / delivered</th><th className="py-2 text-right font-medium">Profit</th></tr></thead>
            <tbody>
              {rows.slice(0, range === 'day' ? 31 : 12).map((r: DayStat) => (
                <tr key={r.key} className="border-t k-rule">
                  <td className="py-2.5 pr-3 font-semibold">{labelOf(r.key)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.spend ? inr(r.spend) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.orders}{r.open > 0 && <span className="k-muted text-xs"> ({r.open} open)</span>}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.spend ? per(r.spend, r.orders) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.delivered}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.returned}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{r.spend ? per(r.spend, r.delivered) : '—'}</td>
                  <td className={`py-2.5 text-right tabular-nums font-bold ${r.profit < 0 ? 'k-bad' : 'k-good'}`}>{inr(r.profit)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center k-muted">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs k-muted mt-3">Orders are counted on the day they were placed. Delivered orders earn the order value minus product, packing and shipping. Returned orders lose packing and shipping. Orders still on the way are not counted in profit yet, so recent days will change.</p>
      </section>

      {showSettings && <CostSheet value={settings} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); void load(); }} />}
    </div>
  );
};

const CostSheet: React.FC<{ value: Settings; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { await AdsService.saveSettings(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, parseFloat(v) || 0])) as Settings); onSaved(); }
    catch (e) { setErr(adsError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Costs per order" onClose={onClose}>
      <div className="space-y-3">
        {(Object.keys(SETTING_LABEL) as (keyof Settings)[]).map((k) => (
          <label key={k} className="block"><span className="k-label">{SETTING_LABEL[k]}</span>
            <input className="k-field" type="number" min="0" step="0.01" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></label>
        ))}
        <p className="text-xs k-muted">The courier bag is added only to orders worth the amount above or more (₹699 orders). Box and label go on every order.</p>
        {err && <p role="alert" className="text-sm k-bad">{err}</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="k-btn k-btn-ghost px-5 h-11">Cancel</button><button disabled={busy} onClick={() => void save()} className="k-btn k-btn-lime px-6 h-11">{busy ? 'Saving…' : 'Save costs'}</button></div>
      </div>
    </Sheet>
  );
};
