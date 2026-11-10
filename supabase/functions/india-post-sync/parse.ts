// Reads India Post "Tracking" API responses. Kept free of Deno/Node APIs so it can be tested anywhere.
// Shapes follow the developer portal docs:
//   POST /v1/tracking/bulk  ->  { success, data: [ { booking_details, tracking_details: { events }, del_status: { del_status } } ] }
//   GET  /v1/tracking/{n}   ->  { success, data: { trackingNumber, currentStatus, history: [ { timestamp, location, status } ] } }

export interface ParsedParcel {
  article: string;
  delivered: boolean;
  returned: boolean;
  /** YYYY-MM-DD, when India Post says it was delivered. */
  deliveredOn?: string;
  lastStatus?: string;
}

const clean = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return /^(null|undefined)$/i.test(s) ? '' : s;
};

export const isDeliveredText = (text: string): boolean => {
  const s = text.toLowerCase();
  if (/(not|non|un)[\s-]?delivered/.test(s)) return false;
  if (/delivered\s*\(\s*sender/.test(s)) return false; // came back to the sender
  return /\bdelivered\b/.test(s) || /delivery confirmed/.test(s);
};

export const isReturnedText = (text: string): boolean => {
  const s = text.toLowerCase();
  if (isDeliveredText(s)) return false;
  if (/delivered\s*\(\s*sender/.test(s)) return true;
  return /return(ed)?\s*to\s*(sender|origin)/.test(s) || /\brts\b/.test(s) || /\bitem returned\b/.test(s);
};

const toDay = (v: string): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

type Event = { timestamp?: unknown; status?: unknown };

const fromEvents = (events: Event[]) => {
  const list = Array.isArray(events) ? events : [];
  const last = list.length ? clean(list[list.length - 1]?.status) : '';
  const deliveredEvent = list.find((e) => isDeliveredText(clean(e?.status)));
  return { last, deliveredOn: deliveredEvent ? toDay(clean(deliveredEvent.timestamp)) : undefined };
};

export function parseBulk(json: any, requested: string[]): ParsedParcel[] {
  const data: any[] = Array.isArray(json?.data) ? json.data : [];
  return data.map((item, i) => {
    const booking = item?.booking_details ?? {};
    const article = (clean(booking.article_number) || requested[i] || '').toUpperCase();
    const delText = clean(item?.del_status?.del_status ?? (typeof item?.del_status === 'string' ? item.del_status : ''));
    const confirmedOn = clean(booking.delivery_confirmed_on);
    const { last, deliveredOn } = fromEvents(item?.tracking_details?.events);

    // An explicit delivery status wins; the last tracking event is the fallback.
    const delivered = !!confirmedOn || (delText ? isDeliveredText(delText) : isDeliveredText(last));
    const returned = !delivered && (isReturnedText(delText) || isReturnedText(last));
    return {
      article,
      delivered,
      returned,
      deliveredOn: delivered ? toDay(confirmedOn) || deliveredOn : undefined,
      lastStatus: last || delText || undefined,
    };
  });
}

export function parseSingle(json: any, requested: string): ParsedParcel {
  const d = json?.data ?? {};
  const current = clean(d.currentStatus);
  const { last, deliveredOn } = fromEvents(d.history);
  const delivered = isDeliveredText(current) || (!current && isDeliveredText(last));
  const returned = !delivered && (isReturnedText(current) || isReturnedText(last));
  return {
    article: (clean(d.trackingNumber) || requested).toUpperCase(),
    delivered,
    returned,
    deliveredOn: delivered ? deliveredOn : undefined,
    lastStatus: current || last || undefined,
  };
}

/** Reads the public myspeedpost.com tracking page (no login). Events sit in the page as HTML-escaped JSON. */
export function parseSpeedPostHtml(html: string, requested: string): ParsedParcel | null {
  const text = html.replace(/&quot;/g, '"');
  const events: { at: string; status: string }[] = [];
  const re = /"tracked_at":"([^"]+)","event":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) events.push({ at: m[1], status: m[2] });
  if (events.length === 0) return null; // not scanned yet, or the page did not load its history
  events.sort((a, b) => a.at.localeCompare(b.at));
  const last = events[events.length - 1].status;
  const deliveredEvent = events.find((e) => isDeliveredText(e.status));
  const returnedEvent = events.find((e) => isReturnedText(e.status));
  const delivered = !!deliveredEvent;
  const returned = !delivered && !!returnedEvent;
  return { article: requested.toUpperCase(), delivered, returned, deliveredOn: delivered ? toDay(deliveredEvent!.at) : undefined, lastStatus: last };
}
