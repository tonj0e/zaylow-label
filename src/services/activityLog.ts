import { supabase } from './supabase';

const db = supabase as any;

/**
 * Tiny usage + crash log for the AI assistant. It saves the SECTION NAME when a page is opened and a short error text
 * when something crashes. It never saves customer data. If the table does not exist yet it quietly stops.
 */
let off = false;
const lastSent = new Map<string, number>();
let errorsThisLoad = 0;

const NOISE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|The play\(\) request was interrupted|AbortError|Load failed$|Failed to fetch$/i;
const clean = (t: string) => String(t || '').replace(/\d{6,}/g, '#').replace(/\s+/g, ' ').slice(0, 160);

const send = (row: { kind: 'view' | 'error'; section: string; message?: string }) => {
  if (off) return;
  Promise.resolve(db.from('app_events').insert(row))
    .then((r: any) => { if (r?.error && /does not exist|schema cache|42P01|PGRST205/i.test(String(r.error.message))) off = true; })
    .catch(() => { /* logging must never break the app */ });
};

const throttled = (key: string, ms: number) => {
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < ms) return false;
  lastSent.set(key, now);
  return true;
};

export const logView = (section: string) => { if (throttled(`v:${section}`, 5 * 60 * 1000)) send({ kind: 'view', section }); };

export const logError = (section: string, message: string) => {
  const m = clean(message);
  if (!m || NOISE.test(m) || errorsThisLoad >= 20 || !throttled(`e:${section}:${m}`, 60 * 1000)) return;
  errorsThisLoad++;
  send({ kind: 'error', section, message: m });
};

/** Catches crashes anywhere on the page and files them under the section that was open */
export const installErrorLogging = (currentSection: () => string) => {
  const onError = (e: ErrorEvent) => logError(currentSection(), e.message || 'Script error');
  const onRejection = (e: PromiseRejectionEvent) => logError(currentSection(), (e.reason && (e.reason.message || String(e.reason))) || 'Unhandled promise error');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
};
