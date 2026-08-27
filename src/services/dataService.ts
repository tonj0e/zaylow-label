import { supabase } from './supabase';
import type { Order, OrderStatus } from '../types';

const anySupabase = supabase as any;

export class DataService {
  
  // --- ORDERS ---
  
  static async getOrders(): Promise<Order[]> {
    const { data, error } = (await anySupabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })) as any;
      
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
      .select('inventory_id')
      .eq('inventory_id', order.id)
      .maybeSingle();

    if (existing) {
      console.warn(`Order ${order.id} already exists. Skipping duplicate insert.`);
      // Return the existing order data
      const allOrders = await this.getOrders();
      return allOrders.find(o => o.id === order.id) || null;
    }

    // Check if sufficient inventory exists before placing order
    try {
      // Products might already be reserved by the Scanner for this specific order
      const { count: reservedCount } = await anySupabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', order.id)
        .eq('product_name', order.item.productName)
        .eq('status', 'Reserved');

      const { count: inStockCount, error: countError } = await anySupabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_name', order.item.productName)
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
           .select('warranty_start, warranty_end')
           .eq('inventory_id', id)
           .single();
         
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
    const { data } = await anySupabase
      .from('inventory_items')
      .select('sku')
      .ilike('sku', `${prefix}-%`);

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
    // First delete all products (inventory_items) in this carton
    const { error: productsError } = await anySupabase
      .from('inventory_items')
      .delete()
      .eq('carton_id', id);

    if (productsError) {
      console.error('Error deleting products in carton:', productsError);
      return false;
    }

    // Then delete the carton itself
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
    let query = anySupabase.from('inventory_items').select('*');

    if (cartonId !== null) {
      query = query.eq('carton_id', cartonId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }
    return data;
  }

  // --- INVENTORY AGGREGATION ---
  
  static async getAggregatedStock(): Promise<any[]> {
    const { data: products, error } = await anySupabase
      .from('inventory_items')
      .select('*');

    if (error || !products) {
      console.error('Error fetching products for aggregation:', error);
      return [];
    }

    // Fetch returns to count them
    const { data: returnsData, error: returnsError } = await anySupabase
      .from('returns')
      .select('product');

    const summaryMap: Record<string, any> = {};
    
    products.forEach((p: any) => {
      const name = p.product_name;
      if (!summaryMap[name]) {
        summaryMap[name] = {
          id: name,
          product_name: name,
          sku: p.sku ? p.sku.replace(/-?\d+$/, '').replace(/-$/, '') : name.substring(0,3).toUpperCase(),
          total_in: 0,
          available: 0,
          sold: 0,
          returns: 0
        };
      }
      
      summaryMap[name].total_in += 1;
      
      if (p.status === 'In Stock') {
        summaryMap[name].available += 1;
      } else if (p.status === 'Reserved' || p.status === 'Shipped' || p.status === 'Delivered') {
        summaryMap[name].sold += 1;
      }
    });

    if (!returnsError && returnsData) {
      returnsData.forEach((r: any) => {
        const name = r.product;
        if (summaryMap[name]) {
          summaryMap[name].returns += 1;
        }
      });
    }

    return Object.values(summaryMap).sort((a: any, b: any) => b.available - a.available);
  }

  static async getCartonsWithProductCounts(): Promise<any[]> {
    const { data: cartons, error: cartonsError } = await anySupabase
      .from('cartons')
      .select('*')
      .order('created_at', { ascending: false });

    if (cartonsError || !cartons) return [];

    const { data: products, error: productsError } = await anySupabase
      .from('inventory_items')
      .select('carton_id, product_name, status');

    if (productsError || !products) return cartons.map((c: any) => ({ ...c, contents: [], totalUnits: 0 }));

    return cartons.map((carton: any) => {
      const cartonProducts = products.filter((p: any) => p.carton_id === carton.id);
      
      const contentsMap: Record<string, number> = {};
      cartonProducts.forEach((p: any) => {
        contentsMap[p.product_name] = (contentsMap[p.product_name] || 0) + 1;
      });

      const contents = Object.entries(contentsMap).map(([name, count]) => ({ name, count }));
      
      return {
        ...carton,
        contents,
        totalUnits: cartonProducts.length
      };
    });
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
    const { error } = await anySupabase
      .from("inventory_items")
      .update({
        order_id: orderId,
        customer_name: customerName,
        status: "Reserved",
        reserved_at: reservedAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", productId);

    if (error) {
      console.error("Error reserving product for order:", error);
      return false;
    }
    return true;
  }

  static async releaseProductsForOrder(orderId: string, newStatus: 'In Stock' | 'Written Off'): Promise<boolean> {
    const updateData: any = {
      status: newStatus,
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
