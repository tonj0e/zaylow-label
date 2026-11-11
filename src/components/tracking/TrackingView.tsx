import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Order, OrderStatus, CompanySettings } from '../../types';
import { BookingImportModal } from './BookingImportModal';
import { CodBillsModal } from './CodBillsModal';
import { CodComingCard } from './CodComingCard';
import { readCodBills } from '../../utils/codBillsStore';
import { DataService } from '../../services/dataService';
import { FileSpreadsheet, Landmark, RefreshCw, IndianRupee, PackageCheck, Undo2, Hash, Search, MessageCircle, Check, ChevronLeft, ChevronRight, X, Settings2, Copy } from 'lucide-react';

interface TrackingViewProps {
  orders: Order[];
  settings: CompanySettings;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateTracking: (id: string, trackingNumber: string, shippingLabelUrl: string | null) => void;
  onApplyTrackingBatch: (pairs: { id: string; awb: string; status: OrderStatus; next?: OrderStatus; setTracking?: boolean }[], onProgress?: (done: number, total: number) => void) => Promise<{ saved: number; failed: string[] }>;
  onRefreshOrders: () => Promise<void>;
}

type Tab = 'needs' | 'onway' | 'delivered' | 'returned';

const PAGE = 20;
const TEMPLATE_KEY = 'zaylow_wa_template';
const SENT_KEY = 'zaylow_wa_sent';
const DEFAULT_TEMPLATE =
  'Hello {name}, your order has been shipped via India Post!\n\nYour Tracking Number: {tracking}\nTrack your package here: {link}\n\nThank you for shopping with us!';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const readJson = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

/** First Indian mobile number found in a free-text phone field. */
const mobileOf = (raw: string) => raw.match(/(?:\+?91[\s-]*)?([6-9]\d{9})/)?.[1] || '';

const whatsappLink = (order: Order, template: string, company: string) => {
  const mobile = mobileOf(order.customer.phone);
  if (!mobile) return '';
  const text = template
    .replaceAll('{name}', order.customer.name.trim())
    .replaceAll('{company}', company)
    .replaceAll('{orderId}', order.id)
    .replaceAll('{tracking}', order.trackingNumber || '')
    .replaceAll('{link}', order.trackingNumber ? `https://myspeedpost.com/track?n=${order.trackingNumber}` : '')
    .replaceAll('{amount}', order.paymentType === 'COD' ? String(order.codAmount) : '0');
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
};

// India Post article numbers look like CL431677163IN. Other shapes are allowed, but flagged.
const looksLikeArticle = (v: string) => /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(v.trim());

const fmtDay = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

