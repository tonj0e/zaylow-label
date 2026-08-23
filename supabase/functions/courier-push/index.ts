/**
 * Supabase Edge Function: courier-push
 * 
 * Secure backend proxy that pushes an order to a courier API.
 * API keys NEVER touch the browser — they live only in this function.
 * 
 * POST body: { platform: 'delhivery'|'shiprocket', order: OrderPayload }
 * Returns:   { success: boolean, awb?: string, label_url?: string, error?: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderPayload {
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
  warehouse: {
    name: string;
    phone: string;
    addressLine: string;
    city: string;
    state: string;
    pinCode: string;
  };
}

// ─── DELHIVERY ───────────────────────────────────────────────────────────────
async function pushToDelhivery(order: OrderPayload, apiKey: string) {
  // Delhivery sandbox: https://staging-express.delhivery.com
  // Delhivery production: https://track.delhivery.com
  const BASE = 'https://staging-express.delhivery.com'; // Change to prod when ready

  // Step 1: Create waybill
  const waybillRes = await fetch(`${BASE}/api/p/assign_awb/?format=json`, {
    method: 'GET',
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!waybillRes.ok) {
    const errText = await waybillRes.text();
    throw new Error(`Delhivery waybill failed: ${errText}`);
  }

  const waybillData = await waybillRes.json();
  const waybill = waybillData.waybill;
  if (!waybill) throw new Error('No waybill returned from Delhivery');

  // Step 2: Create shipment
  const shipmentBody = {
    format: 'json',
    data: JSON.stringify({
      shipments: [{
        add: order.customer.addressLine,
        phone: order.customer.phone,
        name: order.customer.name,
        pin: order.customer.pinCode,
        city: order.customer.city,
        state: order.customer.state,
        country: 'India',
        payment_mode: order.paymentType === 'COD' ? 'COD' : 'Prepaid',
        order: order.id,
        total_amount: order.codAmount,
        cod_amount: order.paymentType === 'COD' ? order.codAmount : 0,
        products_desc: order.item.productName,
        quantity: order.item.quantity,
        weight: order.item.weightKg * 1000, // grams
        waybill,
        shipment_width: 10,
        shipment_height: 10,
        seller_address: order.warehouse.addressLine,
        seller_name: order.warehouse.name,
        seller_inv: order.id,
        return_pin: order.warehouse.pinCode,
        return_city: order.warehouse.city,
        return_state: order.warehouse.state,
        return_country: 'India',
        return_add: order.warehouse.addressLine,
        return_name: order.warehouse.name,
        return_phone: order.warehouse.phone,
      }],
      pickup_location: {
        name: 'Primary',
        add: order.warehouse.addressLine,
        city: order.warehouse.city,
        state: order.warehouse.state,
        country: 'India',
        pin_code: order.warehouse.pinCode,
        phone: order.warehouse.phone,
      },
    }),
  };

  const createRes = await fetch(`${BASE}/api/cmu/create.json`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(shipmentBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Delhivery create shipment failed: ${errText}`);
  }

  const createData = await createRes.json();

  // Check for package errors
  if (createData.packages && createData.packages[0]?.status === 'Success') {
    return { success: true, awb: waybill };
  }

  const pkgError = createData.packages?.[0]?.remarks || 'Unknown error from Delhivery';
  throw new Error(pkgError);
}

// ─── SHIPROCKET ──────────────────────────────────────────────────────────────
async function pushToShiprocket(order: OrderPayload, email: string, password: string) {
  // Step 1: Authenticate
  const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) throw new Error('Shiprocket authentication failed. Check email/password.');
  const authData = await authRes.json();
  const token = authData.token;
  if (!token) throw new Error('No Shiprocket token received');

  // Step 2: Create order
  const orderRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      order_id: order.id,
      order_date: new Date().toISOString(),
      pickup_location: 'Primary',
      channel_id: '',
      billing_customer_name: order.customer.name.split(' ')[0],
      billing_last_name: order.customer.name.split(' ').slice(1).join(' ') || '.',
      billing_address: order.customer.addressLine,
      billing_city: order.customer.city,
      billing_pincode: order.customer.pinCode,
      billing_state: order.customer.state,
      billing_country: 'India',
      billing_email: 'customer@zaylow.com',
      billing_phone: order.customer.phone,
      shipping_is_billing: true,
      order_items: [{
        name: order.item.productName,
        sku: order.id,
        units: order.item.quantity,
        selling_price: order.codAmount / order.item.quantity,
      }],
      payment_method: order.paymentType === 'COD' ? 'COD' : 'Prepaid',
      sub_total: order.codAmount,
      length: 10,
      breadth: 10,
      height: 10,
      weight: order.item.weightKg,
    }),
  });

  if (!orderRes.ok) {
    const errText = await orderRes.text();
    throw new Error(`Shiprocket order create failed: ${errText}`);
  }

  const orderData = await orderRes.json();
  const shipmentId = orderData.shipment_id;

  if (!shipmentId) throw new Error(orderData.message || 'No shipment_id from Shiprocket');

  // Step 3: Assign AWB
  const awbRes = await fetch('https://apiv2.shiprocket.in/v1/external/courier/assign/awb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ shipment_id: shipmentId }),
  });

  const awbData = await awbRes.json();
  const awb = awbData.response?.data?.awb_code;

  return {
    success: true,
    awb: awb || null,
    label_url: awbData.response?.data?.label_url || null,
    shipment_id: String(shipmentId),
  };
}

// ─── TEST CONNECTION ──────────────────────────────────────────────────────────
async function testConnection(platform: string, config: Record<string, string>) {
  try {
    if (platform === 'delhivery') {
      const res = await fetch('https://staging-express.delhivery.com/api/p/assign_awb/?format=json', {
        headers: { Authorization: `Token ${config.api_key}` },
      });
      return { success: res.status !== 401 && res.status !== 403, status: res.status };
    }

    if (platform === 'shiprocket') {
      const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: config.email, password: config.api_key }),
      });
      const data = await res.json();
      return { success: !!data.token, status: res.status };
    }

    if (platform === 'shopify') {
      const res = await fetch(`https://${config.store_url}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': config.api_key },
      });
      return { success: res.ok, status: res.status };
    }

    if (platform === 'woocommerce') {
      const credentials = btoa(`${config.api_key}:${config.api_secret}`);
      const res = await fetch(`${config.store_url}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      return { success: res.ok, status: res.status };
    }

    return { success: false, error: 'Unknown platform' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
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
    const { action, platform, order } = body;

    // Load integration config from DB
    const { data: config, error: configError } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('id', platform)
      .single();

    if (configError || !config) {
      return new Response(JSON.stringify({ success: false, error: `Integration "${platform}" not found` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ACTION: Test connection
    if (action === 'test') {
      const result = await testConnection(platform, config);
      if (result.success) {
        await supabase.from('integration_settings')
          .update({ is_active: true, last_verified: new Date().toISOString() })
          .eq('id', platform);
      }
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ACTION: Push order to courier
    if (action === 'push_order') {
      if (!config.is_active) {
        return new Response(JSON.stringify({ success: false, error: `${platform} is not connected. Please set up your API key first.` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let result;

      if (platform === 'delhivery') {
        result = await pushToDelhivery(order, config.api_key);
      } else if (platform === 'shiprocket') {
        result = await pushToShiprocket(order, config.email, config.api_key);
      } else {
        return new Response(JSON.stringify({ success: false, error: `Push not yet supported for ${platform}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Save AWB to order
      if (result.awb) {
        await supabase.from('orders')
          .update({ tracking_id: result.awb, status: 'Shipped' })
          .eq('inventory_id', order.id);
        await supabase.from('integration_settings')
          .update({ last_sync: new Date().toISOString() })
          .eq('id', platform);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
