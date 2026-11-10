import type { Order } from '../types';

/** Total value of an order: what the customer pays on delivery plus what they already paid upfront. */
export const orderValue = (o: Pick<Order, 'codAmount' | 'advancePaid'>): number =>
  (o.codAmount || 0) + (o.advancePaid || 0);
