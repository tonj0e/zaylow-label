import type { Order } from '../types';

/** One row of the India Post "My Booking" list, after the columns were picked. */
export interface Booking {
  row: number;
  article: string;
  name: string;
  pin: string;
  phone: string;
  date?: string;
  /** India Post's latest event, e.g. "Item Delivered(Addressee)". */
  status?: string;
  /** COD amount India Post holds for this article, if any. */
  cod?: number;
}

export interface Candidate {
  orderId: string;
  score: number;
  /** Plain-language reasons, shown to the person confirming the match. */
  reasons: string[];
}

export type Confidence = 'sure' | 'check' | 'none';

export interface MatchResult {
  booking: Booking;
  confidence: Confidence;
  candidates: Candidate[];
  /** The order we propose (sure and check matches). */
  chosen?: string;
  note?: string;
}

const letters = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s: string) => letters(s).replace(/\s/g, '');
export const pinOf = (s: string) => (String(s || '').match(/\b(\d{6})\b/) || [])[1] || '';
export const mobileOf = (s: string) => (String(s || '').match(/(?:\+?91[\s-]*)?([6-9]\d{9})/) || [])[1] || '';

/** 1 - (edit distance / longer length): 1 means identical. */
const similarity = (x: string, y: string): number => {
  const n = x.length, m = y.length;
  if (!n || !m) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
};

