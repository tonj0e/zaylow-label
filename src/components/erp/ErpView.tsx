import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, CircleAlert, Eye, EyeOff, Loader2, Plug, Send, Wifi } from 'lucide-react';
import type { Order } from '../../types';
import { Switch } from '../common/Switch';
import { ErpService, isErpReady, loadErpConfig, loadErpLog, localDay, orderPayload, saveErpConfig, type ErpAuth, type ErpConfig, type ErpLogEntry, type ErpResult } from '../../services/erpService';

interface ErpViewProps { orders: Order[] }

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const ErpView: React.FC<ErpViewProps> = ({ orders }) => {
  const today = localDay(new Date());
  const [cfg, setCfg] = useState<ErpConfig>(loadErpConfig);
  const [saved, setSaved] = useState<ErpConfig>(loadErpConfig);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('');
  const [result, setResult] = useState<ErpResult | null>(null);
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<ErpLogEntry[]>(loadErpLog);
  const [day, setDay] = useState(today);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const ready = isErpReady(cfg);
  const last = log.find((l) => l.what === 'Test connection');
  const connected = !!last && last.ok && !dirty;

  const set = <K extends keyof ErpConfig>(k: K, v: ErpConfig[K]) => { setCfg((c) => ({ ...c, [k]: v })); setResult(null); };
  const persist = () => { saveErpConfig(cfg); setSaved(cfg); };
  const refreshLog = () => setLog(loadErpLog());

  // while this page is open, show what the automatic sender did
  useEffect(() => { const t = setInterval(refreshLog, 4000); return () => clearInterval(t); }, []);

  const list = useMemo(() => orders.filter((o) => localDay(o.createdAt) === day), [orders, day]);
  const total = useMemo(() => list.reduce((n, o) => n + (o.codAmount || 0) + (o.advancePaid || 0), 0), [list]);
  const waiting = useMemo(() => { void log; return ErpService.pendingToday(orders).length; }, [orders, log]);

  const run = async (kind: 'test' | 'send') => {
    persist(); setBusy(kind); setResult(null); setProgress('');
    try {
      const r = kind === 'test' ? await ErpService.test(cfg)
        : await ErpService.send(cfg, list, `Send orders of ${day}`, (d, t) => setProgress(`${d} of ${t} sent…`));
      setResult(r);
    } finally { setBusy(''); setProgress(''); refreshLog(); }
  };

  const sample = useMemo(() => (orders[0] ? JSON.stringify({ source: 'zaylow', event: 'orders.sync', orders: [orderPayload(orders[0])] }, null, 2) : ''), [orders]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto pb-24 md:pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold k-display">ERP connection</h2>
          <p className="text-sm k-muted mt-1">Connect this warehouse to your ERP. Today's orders go across, so accounts and finance stay up to date.</p>
        </div>
        <span className="rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shrink-0" style={connected ? { background: 'var(--lime)', color: 'var(--on-lime)' } : { background: 'var(--card2)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: connected ? 'var(--on-lime)' : 'var(--muted)' }} />{connected ? 'Connected' : ready ? 'Not tested' : 'Not connected'}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 md:gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <section className="k-card p-4 md:p-5 space-y-4" aria-label="ERP address">
            <h3 className="font-bold k-display flex items-center gap-2"><Plug className="w-4 h-4 k-lime-text" /> 1. Connect</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label htmlFor="erp-name" className="k-label">ERP name</label><input id="erp-name" value={cfg.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Zaylow ERP" className="k-field" /></div>
              <div><label htmlFor="erp-url" className="k-label">ERP address (API URL)</label><input id="erp-url" inputMode="url" value={cfg.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://erp.yourcompany.com" className="k-field font-mono" autoCapitalize="none" /></div>
            </div>
            <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)] gap-3">
              <div><label htmlFor="erp-auth" className="k-label">How the key is sent</label>
                <select id="erp-auth" value={cfg.auth} onChange={(e) => set('auth', e.target.value as ErpAuth)} className="k-field">
                  <option value="bearer">Bearer token</option><option value="x-api-key">x-api-key header</option><option value="none">No key</option>
                </select></div>
              {cfg.auth !== 'none' && (
                <div><label htmlFor="erp-key" className="k-label">API key</label>
                  <div className="relative"><input id="erp-key" type={showKey ? 'text' : 'password'} value={cfg.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="Paste the key from your ERP" className="k-field font-mono pr-11" autoComplete="off" />
                    <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'} className="absolute right-3 top-1/2 -translate-y-1/2 k-muted">{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
              )}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold k-muted">ERP paths (change if your ERP uses other ones)</summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div><label htmlFor="erp-p1" className="k-label">Receives orders at</label><input id="erp-p1" value={cfg.ordersPath} onChange={(e) => set('ordersPath', e.target.value)} className="k-field font-mono" /></div>
                <div><label htmlFor="erp-p3" className="k-label">Test page</label><input id="erp-p3" value={cfg.pingPath} onChange={(e) => set('pingPath', e.target.value)} className="k-field font-mono" /></div>
              </div>
            </details>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => run('test')} disabled={!ready || !!busy} className="k-btn k-btn-lime px-5 py-3 text-sm max-sm:flex-1">{busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />} Test connection</button>
              {dirty && <button onClick={persist} className="k-btn k-btn-ghost px-5 py-3 text-sm">Save details</button>}
            </div>
          </section>

          <section className="k-card p-4 md:p-5 space-y-4" aria-label="Automatic sending">
            <h3 className="font-bold k-display">2. Send automatically</h3>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0"><span className="block text-sm font-semibold">Send today's orders by themselves</span><span className="block text-xs k-muted">New orders, and orders whose status changes (printed, shipped, delivered), go to the ERP within a few seconds. Works while this site is open.</span></span>
              <Switch on={cfg.auto} onChange={(v) => { const n = { ...cfg, auto: v }; setCfg(n); saveErpConfig(n); setSaved(n); }} label="Send today's orders automatically" />
            </div>
            <p className="text-xs k-muted">{cfg.auto ? (ready ? `${waiting} order${waiting === 1 ? '' : 's'} of today waiting to go.` : 'Add the ERP address above first.') : 'Off. Use the button below to send by hand.'}</p>
          </section>

          <section className="k-card p-4 md:p-5 space-y-4" aria-label="Send by hand">
            <h3 className="font-bold k-display">3. Send by hand</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="relative flex-1 min-w-[11rem]">
                <span className="sr-only">Date to send</span>
                <CalendarDays className="w-4 h-4 k-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="k-field font-semibold" style={{ paddingLeft: '2.4rem' }} />
              </label>
              <button onClick={() => setDay(today)} aria-pressed={day === today} className="k-chip">Today</button>
            </div>
            <p className="text-sm"><span className="font-bold tabular-nums">{list.length}</span> order{list.length === 1 ? '' : 's'} on this day · <span className="font-bold tabular-nums">{inr(total)}</span> sales</p>
            <button onClick={() => run('send')} disabled={!ready || !!busy || list.length === 0} className="k-btn k-btn-ink px-5 py-3 text-sm max-sm:w-full">{busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {busy === 'send' ? progress || 'Sending…' : `Send ${list.length} order${list.length === 1 ? '' : 's'} to ERP`}</button>
            {result && (
              <p role="status" className="text-sm font-medium rounded-2xl px-4 py-3 flex items-start gap-2" style={{ background: result.ok ? 'color-mix(in srgb, var(--lime) 16%, transparent)' : 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
                {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 k-lime-text" /> : <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 k-bad" />}{result.message}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 min-w-0 lg:sticky lg:top-28">
          <section className="k-card p-4 md:p-5" aria-label="Recent activity">
            <h3 className="font-bold k-display">Recent activity</h3>
            {log.length === 0 ? <p className="text-sm k-muted mt-2">Nothing sent yet.</p> : (
              <ul className="mt-2 divide-y k-rule">
                {log.slice(0, 6).map((l, i) => (
                  <li key={i} className="py-2.5 text-sm flex gap-2.5">
                    {l.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 k-lime-text" /> : <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 k-bad" />}
                    <span className="min-w-0"><span className="block font-semibold">{l.what}</span><span className="block text-xs k-muted">{l.message}</span><span className="block text-[11px] k-muted">{when(l.at)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="k-card p-4 md:p-5" aria-label="What is sent">
            <h3 className="font-bold k-display">What the ERP receives</h3>
            <p className="text-xs k-muted mt-1">A POST to {cfg.ordersPath || '/api/orders'} with this JSON. Give it to your ERP developer.</p>
            <pre className="mt-3 text-[11px] leading-relaxed rounded-xl p-3 overflow-auto max-h-72 font-mono" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{sample || 'No orders yet.'}</pre>
          </section>
        </aside>
      </div>
    </div>
  );
};
