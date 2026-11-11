import { supabase } from './supabase';

const anySupabase = supabase as any;
const LS_KEY = 'zaylow_prepaid_prices_v1';
const MISS_KEY = 'zaylow_prices_table_missing';
const MISS_MS = 10 * 60 * 1000; // after a miss, wait 10 minutes before asking the database again

export type PriceMap = Record<string, number>;

/** One key per product: lower case, single spaces, so "MASSAGER " and "massager" are the same product. */
export const priceKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const readLocal = (): PriceMap => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as PriceMap; } catch { return {}; }
};
const tableMissing = (): boolean => { try { return Date.now() - Number(sessionStorage.getItem(MISS_KEY) || 0) < MISS_MS; } catch { return false; } };
const markMissing = (missing: boolean) => { try { if (missing) sessionStorage.setItem(MISS_KEY, String(Date.now())); else sessionStorage.removeItem(MISS_KEY); } catch { /* storage unavailable */ } };
const writeLocal = (m: PriceMap) => { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch { /* storage unavailable */ } };

/**
 * Prepaid prices live in the database table `product_prices` so every computer sees them.
 * Until that table exists, prices are kept in this browser, and `shared` says which one we used.
 */
export class PriceService {
  static async getAll(): Promise<{ prices: PriceMap; shared: boolean }> {
    const local = readLocal();
    if (tableMissing()) return { prices: local, shared: false };
    try {
      const { data, error } = await anySupabase.from('product_prices').select('product_key, prepaid_price');
      if (error) { markMissing(true); return { prices: local, shared: false }; }
      markMissing(false);
      const db: PriceMap = {};
      (data || []).forEach((r: { product_key: string; prepaid_price: number }) => { db[r.product_key] = Number(r.prepaid_price) || 0; });
      return { prices: { ...local, ...db }, shared: true };
    } catch {
      return { prices: local, shared: false };
    }
  }

  /** Returns where the price was saved. */
  static async save(name: string, price: number): Promise<'shared' | 'browser'> {
    const key = priceKey(name);
    const local = readLocal();
    local[key] = price;
    writeLocal(local); // always keep a local copy too
    try {
      const { error } = await anySupabase.from('product_prices').upsert({ product_key: key, product_name: name.trim(), prepaid_price: price, updated_at: new Date().toISOString() }, { onConflict: 'product_key' });
      markMissing(!!error);
      return error ? 'browser' : 'shared';
    } catch {
      return 'browser';
    }
  }
}
