import type { Order, CompanySettings, IntegrationConfig, PrintQueueItem } from '../types';
import { INITIAL_ORDERS, INITIAL_SETTINGS, INITIAL_INTEGRATIONS } from '../data/initialSampleData';

const ORDERS_STORAGE_KEY = 'zaylow_orders_v1';
const SETTINGS_STORAGE_KEY = 'zaylow_settings_v1';
const INTEGRATIONS_STORAGE_KEY = 'zaylow_integrations_v1';
const QUEUE_STORAGE_KEY = 'zaylow_print_queue_v1';

export class StorageService {
  // --- Orders CRUD ---
  static getOrders(): Order[] {
    try {
      const data = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (!data) {
        this.saveOrders(INITIAL_ORDERS);
        return INITIAL_ORDERS;
      }
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to parse stored orders', err);
      return INITIAL_ORDERS;
    }
  }

  static saveOrders(orders: Order[]): void {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch (err) {
      console.error('Failed to save orders to localStorage', err);
    }
  }

  static addOrder(order: Order): Order {
    const orders = this.getOrders();
    const updated = [order, ...orders];
    this.saveOrders(updated);
    return order;
  }

  static updateOrder(updatedOrder: Order): void {
    const orders = this.getOrders();
    const idx = orders.findIndex(o => o.id === updatedOrder.id);
    if (idx !== -1) {
      orders[idx] = updatedOrder;
      this.saveOrders(orders);
    }
  }

  static deleteOrder(id: string): void {
    const orders = this.getOrders();
    const filtered = orders.filter(o => o.id !== id);
    this.saveOrders(filtered);
  }

  static updateOrderStatus(id: string, status: Order['status']): void {
    const orders = this.getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      orders[idx].status = status;
      if (status === 'Printed') {
        orders[idx].printedAt = new Date().toISOString();
      }
      this.saveOrders(orders);
    }
  }

  static bulkAddOrders(newOrders: Order[]): { added: number; updated: number } {
    const existing = this.getOrders();
    const existingMap = new Map(existing.map(o => [o.id, o]));
    
    let addedCount = 0;
    let updatedCount = 0;

    newOrders.forEach(o => {
      if (existingMap.has(o.id)) {
        existingMap.set(o.id, { ...existingMap.get(o.id)!, ...o });
        updatedCount++;
      } else {
        existingMap.set(o.id, o);
        addedCount++;
      }
    });

    const combined = Array.from(existingMap.values());
    this.saveOrders(combined);
    return { added: addedCount, updated: updatedCount };
  }

  // --- Settings CRUD ---
  static getSettings(): CompanySettings {
    try {
      const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!data) {
        this.saveSettings(INITIAL_SETTINGS);
        return INITIAL_SETTINGS;
      }
      const stored = JSON.parse(data) as CompanySettings;
      // Force-replace stale Unsplash placeholder logos with our real logo
      if (!stored.logoUrl || stored.logoUrl.includes('unsplash.com')) {
        stored.logoUrl = INITIAL_SETTINGS.logoUrl;
      }
      return { ...INITIAL_SETTINGS, ...stored };
    } catch {
      return INITIAL_SETTINGS;
    }
  }

  static saveSettings(settings: CompanySettings): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings', err);
    }
  }

  // --- Integrations ---
  static getIntegrations(): IntegrationConfig[] {
    try {
      const data = localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
      if (!data) {
        this.saveIntegrations(INITIAL_INTEGRATIONS);
        return INITIAL_INTEGRATIONS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_INTEGRATIONS;
    }
  }

  static saveIntegrations(integrations: IntegrationConfig[]): void {
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(integrations));
  }

  static updateIntegration(updated: IntegrationConfig): void {
    const list = this.getIntegrations();
    const idx = list.findIndex(i => i.id === updated.id);
    if (idx !== -1) {
      list[idx] = updated;
      this.saveIntegrations(list);
    }
  }

  // --- Print Queue ---
  static getPrintQueue(): PrintQueueItem[] {
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static savePrintQueue(queue: PrintQueueItem[]): void {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  }

  static addToPrintQueue(orders: Order[]): PrintQueueItem[] {
    const queue = this.getPrintQueue();
    const existingOrderIds = new Set(queue.map(q => q.order.id));

    const newItems: PrintQueueItem[] = orders
      .filter(o => !existingOrderIds.has(o.id))
      .map(o => ({
        id: `pq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        order: o,
        addedAt: new Date().toISOString(),
        status: 'queued',
        copies: 1
      }));

    const updatedQueue = [...queue, ...newItems];
    this.savePrintQueue(updatedQueue);
    return updatedQueue;
  }

  static clearPrintQueue(): void {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  }
}
