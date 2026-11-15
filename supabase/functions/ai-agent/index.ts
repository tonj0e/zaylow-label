// ZAYLOW AI agent: watches the whole system, answers questions and writes the daily report. READ-ONLY.
//
//   POST { "mode": "chat",   "question": "...", "history": [...], "language": "en"|"ml"|"hi" }
//   POST { "mode": "report", "language": "en" }     writes the report, saves it in ai_reports, sends it to Telegram if connected
//   POST { "mode": "status" }                       { telegram: true/false }
//   POST { "mode": "telegram_test" }                sends a short test message to Telegram
//   POST { "mode": "speak", "text": "...", "language": "en"|"hi" }   natural voice (NVIDIA Magpie TTS) as a WAV in base64
//
// READ-ONLY: the AI model has no tools. It only receives a text summary and returns text. This function never runs
// anything the model says, and the only thing it writes is the saved report (ai_reports).
//
// PRIVACY: the AI model (NVIDIA free endpoint, which logs requests) only receives TOTALS, COUNTS and order IDs.
// Customer names, phones and PIN codes are added to the answer by THIS code afterwards (from your own database),
// so they never go to the AI service.
//
// Secrets: AI_API_KEY (chat), AI_MODEL, optional AI_VOICE_KEY (natural voice), optional AI_BASE_URL, optional TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
//
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// India time (UTC+5:30) days as YYYY-MM-DD
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => ist(new Date(Date.now() - n * 86400e3));
const num = (v: unknown) => Number(v) || 0;
const count = (rows: any[], key: (r: any) => string) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => { const k = key(r) || 'unknown'; m[k] = (m[k] || 0) + 1; });
  return m;
};
const ageDays = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3) : null);
const dm = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** All rows of a table, 1000 at a time, only the columns asked for */
async function all(db: any, table: string, cols: string, since?: { col: string; iso: string }): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols);
    if (since) q = q.gte(since.col, since.iso);
    const { data, error } = await q.order(since?.col ?? 'created_at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const SECTIONS: Record<string, string> = {
  dashboard: 'Dashboard', orders: 'All orders', generator: 'Print labels', bulk: 'Bulk import', printQueue: 'Print queue',
  settings: 'Settings', 'inventory-add': 'Receive inventory', 'inventory-list': 'Inventory', 'inventory-search': 'Search stock',
  returns: 'Returns', 'inventory-out': 'Inventory out', 'stock-summary': 'Stock summary', reports: 'Reports', warranty: 'Warranty',
  claims: 'Claims', cartons: 'Cartons', products: 'Products', 'warranty-cards': 'Warranty cards', tracking: 'Tracking and COD',
  erp: 'ERP connection', 'shipping-map': 'Shipping map', suppliers: 'Suppliers', agent: 'AI assistant',
};

type Detail = { date: string; name: string; phone: string; pin: string; product: string; reason: string };

