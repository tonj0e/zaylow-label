import { supabase } from './supabase';
import type { Order } from '../types';

const db = supabase as any;

export interface Fund { id: string; fund_date: string; amount: number; note?: string | null }
export interface OrderGap { id: string; date: string; customer: string; phone: string; product: string; payment: string; cod: number; status: string; kind: string }
export interface BalanceRow { balance_date: string; balance: number }
export type Settings = Record<'product_cost' | 'box' | 'label' | 'bag' | 'bag_min_price' | 'shipping' | 'return_shipping' | 'default_advance' | 'price_normal' | 'price_premium', number>;
export const DEFAULT_SETTINGS: Settings = { product_cost: 248, box: 7.41, label: 0.87, bag: 8.42, bag_min_price: 600, shipping: 0, return_shipping: 0, default_advance: 100, price_normal: 499, price_premium: 699 };
export const SETTING_LABEL: Record<keyof Settings, string> = {
  product_cost: 'Product cost per piece (₹)', box: 'Carton box (₹)', label: 'Label (₹)', bag: 'Courier bag (₹)',
  bag_min_price: 'Bag used when order is ₹ or more', shipping: 'Shipping charge when the tariff is not known (₹)', return_shipping: 'Extra shipping lost on a return (₹)',
  default_advance: 'Advance paid on COD orders that have none saved (₹)', price_normal: 'Prepaid price, normal massager (₹)', price_premium: 'Prepaid price, premium massager (₹)',
};

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
export const adsError = (e: any): string => {
  const m = String(e?.message || e || '');
  if (/ad_funds|ad_balance|ad_settings|schema cache|does not exist|42P01|PGRST205/i.test(m)) return 'The Meta ads tables are not in the database yet. Run the Meta ads SQL in Supabase first.';
  return m || 'Something went wrong. Try again.';
};

export const AdsService = {
  async funds(): Promise<Fund[]> {
    const { data, error } = await db.from('ad_funds').select('*').order('fund_date', { ascending: false });
    if (error) throw error;
    return ((data || []) as Fund[]).map((f) => ({ ...f, amount: num(f.amount) }));
  },
  async balances(): Promise<BalanceRow[]> {
    const { data, error } = await db.from('ad_balance').select('*').order('balance_date', { ascending: true });
    if (error) throw error;
    return ((data || []) as BalanceRow[]).map((b) => ({ ...b, balance: num(b.balance) }));
  },
  async settings(): Promise<Settings> {
    const { data, error } = await db.from('ad_settings').select('*');
    if (error) throw error;
    const s = { ...DEFAULT_SETTINGS };
    (data || []).forEach((r: any) => { if (r.key in s) (s as any)[r.key] = num(r.value); });
    return s;
  },
  async addFund(fund_date: string, amount: number, note: string) {
    const { error } = await db.from('ad_funds').insert({ fund_date, amount, note: note || null });
    if (error) throw error;
  },
  async removeFund(id: string) {
    const { error } = await db.from('ad_funds').delete().eq('id', id);
    if (error) throw error;
  },
  async saveBalance(balance_date: string, balance: number) {
    const { error } = await db.from('ad_balance').upsert({ balance_date, balance, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async tariffs(): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('order_shipping').select('tracking_number, tariff').order('tracking_number').range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r: any) => m.set(String(r.tracking_number).toUpperCase(), num(r.tariff)));
      if (!data || data.length < 1000) break;
    }
    return m;
  },
  async saveTariffs(rows: { tracking_number: string; tariff: number }[]) {
    for (let i = 0; i < rows.length; i += 300) {
      const { error } = await db.from('order_shipping').upsert(rows.slice(i, i + 300).map((r) => ({ ...r, updated_at: new Date().toISOString() })));
      if (error) throw error;
    }
  },
  /** Old orders that never saved the advance: COD gets the usual advance, prepaid gets the product's price. Returns what would change. */
  async orderFixes(since: string, s: Settings, prices: Record<string, number>): Promise<{ id: string; remarks: string }[]> {
    const out: { id: string; remarks: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('orders').select('id, payment_type, cod_amount, remarks, product_name, status, date').gte('date', since).order('id').range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        if (r.status === 'Cancelled') return;
        const rem: string = r.remarks || '';
        if (/ADV:\d+/.test(rem)) return;
        const qty = Math.max(1, parseInt(rem.match(/QTY:(\d+)/)?.[1] || '1', 10) || 1);
        const cod = num(r.cod_amount);
        let adv = 0;
        if (r.payment_type === 'COD') adv = s.default_advance;
        else if (cod === 0) { const n = String(r.product_name || '').trim().toLowerCase().replace(/\s+/g, ' '); adv = (prices[n] || (n.includes('premium') ? s.price_premium : s.price_normal)) * qty; }
        if (adv <= 0) return;
        const next = /QTY:\d+/.test(rem) ? rem.replace(/QTY:(\d+)/, `QTY:$1 ADV:${Math.round(adv)}`) : `${rem} QTY:${qty} ADV:${Math.round(adv)}`.trim();
        out.push({ id: String(r.id), remarks: next });
      });
      if (!data || data.length < 1000) break;
    }
    return out;
  },
  /** Orders with no advance saved (COD) or no amount at all (prepaid), for the owner to check */
  async orderGaps(): Promise<OrderGap[]> {
    const out: OrderGap[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('orders').select('id, inventory_id, date, customer_name, mobile, payment_type, cod_amount, remarks, product_name, status').order('id').range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        if (r.status === 'Cancelled' || /ADV:\d+/.test(r.remarks || '')) return;
        const cod = num(r.cod_amount);
        const kind = r.payment_type === 'COD' ? 'COD, no advance saved' : cod === 0 ? 'Prepaid, no amount saved' : null;
        if (!kind) return;
        out.push({ id: String(r.inventory_id || r.id), date: String(r.date || '').slice(0, 10), customer: r.customer_name || '', phone: r.mobile || '', product: r.product_name || '', payment: r.payment_type || '', cod, status: r.status || '', kind });
      });
      if (!data || data.length < 1000) break;
    }
    const seen = new Set<string>(); // an order can have more than one row; list it once
    return out.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true))).sort((a, b) => b.date.localeCompare(a.date));
  },
  async applyOrderFixes(fixes: { id: string; remarks: string }[]) {
    for (let i = 0; i < fixes.length; i += 20) {
      await Promise.all(fixes.slice(i, i + 20).map(async (f) => {
        const { error } = await db.from('orders').update({ remarks: f.remarks }).eq('id', f.id);
        if (error) throw error;
      }));
    }
  },
  async saveSettings(s: Settings) {
    const rows = Object.entries(s).map(([key, value]) => ({ key, value }));
    const { error } = await db.from('ad_settings').upsert(rows);
    if (error) throw error;
  },
};

