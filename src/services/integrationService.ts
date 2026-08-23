/**
 * Integration Service
 * 
 * Frontend service for real courier & e-commerce API integrations.
 * All actual API calls go through Supabase Edge Functions (never direct from browser).
 */

import { supabase } from './supabase';

const anySupabase = supabase as any;

export interface IntegrationSetting {
  id: string;
  platform: string;
  name: string;
  is_active: boolean;
  api_key: string | null;
  api_secret: string | null;
  store_url: string | null;
  email: string | null;
  last_verified: string | null;
  last_sync: string | null;
}

export interface PushOrderResult {
  success: boolean;
  awb?: string;
  label_url?: string;
  shipment_id?: string;
  error?: string;
}

export class IntegrationService {

  // ── READ ALL INTEGRATIONS ─────────────────────────────────────────────────
  static async getAll(): Promise<IntegrationSetting[]> {
    const { data, error } = await anySupabase
      .from('integration_settings')
      .select('*')
      .order('id');

    if (error) {
      console.error('Failed to load integrations:', error);
      return [];
    }
    return data || [];
  }

  // ── SAVE / UPDATE CREDENTIALS ─────────────────────────────────────────────
  static async saveCredentials(
    id: string,
    credentials: {
      api_key?: string;
      api_secret?: string;
      store_url?: string;
      email?: string;
    }
  ): Promise<boolean> {
    const { error } = await anySupabase
      .from('integration_settings')
      .update({
        ...credentials,
        is_active: false, // Reset — must re-test after credential change
        last_verified: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Failed to save credentials:', error);
      return false;
    }
    return true;
  }

  // ── TEST CONNECTION ───────────────────────────────────────────────────────
  static async testConnection(platform: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await anySupabase.functions.invoke('courier-push', {
        body: { action: 'test', platform },
      });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  static async disconnect(id: string): Promise<boolean> {
    const { error } = await anySupabase
      .from('integration_settings')
      .update({
        is_active: false,
        api_key: null,
        api_secret: null,
        store_url: null,
        email: null,
        last_verified: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return !error;
  }

  // ── PUSH ORDER TO COURIER ─────────────────────────────────────────────────
  static async pushOrderToCourier(
    platform: 'delhivery' | 'shiprocket',
    order: {
      id: string;
      customer: {
        name: string;
        phone: string;
        addressLine: string;
        city: string;
        district: string;
        state: string;
        pinCode: string;
      };
      item: { productName: string; quantity: number; weightKg: number };
      codAmount: number;
      paymentType: 'COD' | 'Prepaid';
      courier: string;
    },
    warehouse: {
      name: string;
      phone: string;
      addressLine: string;
      city: string;
      state: string;
      pinCode: string;
    }
  ): Promise<PushOrderResult> {
    try {
      const { data, error } = await anySupabase.functions.invoke('courier-push', {
        body: {
          action: 'push_order',
          platform,
          order: { ...order, warehouse },
        },
      });

      if (error) throw new Error(error.message);
      return data as PushOrderResult;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── IMPORT ORDERS FROM E-COMMERCE ────────────────────────────────────────
  static async importOrders(platform: 'shopify' | 'woocommerce'): Promise<{ imported: number; total: number; error?: string }> {
    try {
      const { data, error } = await anySupabase.functions.invoke('ecommerce-sync', {
        body: { action: 'import', platform },
      });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      return { imported: 0, total: 0, error: String(err) };
    }
  }

  // ── UPDATE ORDER STATUS ON E-COMMERCE PLATFORM ───────────────────────────
  static async updateExternalOrderStatus(
    platform: 'shopify' | 'woocommerce',
    externalOrderId: string,
    trackingNumber: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await anySupabase.functions.invoke('ecommerce-sync', {
        body: {
          action: 'update_status',
          platform,
          external_order_id: externalOrderId,
          tracking_number: trackingNumber,
        },
      });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