/** Everything the system knows. `facts` goes to the AI (no personal data). `returned` stays in this function. */
async function collect(db: any) {
  const today = daysAgo(0), yesterday = daysAgo(1), d7 = daysAgo(6), d30 = daysAgo(29);
  const failed: string[] = [];
  const safe = <T,>(name: string, p: Promise<T>): Promise<T | null> => p.catch((e) => { failed.push(`${name}: ${String(e?.message || e).slice(0, 80)}`); return null; });
  const since8 = new Date(Date.now() - 8 * 86400e3).toISOString();

  const [orders, itemRows, returnRows, spRows, supRows, batchRows, cartonRows, events] = await Promise.all([
    all(db, 'orders', 'inventory_id, status, payment_type, cod_amount, courier, product_name, tracking_id, pincode, mobile, customer_name, remarks, created_at, updated_at'),
    safe('inventory_items', all(db, 'inventory_items', 'product_name, status')),
    safe('returns', all(db, 'returns', 'order_id, customer, mobile, product, return_reason, status, created_at')),
    safe('supplier_purchases', all(db, 'supplier_purchases', 'supplier_id, cartons, total_paid, purchase_date, created_at')),
    safe('suppliers', db.from('suppliers').select('id, name').then((r: any) => { if (r.error) throw new Error(r.error.message); return r.data || []; })),
    safe('inventory_batches', all(db, 'inventory_batches', 'created_at')),
    safe('cartons', all(db, 'cartons', 'created_at')),
    safe('app_events', all(db, 'app_events', 'kind, section, message, created_at', { col: 'created_at', iso: since8 })),
  ]);

  const day = (o: any) => ist(new Date(o.created_at || Date.now()));
  const on = (d: string) => orders.filter((o) => day(o) === d);
  const since = (d: string) => orders.filter((o) => day(o) >= d);
  const live = orders.filter((o) => o.status !== 'Cancelled');
  const shippedCod = orders.filter((o) => o.status === 'Shipped' && o.payment_type === 'COD');
  const stuck = orders.filter((o) => o.status === 'Shipped' && (ageDays(o.updated_at) ?? 0) > 7);
  const perDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) perDay[daysAgo(i)] = on(daysAgo(i)).length;

  // ---- data problems (counts + a few order IDs, no personal data) ----
  const problem = (list: any[]) => ({ count: list.length, sample_order_ids: list.slice(0, 5).map((o) => o.inventory_id) });
  const trk = new Map<string, number>();
  orders.forEach((o) => { const t = String(o.tracking_id || '').trim().toUpperCase(); if (t) trk.set(t, (trk.get(t) || 0) + 1); });
  const dupTrk = [...trk].filter(([, n]) => n > 1);
  const problems = {
    shipped_without_tracking_number: problem(orders.filter((o) => o.status === 'Shipped' && !String(o.tracking_id || '').trim())),
    pincode_not_6_digits: problem(live.filter((o) => digits(o.pincode).length !== 6)),
    phone_not_10_digits: problem(live.filter((o) => { const d = digits(o.mobile); return d.length !== 10 && !(d.length === 12 && d.startsWith('91')); })),
    cod_orders_with_zero_amount: problem(live.filter((o) => o.payment_type === 'COD' && num(o.cod_amount) <= 0)),
    waiting_to_print_over_2_days: problem(live.filter((o) => ['Pending', 'Processing', 'Label Generated'].includes(o.status) && (ageDays(o.updated_at) ?? 0) > 2)),
    printed_but_not_shipped_over_2_days: problem(live.filter((o) => o.status === 'Printed' && (ageDays(o.updated_at) ?? 0) > 2)),
    shipped_over_7_days_not_delivered: problem(stuck),
    tracking_numbers_used_twice: { count: dupTrk.length, sample_tracking_numbers: dupTrk.slice(0, 5).map(([t]) => t) },
  };

  // ---- stock ----
  let stock: any[] = [];
  if (itemRows) {
    const m = new Map<string, { available: number; shipped_or_sold: number; returned: number; total: number }>();
    itemRows.forEach((i) => {
      const k = i.product_name || 'unknown';
      const e = m.get(k) || { available: 0, shipped_or_sold: 0, returned: 0, total: 0 };
      e.total++;
      if (i.status === 'In Stock') e.available++;
      else if (['Reserved', 'Packed', 'Shipped', 'Delivered'].includes(i.status)) e.shipped_or_sold++;
      else if (i.status === 'Returned') e.returned++;
      m.set(k, e);
    });
    stock = [...m].map(([product, v]) => ({ product, ...v, low: v.available <= 20, out: v.available <= 0 })).sort((a, b) => a.available - b.available);
  }

  // ---- returns: totals for the AI, details kept here ----
  let returns: any = null;
  const returned: Detail[] = [];
  if (returnRows) {
    const rd = (x: any) => ist(new Date(x.created_at));
    returns = { total: returnRows.length, today: returnRows.filter((x) => rd(x) === today).length, last7days: returnRows.filter((x) => rd(x) >= d7).length, last30days: returnRows.filter((x) => rd(x) >= d30).length };
    const byId = new Map<string, any>(orders.map((o) => [o.inventory_id, o]));
    returnRows.filter((x) => rd(x) >= d7).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 40).forEach((x) => {
      const o = byId.get(x.order_id) || {};
      returned.push({ date: dm(rd(x)), name: x.customer || o.customer_name || '', phone: digits(x.mobile || o.mobile), pin: digits(o.pincode), product: x.product || o.product_name || '', reason: String(x.return_reason || '').trim().slice(0, 60) });
    });
  }

  // ---- suppliers ----
  let suppliers: any = null;
  if (spRows) {
    const names = new Map<string, string>(((supRows as any[]) || []).map((s: any) => [s.id, s.name]));
    const month = today.slice(0, 7);
    const per: Record<string, { cartons: number; spent: number }> = {};
    spRows.forEach((p) => { const n = names.get(p.supplier_id) || 'unknown'; per[n] = per[n] || { cartons: 0, spent: 0 }; per[n].cartons += num(p.cartons); per[n].spent += num(p.total_paid); });
    suppliers = {
      spent_this_month: spRows.filter((p) => String(p.purchase_date).startsWith(month)).reduce((s, p) => s + num(p.total_paid), 0),
      spent_all_time: spRows.reduce((s, p) => s + num(p.total_paid), 0),
      per_supplier_all_time: per,
    };
  }

  // ---- how long since each kind of work was last done (from the data itself) ----
  const last = (rows: any[] | null, key: (r: any) => string | null | undefined) => {
    if (!rows) return 'unknown (could not be read)';
    if (rows.length === 0) return 'never';
    const best = rows.map(key).filter(Boolean).sort().pop();
    const a = ageDays(best as string);
    return a === null ? 'unknown' : `${a} days ago`;
  };
  const tagDays = (re: RegExp) => {
    const list = orders.map((o) => (String(o.remarks || '').match(re) || [])[1]).filter(Boolean) as string[];
    return list.length ? `${ageDays(list.sort().pop() + 'T00:00:00Z')} days ago` : 'never';
  };
  const lastWork = {
    new_order_created: last(orders, (o) => o.created_at),
    order_marked_delivered_by_tracking: tagDays(/DLV:(\d{4}-\d{2}-\d{2})/),
    return_logged: last(returnRows, (r) => r.created_at),
    stock_received: last(batchRows, (b) => b.created_at),
    carton_created: last(cartonRows, (c) => c.created_at),
    supplier_purchase_added: last(spRows, (p) => p.created_at),
    warranty_card_printed: tagDays(/WCP:(\d{4}-\d{2}-\d{2})/),
  };

  // ---- which sections people opened, and which crashed (from the app's own usage log) ----
  let sectionUse: any = null;
  let appErrors: any = null;
  if (events) {
    const views = events.filter((e) => e.kind === 'view');
    const firstSeen = events.length ? events.map((e) => e.created_at).sort()[0] : null;
    const use: Record<string, any> = {};
    Object.keys(SECTIONS).forEach((k) => {
      const v = views.filter((e) => e.section === k);
      const lastV = v.map((e) => e.created_at).sort().pop();
      use[SECTIONS[k]] = { opened_last_24h: v.filter((e) => ageDays(e.created_at)! < 1).length, opened_last_3_days: v.filter((e) => ageDays(e.created_at)! < 3).length, opened_last_7_days: v.length, last_opened: lastV ? `${ageDays(lastV)} days ago` : 'not opened in the last 8 days' };
    });
    const trackAge = firstSeen ? ageDays(firstSeen) : 0;
    sectionUse = {
      usage_tracking_started_days_ago: trackAge,
      enough_history_to_say_a_section_is_unused_for_3_days: (trackAge ?? 0) >= 3,
      note: events.length === 0
        ? 'No usage events yet. Usage tracking is new, so a section showing "not opened" may simply not have been tracked long enough.'
        : `Usage tracking has data since ${ist(new Date(firstSeen!))}. Only call a section unused for a number of days if tracking is at least that old.`,
      sections: use,
    };
    const errs = events.filter((e) => e.kind === 'error');
    const bySection: Record<string, { count: number; messages: string[] }> = {};
    errs.forEach((e) => { const k = SECTIONS[e.section] || e.section || 'unknown'; const b = (bySection[k] = bySection[k] || { count: 0, messages: [] }); b.count++; const m = String(e.message || '').slice(0, 120); if (m && !b.messages.includes(m) && b.messages.length < 3) b.messages.push(m); });
    appErrors = { crashes_last_8_days: errs.length, crashes_last_24h: errs.filter((e) => ageDays(e.created_at)! < 1).length, by_section: bySection };
  }

  const facts = {
    as_of_india_time: new Date(Date.now() + 5.5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16),
    today, yesterday,
    orders: {
      total_all_time: orders.length,
      by_status_now: count(orders, (o) => o.status),
      created_today: on(today).length,
      created_yesterday: on(yesterday).length,
      created_last7days: since(d7).length,
      created_last30days: since(d30).length,
      created_per_day_last7: perDay,
      waiting_to_print: live.filter((o) => ['Pending', 'Processing', 'Label Generated'].includes(o.status)).length,
      printed_not_shipped: live.filter((o) => o.status === 'Printed').length,
      by_courier_last30days: count(since(d30), (o) => o.courier),
      products_ordered_today: count(on(today), (o) => o.product_name),
      products_ordered_last7days: count(since(d7), (o) => o.product_name),
      cod_orders_last30days: since(d30).filter((o) => o.payment_type === 'COD').length,
      prepaid_orders_last30days: since(d30).filter((o) => o.payment_type !== 'COD').length,
    },
    money: { cod_money_coming_from_shipped_parcels_rupees: shippedCod.reduce((s, o) => s + num(o.cod_amount), 0), cod_shipped_parcels: shippedCod.length },
    parcels_shipped_over_7_days_not_delivered: stuck.length,
    claims_open: orders.filter((o) => o.status === 'Claims').length,
    returns, stock, suppliers,
    days_since_last_work_in_each_area: lastWork,
    data_problems: problems,
    sections_usage_from_app_log: sectionUse,
    app_crashes: appErrors,
    parts_of_the_system_that_could_not_be_read: failed,
  };
  return { facts, returned };
}

