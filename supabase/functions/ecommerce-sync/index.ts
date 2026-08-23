/**
 * Supabase Edge Function: ecommerce-sync
 * 
 * Imports orders FROM Shopify / WooCommerce INTO ZAYLOW
 * AND pushes order status updates BACK to the platform.
 * 
 * POST body: { action: 'import'|'update_status', platform: 'shopify'|'woocommerce', ... }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── SHOPIFY ─────────────────────────────────────────────────────────────────
async function importShopifyOrders(storeUrl: string, apiKey: string, supabase: any) {
  const res = await fetch(
    `https://${storeUrl}/admin/api/2024-01/orders.json?status=open&limit=50`,
    { headers: { 'X-Shopify-Access-Token': apiKey } }
  );
  if (!res.ok) throw new Error(`Shopify fetch failed: ${res.status}`);
  const data = await res.json();

  const orders = (data.orders || []).map((o: any) => ({
    inventory_id: `SHP-${o.id}`,
    date: o.created_at,
    customer_name: `${o.billing_address?.first_name || ''} ${o.billing_address?.last_name || ''}`.trim(),
    mobile: o.billing_address?.phone || '',
    house_name: o.billing_address?.address1 || '',
    area: o.billing_address?.address2 || '',
    city: o.billing_address?.city || '',
    state: o.billing_address?.province || '',
    pincode: o.billing_address?.zip || '',
    payment_type: o.financial_status === 'pending' ? 'COD' : 'Prepaid',
    cod_amount: parseFloat(o.total_price || '0'),
    courier: 'Custom',
    product_name: o.line_items?.[0]?.name || 'Unknown',
    product_id: String(o.line_items?.[0]?.variant_id || ''),
    status: 'Pending',
    remarks: `QTY:${o.line_items?.[0]?.quantity || 1} SHOPIFY_ID:${o.id}`,
  }));

  // Upsert orders into Supabase
  let imported = 0;
  for (const order of orders) {
    const { error } = await supabase.from('orders').upsert(order, { onConflict: 'inventory_id' });
    if (!error) imported++;
  }

  return { imported, total: orders.length };
}

async function updateShopifyFulfillment(storeUrl: string, apiKey: string, shopifyOrderId: string, trackingNumber: string) {
  // Create fulfillment on Shopify
  const res = await fetch(
    `https://${storeUrl}/admin/api/2024-01/orders/${shopifyOrderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fulfillment: {
          location_id: null,
          tracking_number: trackingNumber,
          notify_customer: true,
        }
      }),
    }
  );
  return { success: res.ok, status: res.status };
}

// ─── WOOCOMMERCE ─────────────────────────────────────────────────────────────
async function importWooCommerceOrders(storeUrl: string, apiKey: string, apiSecret: string, supabase: any) {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const res = await fetch(
    `${storeUrl}/wp-json/wc/v3/orders?status=processing&per_page=50`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  if (!res.ok) throw new Error(`WooCommerce fetch failed: ${res.status}`);
  const wcOrders = await res.json();

  const orders = (wcOrders || []).map((o: any) => ({
    inventory_id: `WOO-${o.id}`,
    date: o.date_created,
    customer_name: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim(),
    mobile: o.billing?.phone || '',
    house_name: `${o.billing?.address_1 || ''} ${o.billing?.address_2 || ''}`.trim(),
    city: o.billing?.city || '',
    state: o.billing?.state || '',
    pincode: o.billing?.postcode || '',
    payment_type: o.payment_method === 'cod' ? 'COD' : 'Prepaid',
    cod_amount: parseFloat(o.total || '0'),
    courier: 'Custom',
    product_name: o.line_items?.[0]?.name || 'Unknown',
    product_id: String(o.line_items?.[0]?.variation_id || o.line_items?.[0]?.product_id || ''),
    status: 'Pending',
    remarks: `QTY:${o.line_items?.[0]?.quantity || 1} WOO_ID:${o.id}`,
  }));

  let imported = 0;
  for (const order of orders) {
    const { error } = await supabase.from('orders').upsert(order, { onConflict: 'inventory_id' });
    if (!error) imported++;
  }

  return { imported, total: orders.length };
}

async function updateWooCommerceOrder(storeUrl: string, apiKey: string, apiSecret: string, wooOrderId: string, trackingNumber: string) {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const res = await fetch(`${storeUrl}/wp-json/wc/v3/orders/${wooOrderId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'completed', meta_data: [{ key: '_tracking_number', value: trackingNumber }] }),
  });
  return { success: res.ok };
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action, platform } = body;

    const { data: config } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('id', platform)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ success: false, error: 'Integration not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let result;

    if (action === 'import') {
      if (platform === 'shopify') {
        result = await importShopifyOrders(config.store_url, config.api_key, supabase);
      } else if (platform === 'woocommerce') {
        result = await importWooCommerceOrders(config.store_url, config.api_key, config.api_secret, supabase);
      }
      // Update last sync time
      await supabase.from('integration_settings')
        .update({ last_sync: new Date().toISOString() })
        .eq('id', platform);
    }

    if (action === 'update_status') {
      const { external_order_id, tracking_number } = body;
      if (platform === 'shopify') {
        result = await updateShopifyFulfillment(config.store_url, config.api_key, external_order_id, tracking_number);
      } else if (platform === 'woocommerce') {
        result = await updateWooCommerceOrder(config.store_url, config.api_key, config.api_secret, external_order_id, tracking_number);
      }
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
