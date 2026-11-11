import type { OrderStatus } from '../../types';

export const STATUS_DOT: Record<string, string> = {
  Pending: '#f5a623', Processing: '#8d9690', 'Label Generated': '#b4bdb6', Printed: '#86efac',
  Shipped: '#22c55e', Delivered: '#15803d', Cancelled: '#ff5a45', Claims: '#fbbf24', Returned: '#fb923c',
};

export const STATUS_ORDER: OrderStatus[] = ['Pending', 'Processing', 'Label Generated', 'Printed', 'Shipped', 'Delivered', 'Cancelled', 'Claims', 'Returned'];