const LANG: Record<string, string> = { en: 'English', ml: 'Malayalam', hi: 'Hindi' };

async function askAI(system: string, messages: { role: string; content: string }[]): Promise<string> {
  const key = Deno.env.get('AI_API_KEY');
  if (!key) throw new Error('The AI key is not set. Add AI_API_KEY in Supabase > Edge Functions > Secrets.');
  const base = (Deno.env.get('AI_BASE_URL') || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const model = Deno.env.get('AI_MODEL') || 'nvidia/nemotron-3.5-bolt-e4b';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: 2500, messages: [{ role: 'system', content: system }, ...messages],
      // Nemotron models "think" first and can use up all the space before answering: switch thinking off (faster, and the answer always arrives)
      ...(/nemotron/i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
    signal: AbortSignal.timeout(110000), // Supabase stops a function at about 150 s, so stop the AI first and say why
  }).catch((e) => { throw new Error(e?.name === 'TimeoutError' ? `The AI model (${model}) did not answer within 110 seconds. Try a smaller, faster model in the AI_MODEL secret.` : `Could not reach the AI service: ${e?.message || e}`); });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`The AI service said: ${body?.error?.message || body?.detail || body?.message || res.status}`);
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`The AI sent an empty answer (${body?.choices?.[0]?.finish_reason || 'no reason given'}). Try again, or use a model that does not think first.`);
  return String(text).trim();
}