const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);

/**
 * Money spent per day = balance at the end of the previous reading + funds added since − balance now.
 * If some nights were skipped, the spend of that stretch is shared equally across its days.
 */
export const dailySpend = (balances: BalanceRow[], funds: Fund[]): Map<string, number> => {
  const out = new Map<string, number>();
  const b = [...balances].sort((x, y) => x.balance_date.localeCompare(y.balance_date));
  for (let i = 1; i < b.length; i++) {
    const prev = b[i - 1], cur = b[i];
    const added = funds.filter((f) => f.fund_date > prev.balance_date && f.fund_date <= cur.balance_date).reduce((s, f) => s + f.amount, 0);
    const spent = Math.max(0, prev.balance + added - cur.balance);
    const n = Math.max(1, daysBetween(prev.balance_date, cur.balance_date));
    for (let k = 1; k <= n; k++) out.set(addDays(prev.balance_date, k), (out.get(addDays(prev.balance_date, k)) || 0) + spent / n);
  }
  return out;
};

/**
 * What the customer really paid for the order. Orders before 11 Nov have no advance saved, so a COD order
 * with none gets the usual advance; a prepaid order with no amount gets its product's prepaid price.
 */
export const orderValue = (o: Order, s: Settings = DEFAULT_SETTINGS, prices: Record<string, number> = {}): number => {
  const cod = num(o.codAmount), adv = num((o as any).advancePaid);
  if (cod + adv > 0) return o.paymentType === 'COD' && adv === 0 ? cod + s.default_advance : cod + adv;
  if (o.paymentType !== 'Prepaid') return 0;
  const name = (o.item?.productName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const qty = Math.max(1, num(o.item?.quantity) || 1);
  return (prices[name] || (name.includes('premium') ? s.price_premium : s.price_normal)) * qty;
};
export const packingFor = (value: number, s: Settings) => s.box + s.label + (value >= s.bag_min_price ? s.bag : 0);

export interface DayStat {
  key: string; spend: number; orders: number; delivered: number; returned: number; cancelled: number; open: number;
  revenue: number; costs: number; profitBeforeAds: number; profit: number;
}
const empty = (key: string): DayStat => ({ key, spend: 0, orders: 0, delivered: 0, returned: 0, cancelled: 0, open: 0, revenue: 0, costs: 0, profitBeforeAds: 0, profit: 0 });

/** Group orders by the day they were placed and add ad spend; delivered orders earn, returned orders lose packing + shipping */
export const buildStats = (orders: Order[], spend: Map<string, number>, s: Settings, keyOf: (d: string) => string, tariffs: Map<string, number> = new Map(), prices: Record<string, number> = {}): DayStat[] => {
  const m = new Map<string, DayStat>();
  const get = (k: string) => { let r = m.get(k); if (!r) { r = empty(k); m.set(k, r); } return r; };
  orders.forEach((o) => {
    const day = (o.date || o.createdAt || '').slice(0, 10);
    if (!day) return;
    const r = get(keyOf(day));
    const v = orderValue(o, s, prices);
    const qty = Math.max(1, num(o.item?.quantity) || 1);
    const ship = tariffs.get((o.trackingNumber || '').toUpperCase()) ?? s.shipping;
    r.orders += 1;
    if (o.status === 'Delivered') {
      const c = s.product_cost * qty + packingFor(v, s) + ship;
      r.delivered += 1; r.revenue += v; r.costs += c; r.profitBeforeAds += v - c;
    } else if (o.status === 'Returned') {
      const c = packingFor(v, s) + ship + s.return_shipping;
      r.returned += 1; r.costs += c; r.profitBeforeAds -= c;
    } else if (o.status === 'Cancelled') r.cancelled += 1;
    else r.open += 1;
  });
  spend.forEach((v, day) => { get(keyOf(day)).spend += v; });
  const list = [...m.values()];
  list.forEach((r) => { r.profit = r.profitBeforeAds - r.spend; });
  return list.sort((a, b) => b.key.localeCompare(a.key));
};

export const weekKey = (d: string) => { const t = new Date(d + 'T00:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd); return t.toISOString().slice(0, 10); };
export const monthKey = (d: string) => d.slice(0, 7);
