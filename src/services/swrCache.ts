/**
 * Tiny stale-while-revalidate cache.
 * Pages show the last result instantly and refresh it quietly in the background,
 * so switching between pages never waits on the network again.
 */
interface Entry<T> { data?: T; at: number; inflight?: Promise<T> }

const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

const notify = (key: string) => listeners.get(key)?.forEach((fn) => fn());

export const peek = <T>(key: string): T | undefined => store.get(key)?.data as T | undefined;

export const subscribe = (key: string, fn: () => void) => {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => { listeners.get(key)?.delete(fn); };
};

/** Fetch `key`, reusing a result younger than `maxAgeMs` and sharing one request between callers. */
export const fetchCached = <T>(key: string, fetcher: () => Promise<T>, maxAgeMs = 0): Promise<T> => {
  const e = (store.get(key) as Entry<T> | undefined) ?? { at: 0 };
  if (e.data !== undefined && Date.now() - e.at < maxAgeMs) return Promise.resolve(e.data);
  if (e.inflight) return e.inflight;
  const p = fetcher()
    .then((data) => { store.set(key, { data, at: Date.now() }); notify(key); return data; })
    .finally(() => { const cur = store.get(key) as Entry<T> | undefined; if (cur) delete cur.inflight; });
  store.set(key, { ...e, inflight: p });
  return p;
};

/** Mark a key stale (it stays visible, and the next page that asks refreshes it). */
export const invalidate = (key: string) => {
  const e = store.get(key);
  if (e) e.at = 0;
};