const systemPrompt = (facts: unknown, language: string) => `You are the ZAYLOW system monitor and assistant for the owner of a small Indian online shop that sells massagers and ships with India Post and DTDC. You can only READ. You cannot change anything, and you must never say that you changed or will change something. When something is broken or needs a change, tell the owner to take the exact problem text to their developer (Claude) in the code chat, who fixes it.
Use ONLY the facts in DATA below. Never invent or guess a number.
UNUSED SECTIONS RULE: only say a section is unused or not opened for N days if sections_usage_from_app_log.usage_tracking_started_days_ago is at least N. If tracking is newer than that, say clearly that usage tracking only started that many days ago, so it is too early to judge, and use days_since_last_work_in_each_area instead (for example days since the last return or stock received). If the answer is not in DATA, say you do not have that information.
DATA has totals and counts only. It has NO customer names, phone numbers or PIN codes. If the owner asks for customer details, say the app adds them below your answer.
Money is in rupees (use Rs). Use simple, friendly words for someone who is not fluent in English. No tables.
HOW TO ANSWER: give the direct answer first in one sentence. Then EXPLAIN it in 3 to 6 short lines using the numbers in DATA: compare with yesterday or the last 7 days when you can, say what the number means for the business, and say what the owner could do next. Never reply with only one line, unless the question is a simple greeting.
If the owner asks "why" or "explain", give a fuller explanation (up to 10 short lines). You only have totals, so explain what the numbers show and say clearly what you cannot know.
Reply in ${LANG[language] || 'English'}.
${(Deno.env.get('AI_EXTRA_RULES') || '').slice(0, 1500)}
DATA (India time):
${JSON.stringify(facts)}`;