/** 0 = different, 1 = same first name, 2 = one name starts the other, 3 = same name. */
export const nameScore = (a: string, b: string): number => {
  const sa = squash(a);
  const sb = squash(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 3;
  if (sa.startsWith(sb) || sb.startsWith(sa)) return 2;
  // spelling differences ("Rakshita" / "Rakshitha", "Mohamed" / "Muhammed") count as a similar name
  if (similarity(sa, sb) >= 0.8) return 2;
  const ta = letters(a).split(' ');
  const tb = letters(b).split(' ');
  if (ta[0] && ta[0] === tb[0]) return ta.slice(1).some((t) => t.length > 1 && tb.includes(t)) ? 2 : 1;
  return 0;
};

const reasonsFor = (name: number, pin: boolean, phone: boolean) => {
  const r: string[] = [];
  if (phone) r.push('same mobile number');
  if (pin) r.push('same PIN code');
  if (name === 3) r.push('same name');
  else if (name === 2) r.push('similar name');
  else if (name === 1) r.push('same first name');
  return r;
};

/**
 * Match India Post bookings to orders that have no tracking number yet.
 *  - sure:  PIN + exact name, or the mobile number plus anything else, and nothing else is as good
 *  - check: a plausible candidate, but a person should look
 *  - none:  nothing close
 * Each order is proposed for at most one booking.
 */
export function matchBookings(bookings: Booking[], orders: Order[], takenArticles: Set<string> = new Set()): MatchResult[] {
  const eligible = orders.filter((o) => !o.trackingNumber && o.status !== 'Cancelled');
  const byPin = new Map<string, Order[]>();
  const byPhone = new Map<string, Order[]>();
  eligible.forEach((o) => {
    const pin = pinOf(o.customer.pinCode);
    if (pin) byPin.set(pin, [...(byPin.get(pin) || []), o]);
    const ph = mobileOf(o.customer.phone);
    if (ph) byPhone.set(ph, [...(byPhone.get(ph) || []), o]);
  });

  const results: MatchResult[] = bookings.map((b) => {
    if (!b.article) return { booking: b, confidence: 'none', candidates: [], note: 'No article number in this row.' };
    if (takenArticles.has(b.article)) return { booking: b, confidence: 'none', candidates: [], note: 'This article number is already saved on an order.' };

    const pool = new Map<string, Order>();
    (byPin.get(pinOf(b.pin)) || []).forEach((o) => pool.set(o.id, o));
    (byPhone.get(mobileOf(b.phone)) || []).forEach((o) => pool.set(o.id, o));

    const candidates: Candidate[] = [];
    pool.forEach((o) => {
      const name = nameScore(b.name, o.customer.name);
      const pin = !!pinOf(b.pin) && pinOf(b.pin) === pinOf(o.customer.pinCode);
      const phone = !!mobileOf(b.phone) && mobileOf(b.phone) === mobileOf(o.customer.phone);
      const cod = !!b.cod && o.paymentType === 'COD' && b.cod === o.codAmount;
      const score = (pin ? 2 : 0) + name + (phone ? 4 : 0) + (cod ? 1 : 0);
      const reasons = reasonsFor(name, pin, phone);
      if (cod) reasons.push('same COD amount');
      if (score >= 3) candidates.push({ orderId: o.id, score, reasons });
    });
    candidates.sort((x, y) => y.score - x.score);

    const top = candidates[0];
    if (!top) return { booking: b, confidence: 'none', candidates: [], note: 'No order with this name and PIN code.' };
    const second = candidates[1];
    const unique = !second || second.score < top.score;
    const confidence: Confidence = top.score >= 5 && unique ? 'sure' : 'check';
    return { booking: b, confidence, candidates, chosen: top.orderId, note: !unique ? 'More than one order looks the same. Pick the right one.' : undefined };
  });

  // One order cannot belong to two bookings: if several bookings picked it, a person decides.
  const picks = new Map<string, number>();
  results.forEach((r) => { if (r.chosen) picks.set(r.chosen, (picks.get(r.chosen) || 0) + 1); });
  results.forEach((r) => {
    if (r.chosen && (picks.get(r.chosen) || 0) > 1) {
      r.confidence = 'check';
      r.note = 'Two bookings point to the same order. Choose which one it is.';
    }
  });
  return results;
}

const HEADER_RULES = {
  article: [/article[\s_-]*(no|num|number|id)/i, /tracking/i, /consignment/i, /awb/i, /barcode/i, /booking[\s_-]*(id|no|number)/i, /article/i],
  name: [/receiver[\s_-]*name/i, /consignee/i, /addressee/i, /recipient/i, /receiver/i, /customer[\s_-]*name/i, /^name$/i, /name/i],
  pin: [/(receiver|destination|delivery).*pin/i, /pin[\s_-]*code/i, /pincode/i, /postal/i, /zip/i, /pin/i],
  phone: [/(receiver|consignee).*(mobile|phone)/i, /mobile/i, /phone/i, /contact/i],
  date: [/booking[\s_-]*date/i, /booked[\s_-]*on/i, /date/i],
  status: [/event[\s_-]*desc/i, /last[\s_-]*event/i, /delivery[\s_-]*status/i, /status/i, /event/i],
  cod: [/vp[\s_-]*cod[\s_-]*value/i, /cod[\s_-]*(amount|value)/i, /(^|[^a-z])cod([^a-z]|$)/i], // not "Pincode"
} satisfies Record<string, RegExp[]>;

export type ColumnPick = Record<keyof typeof HEADER_RULES, string>;

/** Guess which spreadsheet column is which. Sender and booking-office columns are skipped for name, PIN and phone. */
export function detectColumns(headers: string[]): ColumnPick {
  const pick = (key: keyof typeof HEADER_RULES) => {
    const anyColumn = key === 'article' || key === 'date' || key === 'status' || key === 'cod';
    const usable = anyColumn ? headers : headers.filter((h) => !/sender|from|origin|booking[\s_-]*office/i.test(h));
    for (const re of HEADER_RULES[key]) {
      const hit = usable.find((h) => re.test(h));
      if (hit) return hit;
    }
    return '';
  };
  return { article: pick('article'), name: pick('name'), pin: pick('pin'), phone: pick('phone'), date: pick('date'), status: pick('status'), cod: pick('cod') };
}

export const cleanArticle = (v: unknown) => String(v ?? '').toUpperCase().replace(/\s+/g, '').trim();
export const looksLikeArticle = (v: string) => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(v);

export type StatusKind = 'delivered' | 'returned' | 'transit';

/** Reads India Post's wording: "Item Delivered(Addressee)", "Item Returned to Sender", "Taken out for delivery"... */
export function classifyStatus(text?: string): StatusKind {
  const t = (text || '').toLowerCase();
  if (/(not|non|un)[\s-]?delivered/.test(t)) return 'transit';
  // "Item Delivered(Sender)" means it went back to you; only "(Addressee)" is a real delivery
  if (/delivered\s*\(\s*sender/.test(t)) return 'returned';
  if (/\bdelivered\b/.test(t) || /delivery confirmed/.test(t)) return 'delivered';
  if (/return(ed)?\s*to\s*(sender|origin)/.test(t) || /\brts\b/.test(t) || /\bitem returned\b/.test(t)) return 'returned';
  return 'transit';
}

const toNumber = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function rowsToBookings(rows: Record<string, unknown>[], cols: ColumnPick): Booking[] {
  return rows.map((r, i) => ({
    row: i + 2,
    article: cleanArticle(cols.article ? r[cols.article] : ''),
    name: String((cols.name ? r[cols.name] : '') ?? '').trim(),
    pin: String((cols.pin ? r[cols.pin] : '') ?? '').trim(),
    phone: String((cols.phone ? r[cols.phone] : '') ?? '').trim(),
    date: cols.date ? String(r[cols.date] ?? '') : undefined,
    status: cols.status ? String(r[cols.status] ?? '').trim() : undefined,
    cod: cols.cod ? toNumber(r[cols.cod]) : undefined,
  })).filter((b) => b.article || b.name || b.pin);
}

export interface StatusUpdate {
  booking: Booking;
  order: Order;
  next: 'Delivered' | 'Returned';
}

/** Articles already saved on an order whose India Post status says delivered / returned but the order does not yet. */
export function findStatusUpdates(bookings: Booking[], orders: Order[]): StatusUpdate[] {
  const byArticle = new Map<string, Order>();
  orders.forEach((o) => { if (o.trackingNumber) byArticle.set(o.trackingNumber.toUpperCase().replace(/\s+/g, ''), o); });
  const out: StatusUpdate[] = [];
  bookings.forEach((b) => {
    const order = byArticle.get(b.article);
    if (!order || order.status === 'Cancelled') return;
    const kind = classifyStatus(b.status);
    if (kind === 'delivered' && order.status !== 'Delivered') out.push({ booking: b, order, next: 'Delivered' });
    else if (kind === 'returned' && order.status !== 'Returned') out.push({ booking: b, order, next: 'Returned' });
  });
  return out;
}
