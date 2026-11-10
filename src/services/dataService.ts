import { supabase } from './supabase';
import type { Order, OrderStatus } from '../types';
import { buildRemarks } from '../utils/orderRemarks';

const anySupabase = supabase as any;

const PAGE_SIZE = 1000; // matches supabase/config.toml max_rows

/**
 * Fetch every row of a query, paging past the API's max_rows cap.
 * `build` must return a FRESH query each call (with a stable order) so that
 * pages don't overlap or skip rows.
 */
async function fetchAllRows(build: () => any): Promise<{ data: any[] | null; error: any }> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

export class DataService {
  
  // --- ORDERS ---
  
  static async getOrders(): Promise<Order[]> {
    const { data, error } = (await fetchAllRows(() => anySupabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }))) as any;
      
    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
    
    // Deduplicate by inventory_id — keep only the first (latest) row for each ZYL-XXXXX
    const seen = new Set<string>();
    const dedupedData = (data || []).filter((row: any) => {
      const key = row.inventory_id || row.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // Map database shape to local Order type
    return dedupedData.map((row: any) => {
      // Parse quantity and IDs from remarks if available (format: "QTY:X CTN:Y PRD:Z")
      const remarks = row.remarks || '';
      const quantityMatch = remarks.match(/QTY:(\d+)/);
      const advanceMatch = remarks.match(/ADV:(\d+)/);
      const deliveredMatch = remarks.match(/DLV:(\d{4}-\d{2}-\d{2})/);
      const cartonMatch = remarks.match(/CTN:([^\s]+)/);
      const productMatch = remarks.match(/PRD:([^\s]+)/);
      const districtMatch = remarks.match(/DST:([^|]+)/);
      const landmarkMatch = remarks.match(/LMK:([^|]+)/);
      
      const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
      const cartonId = cartonMatch ? cartonMatch[1] : undefined;
      const productId = productMatch ? productMatch[1] : undefined;
      const district = districtMatch ? districtMatch[1].trim() : (row.city || '');

      return {
        id: row.inventory_id || row.id,
        date: row.date,
        customer: {
          name: row.customer_name,
          phone: row.mobile || '',
          addressLine: `${row.house_name || ''} ${row.area || ''}`.trim(),
          landmark: landmarkMatch ? landmarkMatch[1].trim() : undefined,
          city: row.city || '',
          district: district,
          state: row.state || '',
          pinCode: row.pincode || ''
        },
        item: {
          productName: row.product_name || '',
          sku: row.product_id || '',
          quantity: quantity
        },
        paymentType: row.payment_type as 'COD' | 'Prepaid',
        codAmount: row.cod_amount || 0,
        advancePaid: advanceMatch ? parseInt(advanceMatch[1], 10) : 0,
        deliveredAt: deliveredMatch ? deliveredMatch[1] : undefined,
        status: row.status as OrderStatus,
        courier: (row.courier as any) || 'Custom',
        trackingNumber: row.tracking_id || undefined,
        notes: row.remarks,
        returnReason: row.return_reason,
        warrantyStart: row.warranty_start,
        warrantyEnd: row.warranty_end,
        claimDate: row.claim_date,
        claimReason: row.claim_reason,
        claimStatus: row.claim_status,
        createdAt: row.created_at || new Date().toISOString(),
        cartonId,
        productId
      };
    });
  }

  static async addOrder(order: Order): Promise<Order | null> {
    // Guard: prevent duplicate insert for the same inventory_id
    const { data: existing } = await anySupabase
      .from('orders')
      .select('inventory_id, customer_name, mobile')
      .eq('inventory_id', order.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const sameCustomer =
        (existing.customer_name || '').trim().toLowerCase() === (order.customer.name || '').trim().toLowerCase() &&
        (existing.mobile || '').replace(/\D/g, '') === (order.customer.phone || '').replace(/\D/g, '');
      if (!sameCustomer) {
        // A different customer already owns this ID: never silently reuse their order.
        console.error(`Order ID ${order.id} is already used by another customer.`);
        alert(`Order ID ${order.id} is already used by a different customer. Please generate a new Order ID and try again.`);
        return null;
      }
      // Same customer re-submitting (double click / retry): idempotent, return the existing order.
      console.warn(`Order ${order.id} already exists. Skipping duplicate insert.`);
      const allOrders = await this.getOrders();
      return allOrders.find(o => o.id === order.id) || null;
    }

    // Check if sufficient inventory exists before placing order
    try {
      const prodName = (order.item.productName || '').trim();
      // Products might already be reserved by the Scanner for this specific order
      const { count: reservedCount } = await anySupabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', order.id)
        .ilike('product_name', prodName)
        .eq('status', 'Reserved');

      const { count: inStockCount, error: countError } = await anySupabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .ilike('product_name', prodName)
        .eq('status', 'In Stock');

      if (countError) throw countError;

      const availableStock = (inStockCount || 0) + (reservedCount || 0);
      if (availableStock < order.item.quantity) {
        throw new Error(`Insufficient stock for ${order.item.productName}. Available: ${availableStock}, Requested: ${order.item.quantity}`);
      }
    } catch (error) {
      console.error('Inventory validation failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Cannot place order: ${message}`);
      return null;
    }

    // Prepare remarks with quantity, IDs, district and landmark for persistence
    let quantityRemark = `QTY:${order.item.quantity}`;
    if (order.advancePaid && order.advancePaid > 0) quantityRemark += ` ADV:${Math.round(order.advancePaid)}`;
    if (order.cartonId) quantityRemark += ` CTN:${order.cartonId}`;
    if (order.productId) quantityRemark += ` PRD:${order.productId}`;
    if (order.customer.district) quantityRemark += ` DST:${order.customer.district}`;
    if (order.customer.landmark) quantityRemark += ` LMK:${order.customer.landmark}`;
    
    const combinedRemarks = order.notes ? `${order.notes} ${quantityRemark}` : quantityRemark;

    // @ts-ignore
    const { data, error } = (await anySupabase
      .from('orders')
      .insert({
        // Let Supabase auto-generate the UUID primary key for 'id'
        inventory_id: order.id, // We store the ZYL-XXXXX ID here as a workaround!
        date: new Date().toISOString(),
        customer_name: order.customer.name,
        mobile: order.customer.phone,
        house_name: order.customer.addressLine,
        city: order.customer.city,
        state: order.customer.state,
        pincode: order.customer.pinCode,
        payment_type: order.paymentType,
        cod_amount: order.codAmount,
        courier: order.courier,
        product_name: order.item.productName,
        product_id: order.item.sku,
        status: order.status,
        remarks: combinedRemarks,
        warranty_start: order.warrantyStart || null,
        warranty_end: order.warrantyEnd || null
      })
      .select()
      .single()) as any;

    if (error) {
      console.error('Error adding order:', error);
      // Clean up any reserved items if the order insert failed
      await this.releaseProductsForOrder(order.id, 'In Stock').catch(() => {});
      return null;
    }

    // Deduct inventory from stock when order is placed
    try {
      // No-op: Inventory deduction is handled dynamically by Scanner assigning products
      await this.deductInventory(order.item.productName, order.item.quantity);
    } catch (deductError) {
      console.error('Warning: Order added but failed to deduct inventory:', deductError);
    }

    // Map the raw Supabase row back to the typed Order shape.
    // The raw row uses snake_case DB columns; the app expects camelCase nested objects.
    // Without this mapping, setting the returned value as selectedOrderForLabel would
    // cause ThermalLabel to crash (accessing undefined on order.customer / order.item).
    const row = data;
    const quantityMatch = row.remarks?.match(/QTY:(\d+)/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : order.item.quantity;

    const mappedOrder: Order = {
      id: row.inventory_id || row.id,
      date: row.date,
      customer: {
        name: row.customer_name || order.customer.name,
        phone: row.mobile || order.customer.phone,
        addressLine: row.house_name
          ? `${row.house_name} ${row.area || ''}`.trim()
          : order.customer.addressLine,
        landmark: order.customer.landmark,
        city: row.city || order.customer.city,
        district: order.customer.district || row.city || '',
        state: row.state || order.customer.state,
        pinCode: row.pincode || order.customer.pinCode,
      },
      item: {
        productName: row.product_name || order.item.productName,
        sku: row.product_id || order.item.sku,
        quantity,
        weightKg: order.item.weightKg,
      },
      paymentType: (row.payment_type as 'COD' | 'Prepaid') || order.paymentType,
      codAmount: row.cod_amount ?? order.codAmount,
      status: row.status || order.status,
      courier: row.courier || order.courier,
      trackingNumber: row.tracking_id || undefined,
      notes: row.remarks,
      createdAt: row.created_at || order.createdAt,
    };

    return mappedOrder;
  }

  /**
   * Deduct inventory from stock when an order is placed
   * @param productName The name of the product
   * @param quantity The quantity to deduct
   */
  static async deductInventory(_productName: string, _quantity: number): Promise<void> {
    // No-op: Inventory is now managed dynamically via 'inventory_items' status
    return;
  }

  static async updateOrderStatus(id: string, status: OrderStatus): Promise<boolean> {
    try {
      let updatePayload: any = { status: status as any };

      if (status === 'Delivered') {
         // Fetch existing dates to calculate duration
         // @ts-ignore
         const { data: existingOrder } = await anySupabase
           .from('orders')
           .select('warranty_start, warranty_end, remarks')
           .eq('inventory_id', id)
           .single();

         // remember the day it was delivered, so "delivered today" can be counted
         if (existingOrder && !/DLV:\d{4}-\d{2}-\d{2}/.test(existingOrder.remarks || '')) {
           updatePayload.remarks = `${existingOrder.remarks || ''} | DLV:${new Date().toISOString().slice(0, 10)}`.trim();
         }
         
         if (existingOrder && existingOrder.warranty_start && existingOrder.warranty_end) {
            const start = new Date(existingOrder.warranty_start);
            const end = new Date(existingOrder.warranty_end);
            const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
            
            if (durationDays > 0) {
              const newStart = new Date();
              const newEnd = new Date(newStart);
              newEnd.setDate(newEnd.getDate() + durationDays);
              updatePayload.warranty_start = newStart.toISOString();
              updatePayload.warranty_end = newEnd.toISOString();
            }
         }
      }

      // @ts-ignore
      const { error } = await anySupabase
        .from('orders')
        .update(updatePayload)
        .eq('inventory_id', id);

      if (error) {
        console.error('Error updating order status:', error);
        return false;
      }

      // Synchronize corresponding inventory_items status
      try {
        if (status === 'Cancelled') {
          await anySupabase
            .from('inventory_items')
            .update({
              order_id: null,
              customer_name: null,
              status: 'In Stock',
              reserved_at: null,
              updated_at: new Date().toISOString()
            })
            .eq('order_id', id);
        } else if (status === 'Shipped') {
          await anySupabase
            .from('inventory_items')
            .update({
              status: 'Shipped',
              updated_at: new Date().toISOString()
            })
            .eq('order_id', id);
        } else if (status === 'Delivered') {
          await anySupabase
            .from('inventory_items')
            .update({
              status: 'Delivered',
              updated_at: new Date().toISOString()
            })
            .eq('order_id', id);
        } else if (status === 'Returned') {
          await anySupabase
            .from('inventory_items')
            .update({
              status: 'Returned',
              updated_at: new Date().toISOString()
            })
            .eq('order_id', id);
        }
      } catch (syncErr) {
        console.warn('Warning: Order status updated but inventory items sync failed:', syncErr);
      }

      return true;
    } catch (e) {
      console.error('Exception updating order status:', e);
      return false;
    }
  }

  /**
   * Update tracking information for an order
   * @param id The order ID (ZYL-XXXXX format)
   * @param trackingNumber The tracking number from the carrier
   * @param shippingLabelUrl Optional URL to the shipping label
   */
  /**
   * Edit the customer, address, courier and payment details of an order.
   * The product, quantity, carton and stock reservation are left exactly as they were.
   */
  static async updateOrderDetails(id: string, d: {
    name: string; phone: string; addressLine: string; landmark: string; city: string; district: string;
    state: string; pinCode: string; courier: string; paymentType: 'COD' | 'Prepaid';
    codAmount: number; advancePaid: number; notes: string; warrantyDays?: number;
  }): Promise<boolean> {
    const { data: rows, error: readError } = await anySupabase.from('orders').select('*').eq('inventory_id', id).limit(1);
    if (readError || !rows || rows.length === 0) {
      console.error('Could not read order before editing:', readError);
      return false;
    }
    const row = rows[0];
    const newRemarks = buildRemarks(row.remarks, { advancePaid: d.advancePaid, district: d.district, landmark: d.landmark, notes: d.notes });

    const update: any = {
      customer_name: d.name.trim(),
      mobile: d.phone.trim(),
      house_name: d.addressLine.trim(),
      city: d.city.trim(),
      state: d.state.trim(),
      pincode: d.pinCode.trim(),
      courier: d.courier,
      payment_type: d.paymentType,
      cod_amount: d.paymentType === 'COD' ? d.codAmount : 0,
      remarks: newRemarks,
    };
    if ('area' in row) update.area = ''; // the address now lives in one field
    if (d.warrantyDays !== undefined) {
      if (d.warrantyDays > 0) {
        // keep the original start day (it moves to the delivery day when the parcel is delivered)
        const start = row.warranty_start ? new Date(row.warranty_start) : new Date();
        update.warranty_start = start.toISOString();
        update.warranty_end = new Date(start.getTime() + d.warrantyDays * 86_400_000).toISOString();
      } else {
        update.warranty_start = null;
        update.warranty_end = null;
      }
    }

    const { error } = await anySupabase.from('orders').update(update).eq('inventory_id', id);
    if (error) {
      console.error('Error updating order details:', error);
      return false;
    }
    return true;
  }

  static async updateTrackingInfo(id: string, trackingNumber: string, shippingLabelUrl: string | null = null): Promise<boolean> {
    // @ts-ignore
    const { error } = (await anySupabase
      .from('orders')
      .update({
        tracking_id: trackingNumber,
        shipping_label_url: shippingLabelUrl
      })
      .eq('inventory_id', id)) as any; // Query by inventory_id (ZYL-XXXXX)

    if (error) {
      console.error('Error updating tracking info:', error);
      return false;
    }
    return true;
  }

  /**
   * Save many tracking numbers at once (used by the India Post bookings import).
   * Only the tracking number is written, so labels already stored stay as they are, and
   * orders that were still Pending/Printed move to Shipped through the normal status path
   * (which keeps stock in sync). Runs a few requests at a time.
   */
  static async applyTrackingBatch(
    pairs: { id: string; awb: string; status: OrderStatus; next?: OrderStatus; setTracking?: boolean }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ saved: number; failed: string[] }> {
    let saved = 0;
    let done = 0;
    const failed: string[] = [];
    const toShip: OrderStatus[] = ['Pending', 'Processing', 'Label Generated', 'Printed'];
    const CHUNK = 5;

    for (let i = 0; i < pairs.length; i += CHUNK) {
      await Promise.all(pairs.slice(i, i + CHUNK).map(async (p) => {
        let ok = true;
        if (p.setTracking !== false) {
          const { error } = await anySupabase.from('orders').update({ tracking_id: p.awb }).eq('inventory_id', p.id);
          if (error) { console.error('Could not save tracking number for', p.id, error); ok = false; }
        }
        if (ok) {
          const next = p.next ?? (toShip.includes(p.status) ? 'Shipped' : p.status);
          if (next !== p.status) ok = await this.setStatusQuiet(p.id, next);
        }
        if (ok) saved += 1; else failed.push(p.id);
        done += 1;
        onProgress?.(done, pairs.length);
      }));
    }
    return { saved, failed };
  }

  /**
   * Change an order's status from an imported India Post report. Unlike a manual "Delivered" click this does
   * not stamp today's date as the delivery day, because the report does not say when it was delivered.
   */
  private static async setStatusQuiet(id: string, next: OrderStatus): Promise<boolean> {
    if (next === 'Shipped') return this.updateOrderStatus(id, 'Shipped');
    const { error } = await anySupabase.from('orders').update({ status: next }).eq('inventory_id', id);
    if (error) { console.error('Could not change status for', id, error); return false; }
    if (next === 'Delivered' || next === 'Returned') {
      await anySupabase.from('inventory_items').update({ status: next, updated_at: new Date().toISOString() }).eq('order_id', id);
    }
    return true;
  }

  /**
   * Ask the india-post-sync function to check every shipped parcel with India Post.
   * `apply: false` only reports what would change.
   */
  static async checkIndiaPostDelivery(apply: boolean): Promise<{
    ok: boolean;
    error?: string;
    checked?: number; delivered?: number; returned?: number; onTheWay?: number;
    notScanned?: number; failed?: string[];
    changes?: { order: string; tracking: string; to: 'Delivered' | 'Returned'; on?: string; status?: string }[];
  }> {
    try {
      const { data, error } = await anySupabase.functions.invoke('india-post-sync', { body: { apply } });
      if (error) {
        // FunctionsHttpError carries the response; try to show the message the function wrote
        let message = String(error.message || error);
        try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch { /* keep the default message */ }
        if (/not found|404|Failed to send a request|fetch/i.test(message) && !/India Post/i.test(message)) {
          message = 'The delivery check is not set up yet. It needs to be deployed once (see docs/india-post-setup.md).';
        }
        return { ok: false, error: message };
      }
      if (data?.error) return { ok: false, error: data.error };
      return { ok: true, ...data };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'The delivery check could not be reached.' };
    }
  }

  static async deleteOrder(id: string): Promise<boolean> {
    // Release the assigned product back to the available inventory pool
    try {
      await anySupabase
        .from('inventory_items')
        .update({
          order_id: null,
          customer_name: null,
          status: 'In Stock',
          reserved_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', id); // The order ID (ZYL-XXXXX)
    } catch (restoreError) {
      console.error('Warning: Order deleted but failed to un-reserve product:', restoreError);
    }

    const { error } = (await anySupabase
      .from('orders')
      .delete()
      .eq('inventory_id', id)) as any; // Query by inventory_id (ZYL-XXXXX)

    if (error) {
      console.error('Error deleting order:', error);
      return false;
    }

    return true;
  }

  /**
   * Restore inventory to stock when an order is deleted or cancelled
   * @param productName The name of the product
   * @param quantity The quantity to restore
   */
  static async restoreInventory(_productName: string, _quantity: number): Promise<void> {
    // No-op: Inventory restoration is now handled dynamically in deleteOrder
    return;
  }

  // --- INVENTORY ---
  
  static async addInventoryBatch(batchData: {
    arrival_date: string;
    product_name: string;
    total_pieces: number;
    landed_cost_per_piece: number;
    pieces_per_carton: number;
    price_per_piece: number;
    freight_cost: number;
    other_charges: number;
    supplier_name?: string | null;
    supplier_phone?: string | null;
    supplier_gst?: string | null;
    supplier_address?: string | null;
    invoice_no?: string | null;
    po_no?: string | null;
    sku?: string | null;
    total_cartons?: number;
  }) {
    const { data, error } = await anySupabase
      .from('inventory_batches')
      .insert({
        arrival_date: batchData.arrival_date,
        product_name: batchData.product_name,
        total_pieces: batchData.total_pieces,
        landed_cost_per_piece: batchData.landed_cost_per_piece,
        pieces_per_carton: batchData.pieces_per_carton,
        price_per_piece: batchData.price_per_piece,
        freight_cost: batchData.freight_cost,
        other_charges: batchData.other_charges,
        supplier_name: batchData.supplier_name ?? null,
        supplier_phone: batchData.supplier_phone ?? null,
        supplier_gst: batchData.supplier_gst ?? null,
        supplier_address: batchData.supplier_address ?? null,
        invoice_no: batchData.invoice_no ?? null,
        po_no: batchData.po_no ?? null,
        sku: batchData.sku ?? null,
        total_cartons: batchData.total_cartons ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return null;
    }

    // Automatically sync to stock_summary so it shows up in the dropdowns
    const { data: existingStock } = await anySupabase
      .from('stock_summary')
      .select('*')
      .eq('product_name', batchData.product_name)
      .single();

    if (existingStock) {
      await anySupabase
        .from('stock_summary')
        .update({
          total_in: existingStock.total_in + batchData.total_pieces,
          available: existingStock.available + batchData.total_pieces,
          last_updated: new Date().toISOString()
        })
        .eq('id', existingStock.id);
    } else {
      await anySupabase
        .from('stock_summary')
        .insert({
          product_name: batchData.product_name,
          sku: batchData.sku || batchData.product_name.replace(/\s+/g, '-').toUpperCase(),
          total_in: batchData.total_pieces,
          available: batchData.total_pieces,
          last_updated: new Date().toISOString()
        });
    }

    return data;
  }
  
  static async getInventoryBatches() {
    const { data, error } = await anySupabase
      .from('inventory_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }
    return data;
  }

  static async createInventoryCartons(batchId: string, cartonCount: number, sku: string | null): Promise<void> {
    if (cartonCount <= 0) {
      return;
    }

    const cartonRecords = [];
    for (let i = 1; i <= cartonCount; i++) {
      const id = `${batchId}_CARTON_${String(i).padStart(4, '0')}`;
      cartonRecords.push({
        id,
        batch_id: batchId,
        carton_id: id,
        status: 'In Stock',
        product_id: sku,
        order_id: null,
        customer_name: null,
        mobile: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await anySupabase
      .from('inventory_items')
      .insert(cartonRecords);

    if (error) {
      console.error('Error creating inventory cartons:', error);
    }
  }

  // --- STOCK SUMMARY ---
  
  static async getStockSummary() {
    return this.getAggregatedStock();
  }
  
  // --- RETURNS ---

  static async getReturns() {
    const { data, error } = await anySupabase
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }
    return data;
  }

  // --- CARTON & PRODUCT TRACKING (FOR SCANNER) ---

  static async getCartonById(cartonId: string): Promise<any | null> {
    const { data, error } = await anySupabase
      .from('cartons')
      .select('*')
      .eq('id', cartonId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return null;
      }
      console.error('Error fetching carton:', error);
      return null;
    }
    return data;
  }

  static async getProductCountInCarton(cartonId: string): Promise<number> {
    const { data, error } = await anySupabase
      .from('inventory_items')
      .select('id', { count: 'exact' })
      .eq('carton_id', cartonId)
      .eq('status', 'In Stock');

    if (error) {
      console.error('Error counting products in carton:', error);
      return 0;
    }
    return data?.length || 0;
  }

  static async getProductById(productId: string): Promise<any | null> {
    const { data, error } = await anySupabase
      .from('inventory_items')
      .select('*')
      .eq('id', productId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return null;
      }
      console.error('Error fetching product:', error);
      return null;
    }
    return data;
  }

  // Returns the next sequential number for a given SKU prefix (e.g., "PM" → finds max PM-XXX → returns next number)
  static async getNextSkuNumber(prefix: string): Promise<number> {
    const { data } = await fetchAllRows(() => anySupabase
      .from('inventory_items')
      .select('sku')
      .ilike('sku', `${prefix}-%`)
      .order('id'));

    if (!data || data.length === 0) return 1;

    let maxNum = 0;
    const pattern = new RegExp(`^${prefix.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}-(\\d+)$`, 'i');
    data.forEach((item: any) => {
      const match = item.sku?.match(pattern);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });
    return maxNum + 1;
  }

  static async addProduct(product: {
    product_name: string;
    sku?: string | null;
    carton_id?: string | null;
    qr_code?: string | null;
    barcode?: string | null;
  }): Promise<any | null> {
    const { data, error } = await anySupabase
      .from('inventory_items')
      .insert({
        product_name: product.product_name,
        sku: product.sku ?? null,
        carton_id: product.carton_id ?? null,
        qr_code: product.qr_code ?? null,
        barcode: product.barcode ?? null,
        status: 'In Stock',
        order_id: null,
        customer_name: null,
        reserved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding product:', error);
      return null;
    }
    return data;
  }

  static async getCartons(): Promise<any[]> {
    const { data, error } = await anySupabase
      .from('cartons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching cartons:', error);
      return [];
    }
    return data;
  }

  static async addCarton(location: string | null): Promise<any | null> {
    const { data, error } = await anySupabase
      .from('cartons')
      .insert({
        location: location ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding carton:', error);
      return null;
    }
    return data;
  }

  static async updateCarton(id: string, location: string | null): Promise<boolean> {
    const { error } = await anySupabase
      .from('cartons')
      .update({
        location: location ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating carton:', error);
      return false;
    }
    return true;
  }

  static async deleteCarton(id: string): Promise<boolean> {
    // Check if carton contains any products first (protect against silent deletion)
    const { count, error: countError } = await anySupabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('carton_id', id);

    if (countError) {
      console.error('Error checking carton contents:', countError);
      return false;
    }

    if (count && count > 0) {
      alert(`Cannot delete carton: It currently contains ${count} product(s). Please move or delete the products before deleting this carton.`);
      return false;
    }

    // Delete empty carton
    const { error } = await anySupabase
      .from('cartons')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting carton:', error);
      return false;
    }
    return true;
  }

  // --- PRODUCTS (INVENTORY_ITEMS) ---

  static async getProducts(cartonId: string | null = null): Promise<any[]> {
    const { data, error } = await fetchAllRows(() => {
      let query = anySupabase.from('inventory_items').select('*');
      if (cartonId !== null) {
        query = query.eq('carton_id', cartonId);
      }
      return query.order('created_at', { ascending: false }).order('id', { ascending: false });
    });

    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }
    return data || [];
  }

  // --- INVENTORY AGGREGATION ---
  
  /** Per-product stock totals from raw unit rows plus returns. */
  private static buildStock(products: any[], returnsData: any[] | null): any[] {
    const summaryMap: Record<string, any> = {};

    products.forEach((p: any) => {
      const rawName = (p.product_name || '').trim();
      if (!rawName) return;
      const lowerKey = rawName.toLowerCase();

      if (!summaryMap[lowerKey]) {
        summaryMap[lowerKey] = {
          id: rawName,
          product_name: rawName,
          sku: p.sku ? p.sku.replace(/-?\d+$/, '').replace(/-$/, '') : rawName.substring(0, 3).toUpperCase(),
          total_in: 0,
          available: 0,
          sold: 0,
          returns: 0,
        };
      }

      summaryMap[lowerKey].total_in += 1;
      if (p.status === 'In Stock') summaryMap[lowerKey].available += 1;
      else if (p.status === 'Reserved' || p.status === 'Shipped' || p.status === 'Delivered') summaryMap[lowerKey].sold += 1;
    });

    (returnsData || []).forEach((r: any) => {
      const lowerKey = (r.product || '').trim().toLowerCase();
      if (summaryMap[lowerKey]) summaryMap[lowerKey].returns += 1;
    });

    return Object.values(summaryMap).sort((a: any, b: any) => b.available - a.available);
  }

  /** Cartons with what is inside each, grouped in one pass over the unit rows. */
  private static buildCartons(cartons: any[], products: any[]): any[] {
    const byCarton = new Map<string, Map<string, number>>();
    products.forEach((p: any) => {
      if (!p.carton_id) return;
      let m = byCarton.get(p.carton_id);
      if (!m) { m = new Map(); byCarton.set(p.carton_id, m); }
      m.set(p.product_name, (m.get(p.product_name) || 0) + 1);
    });

    return cartons.map((carton: any) => {
      const m = byCarton.get(carton.id);
      const contents = m ? Array.from(m, ([name, count]) => ({ name, count })) : [];
      return { ...carton, contents, totalUnits: contents.reduce((s, c) => s + c.count, 0) };
    });
  }

  /** Everything the inventory screens need, fetched once and in parallel. */
  static async getInventoryOverview(): Promise<{ stock: any[]; cartons: any[] }> {
    const [items, cartons, returns] = await Promise.all([
      fetchAllRows(() => anySupabase.from('inventory_items').select('carton_id, product_name, sku, status').order('id')),
      fetchAllRows(() => anySupabase.from('cartons').select('*').order('created_at', { ascending: false }).order('id', { ascending: false })),
      fetchAllRows(() => anySupabase.from('returns').select('product').order('id')),
    ]);
    if (items.error || !items.data) {
      console.error('Error fetching inventory overview:', items.error);
      return { stock: [], cartons: (cartons.data || []).map((c: any) => ({ ...c, contents: [], totalUnits: 0 })) };
    }
    return {
      stock: this.buildStock(items.data, returns.error ? null : returns.data),
      cartons: cartons.data ? this.buildCartons(cartons.data, items.data) : [],
    };
  }

  static async getAggregatedStock(): Promise<any[]> {
    return (await this.getInventoryOverview()).stock;
  }

  static async getCartonsWithProductCounts(): Promise<any[]> {
    return (await this.getInventoryOverview()).cartons;
  }

  static async getInventoryOutHistory(): Promise<any[]> {
    const { data, error } = await anySupabase
      .from('inventory_items')
      .select('*')
      .neq('status', 'In Stock')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory out history:', error);
      return [];
    }
    return data || [];
  }

  static async updateProduct(productId: string, updates: Partial<{
    sku: string;
    qr_code: string;
    barcode: string;
    status: string;
    carton_id: string | null;
    order_id: string | null;
    customer_name: string | null;
  }>): Promise<boolean> {
    const { error } = await anySupabase
      .from('inventory_items')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId);

    if (error) {
      console.error('Error updating product:', error);
      return false;
    }
    return true;
  }

  static async deleteProduct(productId: string): Promise<boolean> {
    const { error } = await anySupabase
      .from('inventory_items')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      return false;
    }
    return true;
  }

  static async reserveProductForOrder(productId: string, orderId: string, customerName: string, reservedAt: string): Promise<boolean> {
    // Conditional update: only succeeds if the unit is still In Stock (or already
    // reserved for THIS order). Two staff scanning the same unit can't both win.
    const { data, error } = await anySupabase
      .from("inventory_items")
      .update({
        order_id: orderId,
        customer_name: customerName,
        status: "Reserved",
        reserved_at: reservedAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", productId)
      .or(`status.eq.In Stock,order_id.eq.${orderId}`)
      .select("id");

    if (error) {
      console.error("Error reserving product for order:", error);
      return false;
    }
    if (!data || data.length === 0) {
      console.error(`Product ${productId} is no longer available to reserve for order ${orderId}`);
      return false;
    }
    return true;
  }

  static async releaseProductsForOrder(orderId: string, newStatus: 'In Stock' | 'Damaged' | 'Lost' | 'Written Off'): Promise<boolean> {
    // Map 'Written Off' to 'Damaged' to satisfy Postgres CHECK constraint (status IN ('In Stock', 'Reserved', 'Packed', 'Shipped', 'Delivered', 'Returned', 'Warranty', 'Damaged', 'Lost'))
    const validDbStatus = (newStatus === ('Written Off' as any)) ? 'Damaged' : newStatus;

    const updateData: any = {
      status: validDbStatus,
      updated_at: new Date().toISOString()
    };

    if (newStatus === 'In Stock') {
      updateData.order_id = null;
      updateData.customer_name = null;
      updateData.reserved_at = null;
    }

    const { error } = await anySupabase
      .from('inventory_items')
      .update(updateData)
      .eq('order_id', orderId);

    if (error) {
      console.error('Error releasing products for order:', error);
      return false;
    }
    return true;
  }
  // We already have getProductById, getProductCountInCarton, reserveProductForOrder
}