const REPORT_REQUEST = `Write the daily monitoring report for the owner. Use these headings, each followed by short lines:
1. How the day went (one line)
2. Orders: today vs yesterday, last 7 days, waiting to print, printed but not shipped, shipped, courier split
3. Returns: how many today and this week (the names, phones and PIN codes are added below by the app, so do not write any)
4. Money: COD money coming, supplier spending this month
5. Stock: every product with its available number; say clearly which are low (20 or fewer) or out
6. Section health: for each area in days_since_last_work_in_each_area and sections_usage_from_app_log say if it is being used. Name every section that has not been opened or used for 3 days or more as "not used". Be careful: if usage tracking is new, say so.
7. Not working: list every app crash, every part that could not be read, and every data problem with a count above 0 (use the order IDs from DATA). For each, one line saying what is wrong and what it affects.
8. For the developer: write a short list the owner can copy to Claude. Each item: section name, what is wrong, order IDs or error text.
9. Do tomorrow: 2 or 3 short actions.
If a heading has nothing wrong, write "All good". Be complete but keep each line short.`;

/** The returned customers block. Built here from your own database, never sent to the AI service. */
const returnedBlock = (rows: Detail[]) => {
  const title = 'Returned customers (last 7 days), from your database and not sent to the AI';
  if (rows.length === 0) return `\n\n${title}\nNo returns in the last 7 days.`;
  return `\n\n${title}\n` + rows.map((r) => `• ${r.date} · ${r.name || 'no name'} · ${r.phone || 'no phone'} · PIN ${r.pin || 'unknown'} · ${r.product || 'product?'}${r.reason ? ` · ${r.reason}` : ''}`).join('\n');
};


// ---- natural voice (NVIDIA Magpie TTS multilingual, free trial credits, same NVIDIA key) ----
const TTS_BASE = 'https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio';
let voiceCache: string[] | null = null;
const TTS_LANG: Record<string, { code: string; tag: string }> = { en: { code: 'en-US', tag: 'EN-US' }, hi: { code: 'hi-IN', tag: 'HI-IN' } };

async function ttsVoices(key: string): Promise<string[]> {
  if (voiceCache) return voiceCache;
  const r = await fetch(`${TTS_BASE}/list_voices`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`The NVIDIA voice service said: ${r.status} ${t.slice(0, 120)}`);
  voiceCache = [...new Set(t.match(/Magpie-Multilingual\.[A-Z]{2}-[A-Z]{2}\.[A-Za-z0-9_-]+/g) || [])];
  return voiceCache;
}

const b64 = (bytes: Uint8Array) => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
/** Raw 16-bit audio gets a WAV header so the browser can play it */
const wav = (pcm: Uint8Array, rate: number) => {
  if (pcm.length > 4 && pcm[0] === 0x52 && pcm[1] === 0x49 && pcm[2] === 0x46 && pcm[3] === 0x46) return pcm;
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44); return out;
};

