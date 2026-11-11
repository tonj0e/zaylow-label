import { DataService } from './dataService';
import { fetchCached } from './swrCache';
import { PriceService } from './priceService';

/**
 * Shared data the warehouse pages need. Each key is downloaded once and shared:
 * pages show the last copy at once and refresh it quietly in the background.
 */
export const CACHE = {
  products: { key: 'products', fetch: () => DataService.getProducts() },
  cartons: { key: 'cartons', fetch: () => DataService.getCartons() },
  inventoryOut: { key: 'inventory-out', fetch: () => DataService.getInventoryOutHistory() },
  returns: { key: 'returns', fetch: () => DataService.getReturns() },
  overview: { key: 'inventory-overview', fetch: () => DataService.getInventoryOverview() },
  prices: { key: 'prepaid-prices', fetch: () => PriceService.getAll() },
} as const;

/** Start every download in parallel right after the orders arrive, so the first visit to any page is already warm. */
export const prefetchAll = () => {
  Object.values(CACHE).forEach((c) => { void fetchCached(c.key, c.fetch as () => Promise<unknown>, 30000).catch(() => {}); });
};
