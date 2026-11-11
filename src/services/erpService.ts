/**
 * Sends warehouse data to your ERP over HTTPS.
 * Settings and the "already sent" list are kept in this browser.
 */
import type { Order } from '../types';

export type ErpAuth = 'bearer' | 'x-api-key' | 'none';

export interface ErpConfig {
  name: string;
  baseUrl: string;
  auth: ErpAuth;
  apiKey: string;
  ordersPath: string;
  pingPath: string;
  /** send new and changed orders of today by itself while this site is open */
  auto: boolean;
}

export interface ErpLogEntry { at: string; what: string; ok: boolean; message: string }
export interface ErpResult { ok: boolean; status?: number; message: string }

const KEY = 'zaylow_erp_config_v2';
const LOG_KEY = 'zaylow_erp_log_v1';
const SENT_KEY = 'zaylow_erp_sent_v1';

export const EMPTY_ERP: ErpConfig = { name: '', baseUrl: '', auth: 'bearer', apiKey: '', ordersPath: '/api/orders', pingPath: '/api/ping', auto: false };

export const loadErpConfig = (): ErpConfig => { try { return { ...EMPTY_ERP, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return EMPTY_ERP; } };
export const saveErpConfig = (c: ErpConfig) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked */ } };
export const loadErpLog = (): ErpLogEntry[] => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };
const addLog = (e: Omit<ErpLogEntry, 'at'>) => { try { localStorage.setItem(LOG_KEY, JSON.stringify([{ ...e, at: new Date().toISOString() }, ...loadErpLog()].slice(0, 20))); } catch { /* ignore */ } };
const loadSent = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); } catch { return {}; } };
const saveSent = (m: Record<string, string>) => { try { localStorage.setItem(SENT_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

export const isErpReady = (c: ErpConfig) => /^https:\/\/.+\..+/i.test(c.baseUrl.trim()) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(c.baseUrl.trim()); // the key is only sent over https (or to this computer)

export const localDay = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** One order, in a plain shape any system can read. */
export const orderPayload = (o: Order) => ({
  order_id: o.id,
  order_date: o.date,
  created_at: o.createdAt,
  status: o.status,
  customer: { name: (o.customer.name || '').trim(), phone: o.customer.phone, address: o.customer.addressLine, landmark: o.customer.landmark || null, city: o.customer.city, district: o.customer.district, state: o.customer.state, pin_code: o.customer.pinCode },
  item: { product: o.item.productName, sku: o.item.sku, quantity: o.item.quantity, weight_kg: o.item.weightKg },
  payment: { type: o.paymentType, cod_amount: o.codAmount, advance_paid: o.advancePaid ?? 0, total: (o.codAmount || 0) + (o.advancePaid || 0) },
  courier: o.courier,
  tracking_number: o.trackingNumber || null,
  delivered_on: o.deliveredAt || null,
  warranty: { start: o.warrantyStart || null, end: o.warrantyEnd || null },
});

const url = (c: ErpConfig, path: string) => c.baseUrl.trim().replace(/\/+$/, '') + '/' + path.trim().replace(/^\/+/, '');
const headers = (c: ErpConfig): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (c.auth === 'bearer' && c.apiKey) h.Authorization = `Bearer ${c.apiKey.trim()}`;
  if (c.auth === 'x-api-key' && c.apiKey) h['x-api-key'] = c.apiKey.trim();
  return h;
};

const call = async (c: ErpConfig, path: string, method: 'GET' | 'POST', body?: unknown): Promise<ErpResult> => {
  if (!isErpReady(c)) return { ok: false, message: 'Add your ERP address first, for example https://erp.yourcompany.com' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url(c, path), { method, headers: headers(c), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    if (res.ok) return { ok: true, status: res.status, message: `ERP answered ${res.status}.` };
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, message: `The ERP refused the key (${res.status}). Check the key and how it is sent.` };
    if (res.status === 404) return { ok: false, status: res.status, message: `The ERP has no page at ${path} (404). Check the path under "ERP paths".` };
    return { ok: false, status: res.status, message: `The ERP answered ${res.status}.` };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, message: 'The ERP did not answer within 12 seconds.' };
    return { ok: false, message: 'Could not reach the ERP. Check the address, or ask the ERP developer to allow requests from this site (CORS).' };
  } finally { clearTimeout(timer); }
};

const logged = async (what: string, p: Promise<ErpResult>) => { const r = await p; addLog({ what, ok: r.ok, message: r.message }); return r; };

export const ErpService = {
  test: (c: ErpConfig) => logged('Test connection', call(c, c.pingPath, 'GET')),

  /** Sends the given orders in batches of 50 and remembers what was sent. */
  async send(c: ErpConfig, orders: Order[], what: string, onProgress?: (done: number, total: number) => void): Promise<ErpResult> {
    if (orders.length === 0) return { ok: true, message: 'Nothing new to send.' };
    const sent = loadSent();
    let done = 0;
    for (let i = 0; i < orders.length; i += 50) {
      const batch = orders.slice(i, i + 50);
      const r = await call(c, c.ordersPath, 'POST', { source: 'zaylow', event: 'orders.sync', sent_at: new Date().toISOString(), orders: batch.map(orderPayload) });
      if (!r.ok) { saveSent(sent); const m = `Stopped after ${done} of ${orders.length}. ${r.message}`; addLog({ what, ok: false, message: m }); return { ok: false, message: m }; }
      batch.forEach((o) => { sent[o.id] = o.status; });
      done += batch.length; onProgress?.(done, orders.length);
    }
    saveSent(sent);
    const m = `Sent ${done} order${done === 1 ? '' : 's'}.`;
    addLog({ what, ok: true, message: m });
    return { ok: true, message: m };
  },

  /** Today's orders that are new, or whose status changed since they were last sent. */
  pendingToday: (orders: Order[]) => { const sent = loadSent(); const today = localDay(new Date()); return orders.filter((o) => localDay(o.createdAt) === today && sent[o.id] !== o.status); },
  sentCount: (orders: Order[]) => { const sent = loadSent(); return orders.filter((o) => sent[o.id] !== undefined).length; },
};
