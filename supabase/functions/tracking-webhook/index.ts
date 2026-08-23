import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";

// Define generic tracking status mappings
const STATUS_MAP = {
  "DELIVERED": "Delivered",
  "IN_TRANSIT": "Shipped",
  "OUT_FOR_DELIVERY": "Shipped",
  "EXCEPTION": "Pending", // Usually requires attention
  // Map other third party states as needed
};

serve(async (req: Request) => {
  try {
    // 1. Verify Request Method
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // 2. Parse Payload
    // This expects a generic webhook payload like Shiprocket or AfterShip
    const payload = await req.json();
    
    // Example payload extraction (Adjust based on final provider used e.g. Shiprocket/AfterShip)
    // Most providers send something like: { current_status: 'DELIVERED', awb: '123456789' }
    const rawStatus = payload.current_status || payload.status || '';
    const trackingNumber = payload.awb || payload.tracking_number || '';
    const deliveredDate = payload.delivered_date || new Date().toISOString();

    if (!trackingNumber) {
      return new Response('Missing tracking number', { status: 400 });
    }

    // 3. Normalize Status
    const normalizedStatus = STATUS_MAP[rawStatus.toUpperCase()] || "Pending";

    console.log(`Received update for tracking ${trackingNumber}: ${normalizedStatus}`);

    // 4. Initialize Supabase Client
    // We use the SERVICE_ROLE_KEY to bypass RLS and update safely from the backend.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Fetch the Order by Tracking Number
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('inventory_id, status, warranty_start, warranty_end, remarks')
      .eq('tracking_id', trackingNumber)
      .maybeSingle();

    if (fetchError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found for tracking number' }), { status: 404 });
    }

    // 6. If Delivered, compute Warranty
    let updatePayload: any = {
      status: normalizedStatus
    };

    if (normalizedStatus === 'Delivered' && order.status !== 'Delivered') {
      // Calculate how many days the warranty was meant to be
      // We can infer this by looking at how many days were between the original warrantyStart and warrantyEnd
      let warrantyDurationDays = 0;
      if (order.warranty_start && order.warranty_end) {
         const start = new Date(order.warranty_start);
         const end = new Date(order.warranty_end);
         warrantyDurationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
      }

      if (warrantyDurationDays > 0) {
        const actualStart = new Date(deliveredDate);
        const actualEnd = new Date(actualStart);
        actualEnd.setDate(actualEnd.getDate() + warrantyDurationDays);

        updatePayload.warranty_start = actualStart.toISOString();
        updatePayload.warranty_end = actualEnd.toISOString();
      }
    }

    // 7. Update the Order
    const { error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('inventory_id', order.inventory_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, updatedStatus: normalizedStatus }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('Webhook Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
