import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";

serve(async (_req: Request) => {
  try {
    // 1. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch all orders that are shipped and have a tracking number
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('inventory_id, status, tracking_id, warranty_start, warranty_end, remarks')
      .eq('status', 'Shipped')
      .not('tracking_id', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ message: "No active shipped orders with tracking numbers found." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    let updatedCount = 0;

    // 3. Loop through orders and poll the MySpeedPost website
    for (const order of orders) {
      if (!order.tracking_id || order.tracking_id.trim() === '') continue;

      try {
        console.log(`Polling myspeedpost.com for ${order.inventory_id} -> ${order.tracking_id}`);
        
        // Fetch the tracking page
        const response = await fetch(`https://myspeedpost.com/track?n=${order.tracking_id}&sync=true`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch myspeedpost: ${response.statusText}`);
        }

        const html = await response.text();
        
        // Extract the Current Status using a regex pattern matching the Livewire chunk data
        // Pattern: &quot;key&quot;:&quot;current_status&quot;...&quot;value&quot;:&quot;🚚 Item Bagged&quot;
        const statusMatch = html.match(/&quot;key&quot;\s*:\s*&quot;current_status&quot;.*?&quot;value&quot;\s*:\s*&quot;([^&]+)&quot;/i);
        
        if (statusMatch && statusMatch[1]) {
          // Decode any unicode or escape sequences if needed, but we mostly just need to check for "delivered"
          const currentStatus = statusMatch[1];
          console.log(`Current status for ${order.tracking_id}: ${currentStatus}`);
          
          const isDelivered = currentStatus.toLowerCase().includes('delivered') || currentStatus.toLowerCase().includes('delivery confirmed');
          
          // Use current date for delivery date since we just polled it
          const deliveredDate = new Date().toISOString(); 

          if (isDelivered) {
            console.log(`[DELIVERED] ${order.inventory_id}. Updating DB and activating warranty...`);
            
            let updatePayload: any = {
              status: 'Delivered'
            };

            // Calculate warranty duration based on original placeholder dates
            let warrantyDurationDays = 0;
            if (order.warranty_start && order.warranty_end) {
              const start = new Date(order.warranty_start);
              const end = new Date(order.warranty_end);
              warrantyDurationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
            }

            // Trigger warranty from delivery date
            if (warrantyDurationDays > 0) {
              const actualStart = new Date(deliveredDate);
              const actualEnd = new Date(actualStart);
              actualEnd.setDate(actualEnd.getDate() + warrantyDurationDays);

              updatePayload.warranty_start = actualStart.toISOString();
              updatePayload.warranty_end = actualEnd.toISOString();
            }

            const { error: updateError } = await supabase
              .from('orders')
              .update(updatePayload)
              .eq('inventory_id', order.inventory_id);

            if (updateError) {
               console.error(`Failed to update ${order.inventory_id}:`, updateError);
            } else {
               updatedCount++;
            }
          }
        } else {
          console.log(`Could not find status in HTML for ${order.tracking_id}. (Has it been scanned yet?)`);
        }
      } catch (err: any) {
        console.error(`Error polling ${order.tracking_id}:`, err.message);
      }
      
      // Delay briefly to avoid hammering the site
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Polled ${orders.length} orders. Updated ${updatedCount} to Delivered.` 
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    console.error("Cron Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
