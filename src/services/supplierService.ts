import { supabase } from './supabase';

const db = supabase as any;
const BUCKET = 'supplier-bills';

export type SupplierKind = 'product' | 'box' | 'cover' | 'other';
export const KIND_LABEL: Record<SupplierKind, string> = { product: 'Product', box: 'Packing box', cover: 'Packing cover', other: 'Shop or other' };

export interface Supplier {
  id: string; created_at: string; name: string; kind: SupplierKind;
  phone?: string | null; address?: string | null; gst?: string | null; bank_details?: string | null; notes?: string | null;
}
export interface Purchase {
  id: string; created_at: string; supplier_id: string; purchase_date: string; item_name: string;
  cartons: number; units_per_carton?: number | null; quantity?: number | null; price_per_carton?: number | null;
  total_paid: number; bill_path?: string | null; bill_name?: string | null; batch_id?: string | null; notes?: string | null;
}
export type SupplierInput = Omit<Supplier, 'id' | 'created_at'>;
export type PurchaseInput = Omit<Purchase, 'id' | 'created_at'>;

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/** One clear sentence for the usual cause: the owner has not run the supplier SQL yet */
export const friendlyError = (e: any): string => {
  const m = String(e?.message || e || '');
  if (/relation .*(suppliers|supplier_purchases)|schema cache|does not exist|42P01|PGRST205/i.test(m)) return 'The supplier tables are not in the database yet. Run the supplier SQL in Supabase first.';
  if (/bucket|storage/i.test(m)) return 'The bill storage is not set up yet. Run the supplier SQL in Supabase first.';
  return m || 'Something went wrong. Try again.';
};

export const SupplierService = {
  async list(): Promise<Supplier[]> {
    const { data, error } = await db.from('suppliers').select('*').order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as Supplier[];
  },
  async purchases(): Promise<Purchase[]> {
    const { data, error } = await db.from('supplier_purchases').select('*').order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return ((data || []) as Purchase[]).map((p) => ({ ...p, cartons: num(p.cartons), total_paid: num(p.total_paid) }));
  },
  async save(input: SupplierInput, id?: string): Promise<Supplier> {
    const q = id ? db.from('suppliers').update(input).eq('id', id) : db.from('suppliers').insert(input);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data as Supplier;
  },
  async remove(id: string): Promise<void> {
    const { data: ps } = await db.from('supplier_purchases').select('bill_path').eq('supplier_id', id);
    const paths = ((ps || []) as { bill_path?: string }[]).map((p) => p.bill_path).filter(Boolean) as string[];
    if (paths.length) await db.storage.from(BUCKET).remove(paths);
    const { error } = await db.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  },
  async uploadBill(file: File): Promise<{ path: string; name: string }> {
    const clean = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${new Date().getFullYear()}/${Date.now()}_${clean}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (error) throw error;
    return { path, name: file.name };
  },
  async billUrl(path: string): Promise<string | null> {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 600);
    return error ? null : (data?.signedUrl as string);
  },
  async savePurchase(input: PurchaseInput, id?: string): Promise<Purchase> {
    const q = id ? db.from('supplier_purchases').update(input).eq('id', id) : db.from('supplier_purchases').insert(input);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data as Purchase;
  },
  async removePurchase(p: Purchase): Promise<void> {
    if (p.bill_path) await db.storage.from(BUCKET).remove([p.bill_path]);
    const { error } = await db.from('supplier_purchases').delete().eq('id', p.id);
    if (error) throw error;
  },
};

/** Totals for one supplier from its purchases */
export const totalsFor = (list: Purchase[]) => {
  const cartons = list.reduce((s, p) => s + num(p.cartons), 0);
  const spent = list.reduce((s, p) => s + num(p.total_paid), 0);
  const last = list.reduce<string>((m, p) => (p.purchase_date > m ? p.purchase_date : m), '');
  return { cartons, spent, last, count: list.length, perCarton: cartons > 0 ? spent / cartons : 0 };
};
