import type { OrderStatus } from '../../types';

export const STATUS_DOT: Record<string, string> = {
  Pending: '#f5a623', Processing: '#4f9bff', 'Label Generated': '#a78bfa', Printed: '#22c55e',
  Shipped: '#22d3ee', Delivered: '#3fb950', Cancelled: '#ff5a45', Claims: '#f472b6', Returned: '#fb923c',
};

export const STATUS_ORDER: OrderStatus[] = ['Pending', 'Processing', 'Label Generated', 'Printed', 'Shipped', 'Delivered', 'Cancelled', 'Claims', 'Returned'];
