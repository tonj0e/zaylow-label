import { useCallback, useEffect, useState } from 'react';
import { fetchCached, peek, subscribe } from '../services/swrCache';

/**
 * Returns cached data immediately (if any) and refreshes it in the background.
 * `loading` is only true the very first time, when there is nothing to show yet.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, freshMs = 5000) {
  const [data, setData] = useState<T | undefined>(() => peek<T>(key));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    const unsub = subscribe(key, () => { if (alive) setData(peek<T>(key)); });
    setRefreshing(true);
    fetchCached(key, fetcher, freshMs)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => console.error(`Failed to load ${key}:`, e))
      .finally(() => { if (alive) setRefreshing(false); });
    return () => { alive = false; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setData(await fetchCached(key, fetcher, 0)); } finally { setRefreshing(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading: data === undefined, refreshing, refresh };
}