export const TrackingView: React.FC<TrackingViewProps> = ({ orders, settings, onUpdateStatus, onUpdateTracking, onApplyTrackingBatch, onRefreshOrders }) => {
  const [tab, setTab] = useState<Tab>('needs');
  const [courier, setCourier] = useState<'India Post' | 'ALL'>('India Post');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<string>(() => readJson(TEMPLATE_KEY, DEFAULT_TEMPLATE));
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [sent, setSent] = useState<Record<string, string>>(() => readJson(SENT_KEY, {}));
  const [toast, setToast] = useState<{ order: Order; tracking: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [codModal, setCodModal] = useState(false);
  const [codStore, setCodStore] = useState(() => readCodBills());
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<Awaited<ReturnType<typeof DataService.checkIndiaPostDelivery>> | null>(null);

  const checkDelivery = async () => {
    if (checking) return;
    setChecking(true);
    setCheckResult(null);
    const res = await DataService.checkIndiaPostDelivery(true);
    if (res.ok) await onRefreshOrders();
    setCheckResult(res);
    setChecking(false);
  };
  const q = useDeferredValue(search.trim().toLowerCase());
  const company = settings.companyName || 'ZAYLOW';

  useEffect(() => { setPage(1); }, [tab, courier, q]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(t);
  }, [toast]);

  const scoped = useMemo(() => orders.filter((o) => courier === 'ALL' || o.courier === courier), [orders, courier]);

  const groups = useMemo(() => {
    const needs: Order[] = [];
    const onway: Order[] = [];
    const delivered: Order[] = [];
    const returned: Order[] = [];
    scoped.forEach((o) => {
      if (o.status === 'Delivered') delivered.push(o);
      else if (o.status === 'Returned') returned.push(o);
      else if (o.status === 'Shipped') onway.push(o);
      if (!o.trackingNumber && ['Pending', 'Processing', 'Label Generated', 'Printed', 'Shipped'].includes(o.status)) needs.push(o);
    });
    const newest = (a: Order, b: Order) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt));
    [needs, onway, delivered, returned].forEach((l) => l.sort(newest));
    return { needs, onway, delivered, returned };
  }, [scoped]);

  // how many orders each customer name has (any status), so repeat customers are easy to spot
  const nameCount = useMemo(() => {
    const m = new Map<string, number>();
    orders.forEach((o) => { const k = (o.customer.name || '').trim().toLowerCase(); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [orders]);

  const cod = (list: Order[]) => list.filter((o) => o.paymentType === 'COD').reduce((n, o) => n + o.codAmount, 0);
  const codCount = (list: Order[]) => list.filter((o) => o.paymentType === 'COD').length;

  const list = useMemo(() => {
    const base = groups[tab];
    if (!q) return base;
    return base.filter((o) => [o.id, o.customer.name, o.customer.phone, o.customer.city, o.customer.pinCode, o.trackingNumber || ''].some((f) => (f || '').toLowerCase().includes(q)));
  }, [groups, tab, q]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, totalPages);
  const rows = list.slice((current - 1) * PAGE, current * PAGE);

  const saveTracking = (o: Order) => {
    const value = (drafts[o.id] || '').trim().toUpperCase();
    if (!value) return;
    if (o.status !== 'Shipped' && o.status !== 'Delivered' && o.status !== 'Returned') onUpdateStatus(o.id, 'Shipped');
    onUpdateTracking(o.id, value, null);
    setDrafts((d) => { const n = { ...d }; delete n[o.id]; return n; });
    setToast({ order: { ...o, trackingNumber: value, status: 'Shipped' }, tracking: value });
  };

  const markSent = (id: string) => {
    const next = { ...sent, [id]: new Date().toISOString() };
    setSent(next);
    writeJson(SENT_KEY, next);
  };

  const saveTemplate = (value: string) => { setTemplate(value); writeJson(TEMPLATE_KEY, value); };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  const tabs: [Tab, string, number][] = [
    ['needs', 'Needs a tracking number', groups.needs.length],
    ['onway', 'On the way', groups.onway.length],
    ['delivered', 'Delivered', groups.delivered.length],
    ['returned', 'Returned', groups.returned.length],
  ];

  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const deliveredToday = groups.delivered.filter((o) => o.deliveredAt === todayKey).length;
  const toCollect = cod(groups.onway);
  const collected = cod(groups.delivered);
  const lost = cod(groups.returned);

  const WhatsAppButton: React.FC<{ order: Order }> = ({ order }) => {
    const link = whatsappLink(order, template, company);
    const done = !!sent[order.id];
    if (!order.trackingNumber) return null;
    if (!link) return <span className="text-xs k-muted">No mobile number</span>;
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => markSent(order.id)}
        className={`k-btn px-4 h-9 text-xs ${done ? 'k-btn-soft' : 'k-btn-lime'}`}
        title={done ? `Opened on ${new Date(sent[order.id]).toLocaleString('en-IN')}` : 'Open WhatsApp with the tracking message ready to send'}
      >
        {done ? <Check className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />} {done ? 'Sent again' : 'WhatsApp'}
      </a>
    );
  };

  return (
    <div className="kdash min-h-full p-4 sm:p-5 md:p-7 select-none pb-24 md:pb-10">
      <div className="space-y-5">
        <header className="k-rise flex flex-col md:flex-row md:items-end justify-between gap-4" style={{ ['--i' as string]: 0 }}>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold leading-none k-display">Tracking and COD</h2>
            <p className="text-sm k-muted mt-2">Which parcels have a tracking number, where they are, and how much COD is still to come in.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap max-md:grid max-md:grid-cols-2">
            <div className="k-card p-1 flex max-md:col-span-2" style={{ borderRadius: 999 }} role="group" aria-label="Courier">
              {([['India Post', 'India Post'], ['ALL', 'All couriers']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setCourier(id)} aria-pressed={courier === id} className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors max-md:flex-1 ${courier === id ? 'k-btn-ink' : 'k-muted'}`}>{label}</button>
              ))}
            </div>
            <button onClick={checkDelivery} disabled={checking} className="k-btn k-btn-lime px-4 py-3 text-sm max-md:col-span-2" title="Ask India Post which shipped parcels have been delivered">
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} /> {checking ? 'Checking…' : 'Check delivery now'}
            </button>
            <button onClick={() => setImporting(true)} className="k-btn k-btn-ink px-4 py-2.5 text-sm"><FileSpreadsheet className="w-4 h-4" /> <span className="md:hidden">Import</span><span className="max-md:hidden">Import India Post bookings</span></button>
            <button onClick={() => setEditingTemplate((v) => !v)} className="k-btn k-btn-ghost px-4 py-2.5 text-sm"><Settings2 className="w-4 h-4" /> WhatsApp message</button>
          </div>
        </header>

        {checkResult && (
          <div role="status" className="k-card px-5 py-4 flex items-start justify-between gap-4 k-rise" style={{ ['--i' as string]: 0 }}>
            <div className="min-w-0">
              {checkResult.ok ? (
                <>
                  <p className="font-semibold">India Post checked {checkResult.checked ?? 0} shipped parcels</p>
                  <p className="text-sm k-muted mt-1">
                    {checkResult.delivered ?? 0} delivered · {checkResult.returned ?? 0} returned · {checkResult.onTheWay ?? 0} still on the way
                    {(checkResult.notScanned ?? 0) > 0 ? ` · ${checkResult.notScanned} not scanned yet` : ''}{checkResult.failed && checkResult.failed.length > 0 ? ` · ${checkResult.failed.length} could not be checked` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">The delivery check did not run</p>
                  <p className="text-sm k-muted mt-1">{checkResult.error}</p>
                </>
              )}
            </div>
            <button onClick={() => setCheckResult(null)} aria-label="Dismiss" className="k-btn k-btn-ghost w-9 h-9 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        {editingTemplate && (
          <section className="k-card p-5 k-rise" style={{ ['--i' as string]: 0 }} aria-label="WhatsApp message text">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold k-display">Message sent to the customer</h3>
                <p className="text-sm k-muted mt-1">Use <code className="font-mono">{'{name}'}</code>, <code className="font-mono">{'{orderId}'}</code>, <code className="font-mono">{'{tracking}'}</code>, <code className="font-mono">{'{link}'}</code>, <code className="font-mono">{'{amount}'}</code> and <code className="font-mono">{'{company}'}</code>. It is saved in this browser.</p>
              </div>
              <button onClick={() => setEditingTemplate(false)} aria-label="Close" className="k-btn k-btn-ghost w-9 h-9 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <textarea value={template} onChange={(e) => saveTemplate(e.target.value)} rows={5} className="k-field mt-4" style={{ resize: 'vertical' }} aria-label="WhatsApp message" />
            <button onClick={() => saveTemplate(DEFAULT_TEMPLATE)} className="text-sm font-semibold underline mt-2">Use the standard message</button>

            <div className="mt-5 rounded-2xl k-card2 p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1 basis-[18rem]">
                <p className="font-semibold flex items-center gap-2">Automatic sending <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 k-card">Not connected</span></p>
                <p className="text-sm k-muted mt-1">Once your WhatsApp API is connected, a new tracking number can be sent to the customer by itself. Until then, use the WhatsApp button on each parcel.</p>
                <p className="text-xs k-muted mt-2">To connect later: get WhatsApp Business API access, get your message approved by WhatsApp, then give the key to be stored privately on the server. It never goes in this page.</p>
              </div>
              <button role="switch" aria-checked="false" aria-label="Send tracking numbers automatically" disabled className="relative w-12 h-7 rounded-full shrink-0 opacity-50 cursor-not-allowed" style={{ background: 'var(--line)' }}>
                <span className="absolute left-1 top-1 w-5 h-5 rounded-full" style={{ background: 'var(--card)' }} />
              </button>
            </div>
          </section>
        )}

        <dl className="k-rise grid sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 max-md:flex max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:-mx-4 max-md:px-4 max-md:pb-1 [&>div]:max-md:min-w-[72%] [&>div]:max-md:snap-start [&>div]:max-md:shrink-0" style={{ ['--i' as string]: 1 }}>
          {([
            ['COD still to collect', inr(toCollect), `${codCount(groups.onway)} COD parcels on the way`, IndianRupee, groups.onway.length ? (codCount(groups.onway) / groups.onway.length) * 100 : 0],
            ['COD collected', inr(collected), `${codCount(groups.delivered)} delivered COD orders · ${deliveredToday} delivered today`, PackageCheck, collected + toCollect > 0 ? (collected / (collected + toCollect)) * 100 : 0],
            ['COD returned', inr(lost), `${codCount(groups.returned)} COD orders came back`, Undo2, collected + lost > 0 ? (lost / (collected + lost)) * 100 : 0],
            ['No tracking number', groups.needs.length.toLocaleString('en-IN'), `of ${scoped.length.toLocaleString('en-IN')} ${courier === 'ALL' ? '' : 'India Post '}orders`, Hash, scoped.length ? (groups.needs.length / scoped.length) * 100 : 0],
          ] as const).map(([label, value, hint, Icon, pct]) => (
            <div key={label} className="k-card p-5">
              <div className="flex items-start justify-between">
                <dt className="text-sm k-muted">{label}</dt>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--lime) 16%, var(--card2))' }}><Icon className="w-[18px] h-[18px] k-lime-text" /></span>
              </div>
              <dd className="text-4xl font-bold k-display leading-none mt-3">{value}</dd>
              <dd className="mt-4">
                <div className="h-2 rounded-full k-track overflow-hidden"><div className="h-full rounded-full k-bar bar-grow" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                <p className="text-xs k-muted mt-2">{hint}</p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs k-muted -mt-2">“Collected” counts COD orders marked Delivered: money India Post collected from customers. The card below shows what India Post has actually paid out to you.</p>

        {/* what India Post has actually paid out, from the COD Bills Report */}
        <section className="k-card p-5 k-rise" style={{ ['--i' as string]: 2 }} aria-label="COD paid out by India Post">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-bold k-display flex items-center gap-2"><Landmark className="w-5 h-5 k-lime-text" /> COD paid out by India Post</h3>
              <p className="text-sm k-muted mt-1">
                {codStore
                  ? `From your COD Bills Report, imported ${new Date(codStore.importedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. ${codStore.bills.length} bills.`
                  : 'Import your COD Bills Report to see the money India Post has really paid you.'}
              </p>
            </div>
            <button onClick={() => setCodModal(true)} className="k-btn k-btn-ink px-4 py-2.5 text-sm"><FileSpreadsheet className="w-4 h-4" /> Import COD bills</button>
          </div>
          {codStore && (() => {
            const paid = codStore.bills.filter((b) => /remit/i.test(b.status));
            const waiting = codStore.bills.filter((b) => !/remit/i.test(b.status));
            return (
              <dl className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-2xl k-card2 p-4"><dt className="text-xs k-muted">Paid to you</dt><dd className="text-3xl font-bold k-display mt-1">{inr(paid.reduce((n, b) => n + b.amount, 0))}</dd><dd className="text-xs k-muted mt-1">{paid.length} bills remitted</dd></div>
                <div className="rounded-2xl k-card2 p-4"><dt className="text-xs k-muted">Still pending</dt><dd className="text-3xl font-bold k-display mt-1">{inr(waiting.reduce((n, b) => n + b.amount, 0))}</dd><dd className="text-xs k-muted mt-1">{waiting.length} bills waiting</dd></div>
              </dl>
            );
          })()}
        </section>

        <CodComingCard orders={scoped} bills={codStore?.bills ?? null} />

        <div className="k-rise flex flex-col xl:flex-row xl:items-end justify-between gap-3 border-b k-rule" style={{ ['--i' as string]: 2 }}>
          <nav aria-label="Parcel stage">
            <ul className="flex flex-wrap gap-x-7">
              {tabs.map(([id, label, n]) => {
                const on = tab === id;
                return (
                  <li key={id}>
                    <button onClick={() => setTab(id)} aria-pressed={on} className="relative flex items-center gap-2 py-3 text-sm font-semibold whitespace-nowrap" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>
                      {label}
                      <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ background: on ? 'color-mix(in srgb, var(--lime) 20%, var(--card2))' : 'var(--card2)' }}>{n.toLocaleString('en-IN')}</span>
                      <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-transform" style={{ background: 'var(--lime)', transform: on ? 'scaleX(1)' : 'scaleX(0)' }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="relative pb-2.5 xl:w-80">
            <Search className="absolute left-4 top-[calc(50%-5px)] -translate-y-1/2 w-4 h-4 k-muted" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search parcels" placeholder="Name, phone, order or tracking number" className="k-field" style={{ paddingLeft: '2.5rem', borderRadius: 999, paddingTop: '.5rem', paddingBottom: '.5rem' }} />
          </div>
        </div>

        <section className="k-card overflow-hidden k-rise" style={{ ['--i' as string]: 3 }} aria-label="Parcels">
          {rows.length === 0 ? (
            <p className="p-14 text-center text-sm k-muted">
              {tab === 'needs' ? 'Every order has a tracking number.' : q ? 'No parcel matches your search.' : 'Nothing here yet.'}
            </p>
          ) : (
            <ul>
              {rows.map((o) => {
                const draft = drafts[o.id] ?? '';
                return (
                  <li key={o.id} className="k-row flex flex-wrap items-center gap-x-5 gap-y-3 px-4 lg:px-5 py-4 border-t k-rule first:border-t-0">
                    <div className="min-w-0 basis-full sm:basis-[14rem] flex-1">
                      <p className="font-semibold truncate">{o.customer.name}{(nameCount.get((o.customer.name || '').trim().toLowerCase()) || 0) > 1 && <span className="ml-2 text-xs font-medium rounded-full k-card2 px-2 py-0.5" title="This name has more than one order">{nameCount.get((o.customer.name || '').trim().toLowerCase())} orders</span>}</p>
                      <p className="text-xs k-muted font-mono truncate">{o.customer.phone}</p>
                    </div>
                    <div className="min-w-0 basis-[10rem] flex-1">
                      <p className="text-sm font-mono font-semibold">{o.id} <span className="font-sans font-normal k-muted">· {fmtDay(o.date || o.createdAt)}</span></p>
                      <p className="text-xs k-muted truncate">{o.customer.city} · {o.customer.pinCode}</p>
                    </div>
                    <div className="basis-[6rem]">
                      <p className="text-sm font-bold">{o.paymentType === 'COD' ? inr(o.codAmount) : 'Prepaid'}</p>
                      <p className="text-xs k-muted">{o.status}</p>
                    </div>

                    {tab === 'needs' ? (
                      <form className="flex items-center gap-2 flex-1 basis-[18rem]" onSubmit={(e) => { e.preventDefault(); saveTracking(o); }}>
                        <div className="flex-1 min-w-0">
                          <input
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [o.id]: e.target.value.toUpperCase() }))}
                            aria-label={`Tracking number for ${o.id}`}
                            placeholder="e.g. CL431677163IN"
                            className="k-field font-mono"
                            style={{ padding: '.5rem .9rem', borderRadius: 12 }}
                          />
                          {draft.trim() && !looksLikeArticle(draft) && <p className="text-xs mt-1 k-warn">India Post numbers look like CL431677163IN. Check it before saving.</p>}
                        </div>
                        <button type="submit" disabled={!draft.trim()} className="k-btn k-btn-ink px-4 h-9 text-xs">Save</button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap flex-1 basis-[18rem] justify-end">
                        {tab === 'delivered' && o.deliveredAt && <span className="text-xs k-muted">Delivered {new Date(o.deliveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                        {o.trackingNumber ? (
                          <button onClick={() => copy(o.trackingNumber!)} title="Copy tracking number" className="font-mono text-sm font-semibold rounded-full k-card2 px-3 h-9 flex items-center gap-2 hover:opacity-80">
                            {o.trackingNumber} {copied === o.trackingNumber ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 k-muted" />}
                          </button>
                        ) : <span className="text-xs k-muted">No tracking number</span>}
                        <WhatsAppButton order={o} />
                        {tab === 'onway' && (
                          <>
                            <button onClick={() => onUpdateStatus(o.id, 'Delivered')} className="k-btn k-btn-soft px-3 h-9 text-xs">Delivered</button>
                            <button onClick={() => onUpdateStatus(o.id, 'Returned')} className="k-btn k-btn-soft px-3 h-9 text-xs">Returned</button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-5 py-3.5 border-t k-rule flex items-center justify-between text-sm">
            <span className="k-muted">{list.length === 0 ? '0 parcels' : `${(current - 1) * PAGE + 1}–${Math.min(current * PAGE, list.length)} of ${list.length.toLocaleString('en-IN')}`}</span>
            <div className="flex items-center gap-2">
              <button disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page" className="k-btn k-btn-ghost w-9 h-9"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={current === totalPages} onClick={() => setPage(current + 1)} aria-label="Next page" className="k-btn k-btn-ghost w-9 h-9"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </section>
      </div>

      {codModal && <CodBillsModal onClose={() => setCodModal(false)} onSaved={() => setCodStore(readCodBills())} />}
      {importing && <BookingImportModal orders={orders} onClose={() => setImporting(false)} onApply={(pairs, progress) => onApplyTrackingBatch(pairs, progress)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 k-card flex items-center gap-3 p-3 pl-5 shadow-2xl k-rise" style={{ borderRadius: 999, ['--i' as string]: 0 }} role="status">
          <span className="text-sm"><strong className="font-semibold">{toast.order.customer.name}</strong> · <span className="font-mono">{toast.tracking}</span> saved</span>
          {whatsappLink(toast.order, template, company) ? (
            <a href={whatsappLink(toast.order, template, company)} target="_blank" rel="noopener noreferrer" onClick={() => { markSent(toast.order.id); setToast(null); }} className="k-btn k-btn-lime px-4 h-10 text-sm"><MessageCircle className="w-4 h-4" /> Send on WhatsApp</a>
          ) : <span className="text-xs k-muted">No mobile number</span>}
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="k-btn k-btn-ghost w-10 h-10"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};
