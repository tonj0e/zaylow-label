// Checks India Post for the latest status of every shipped parcel and marks the delivered ones.
//
//   POST  { "apply": false }   (default) dry run: reports what WOULD change, writes nothing
//   POST  { "apply": true }    writes the changes
//
// Reads the same public tracking page the older tracking-cron used (myspeedpost.com). No login or key needed.
//
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0';
import { parseSpeedPostHtml } from './parse.ts';
import type { ParsedParcel } from './parse.ts';

const MAX_ORDERS = 120; // per run, keeps each run inside the function time limit; run again for the rest

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reads the public India Post tracking page. No login, no API key.
async function trackOne(article: string): Promise<ParsedParcel | null> {
  const res = await fetch(`https://myspeedpost.com/track?n=${encodeURIComponent(article)}&sync=true`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSpeedPostHtml(await res.text(), article);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const payload = await req.json().catch(() => ({}));
    const apply = payload?.apply === true;

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: orders, error } = await supabase
      .from('orders')
      .select('inventory_id, tracking_id, remarks, warranty_start, warranty_end')
      .eq('status', 'Shipped')
      .eq('courier', 'India Post')
      .not('tracking_id', 'is', null)
      .limit(MAX_ORDERS);
    if (error) throw error;

    const list = (orders ?? []).filter((o: any) => String(o.tracking_id || '').trim());
    if (list.length === 0) return json({ mode: apply ? 'apply' : 'dry-run', checked: 0, delivered: 0, returned: 0, onTheWay: 0, changes: [] });

    const byArticle = new Map<string, any>(list.map((o: any) => [String(o.tracking_id).trim().toUpperCase(), o]));
    const articles = [...byArticle.keys()];

    const parsed: ParsedParcel[] = [];
    const failed: string[] = [];
    let notScanned = 0;
    for (const a of articles) {
      try {
        const p = await trackOne(a);
        if (p) parsed.push(p); else notScanned += 1;
      } catch (e: any) { failed.push(`${a} (${e?.message || 'failed'})`); }
      await sleep(400);
    }

    const changes: { order: string; tracking: string; to: 'Delivered' | 'Returned'; on?: string; status?: string }[] = [];
    let onTheWay = 0;
    const seen = new Set<string>();

    for (const p of parsed) {
      const order = byArticle.get(p.article);
      if (!order || seen.has(p.article)) continue;
      seen.add(p.article);
      if (!p.delivered && !p.returned) { onTheWay += 1; continue; }

      const to = p.delivered ? 'Delivered' : 'Returned';
      changes.push({ order: order.inventory_id, tracking: p.article, to, on: p.deliveredOn, status: p.lastStatus });
      if (!apply) continue;

      const update: Record<string, unknown> = { status: to };
      if (to === 'Delivered') {
        const day = p.deliveredOn ?? new Date().toISOString().slice(0, 10);
        const remarks: string = order.remarks || '';
        if (!/DLV:\d{4}-\d{2}-\d{2}/.test(remarks)) update.remarks = `${remarks} | DLV:${day}`.trim();
        // warranty starts on the day of delivery, keeping its original length
        if (order.warranty_start && order.warranty_end) {
          const days = Math.round((new Date(order.warranty_end).getTime() - new Date(order.warranty_start).getTime()) / 86_400_000);
          if (days > 0) {
            const start = new Date(day);
            const end = new Date(start);
            end.setDate(end.getDate() + days);
            update.warranty_start = start.toISOString();
            update.warranty_end = end.toISOString();
          }
        }
      }
      const { error: upErr } = await supabase.from('orders').update(update).eq('inventory_id', order.inventory_id);
      if (upErr) { console.error('Could not update', order.inventory_id, upErr.message); continue; }
      await supabase.from('inventory_items').update({ status: to, updated_at: new Date().toISOString() }).eq('order_id', order.inventory_id);
    }

    return json({
      mode: apply ? 'apply' : 'dry-run',
      checked: articles.length,
      delivered: changes.filter((c) => c.to === 'Delivered').length,
      returned: changes.filter((c) => c.to === 'Returned').length,
      onTheWay,
      notScanned,
      failed,
      changes,
    });
  } catch (err: any) {
    // never echo secrets: only the message we wrote or a generic one
    console.error('india-post-sync failed:', err?.message);
    return json({ error: err?.message || 'The India Post check failed.' }, 500);
  }
});