async function speak(text: string, language: string): Promise<{ audio: string; voice: string }> {
  // the voice can have its own NVIDIA key (AI_VOICE_KEY); if it has none, the chat key is used
  const key = Deno.env.get('AI_VOICE_KEY') || Deno.env.get('AI_API_KEY');
  if (!key) throw new Error('The voice key is not set. Add AI_VOICE_KEY in Supabase > Edge Functions > Secrets.');
  const lang = TTS_LANG[language];
  if (!lang) throw new Error('No natural voice for this language. The phone or browser voice is used instead.');
  const voices = await ttsVoices(key);
  const mine = voices.filter((v) => v.includes(`.${lang.tag}.`));
  const voice = mine.find((v) => /\.Aria$/.test(v)) || mine[0];
  if (!voice) throw new Error(`NVIDIA has no ${lang.code} voice on this key.`);
  const form = new FormData();
  form.append('text', text.slice(0, 400)); form.append('language', lang.code); form.append('voice', voice);
  form.append('encoding', 'LINEAR_PCM'); form.append('sample_rate_hz', '22050');
  const r = await fetch(`${TTS_BASE}/synthesize`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`The NVIDIA voice service said: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return { audio: b64(wav(new Uint8Array(await r.arrayBuffer()), 22050)), voice };
}

async function telegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN'), chat = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chat) return { ok: false, error: 'Telegram is not connected. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Supabase > Edge Functions > Secrets.' };
  // Telegram allows 4096 characters per message, so long reports go in parts
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 3800) { let cut = rest.lastIndexOf('\n', 3800); if (cut < 1500) cut = 3800; parts.push(rest.slice(0, cut)); rest = rest.slice(cut); }
  parts.push(rest);
  for (const p of parts) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: p }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); return { ok: false, error: `Telegram said: ${b?.description || r.status}` }; }
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    // who is calling: a signed-in user, or the daily schedule using the service key
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const isCron = !!SERVICE && bearer === SERVICE;
    if (!isCron) {
      const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
      const { data, error } = await asUser.auth.getUser(bearer);
      if (error || !data?.user) return json({ error: 'Sign in first.' }, 401);
    }
    const db = createClient(URL_, SERVICE);
    const payload = await req.json().catch(() => ({}));
    const language = ['en', 'ml', 'hi'].includes(payload?.language) ? payload.language : 'en';

    if (payload?.mode === 'speak') {
      const text = String(payload?.text || '').trim();
      if (!text) return json({ error: 'No text to speak.' }, 400);
      return json(await speak(text, language));
    }
    if (payload?.mode === 'status') {
      return json({ telegram: !!(Deno.env.get('TELEGRAM_BOT_TOKEN') && Deno.env.get('TELEGRAM_CHAT_ID')), model: Deno.env.get('AI_MODEL') || null });
    }
    if (payload?.mode === 'telegram_test') {
      const r = await telegram('ZAYLOW assistant: Telegram is connected. The daily report will arrive here.');
      return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
    }

    if (payload?.mode === 'report') {
      const { facts, returned } = await collect(db);
      const ai = await askAI(systemPrompt(facts, language), [{ role: 'user', content: REPORT_REQUEST }]);
      const text = `${ai}${returnedBlock(returned)}`;
      const { error: saveErr } = await db.from('ai_reports').upsert({ report_date: (facts as any).today, text, snapshot: facts }, { onConflict: 'report_date' });
      const tg = await telegram(`ZAYLOW daily report ${(facts as any).today}\n\n${text}`);
      return json({ answer: text, saved: !saveErr, saveError: saveErr?.message, telegram: tg.ok, telegramError: tg.ok ? undefined : tg.error });
    }

    const question = String(payload?.question || '').trim().slice(0, 600);
    if (!question) return json({ error: 'Ask a question.' }, 400);
    const history = (Array.isArray(payload?.history) ? payload.history : []).slice(-6)
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
    const t0 = Date.now();
    const { facts, returned } = await collect(db);
    const t1 = Date.now();
    let answer = await askAI(systemPrompt(facts, language), [...history, { role: 'user', content: question }])
      .catch((e) => { throw new Error(`${(e as Error).message} (reading your data took ${Math.round((t1 - t0) / 1000)} s)`); });
    // asked about returned customers, PIN codes, phones or names: add them from the database (the AI never sees them)
    if (/return|pin ?code|customer|phone|mobile|name|റിട്ടേൺ|തിരിച്ച|वापस|रिटर्न/i.test(question)) answer += returnedBlock(returned);
    return json({ answer, ms: { data: t1 - t0, ai: Date.now() - t1 } });
  } catch (e) {
    return json({ error: (e as Error).message || 'Something went wrong.' }, 500);
  }
});
