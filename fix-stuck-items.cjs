const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envConfig[key.trim()] = val.join('=').trim();
});

const url = envConfig.VITE_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY || envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function fixStuckItems() {
  console.log('Checking for stuck reserved items...');
  
  // 1. Get all reserved items
  const { data: reservedItems, error: rErr } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('status', 'Reserved');
    
  if (rErr) throw rErr;
  
  if (!reservedItems || reservedItems.length === 0) {
    console.log('No reserved items found.');
    return;
  }
  
  console.log(`Found ${reservedItems.length} reserved items.`);
  
  // 2. Extract unique order IDs
  const orderIds = [...new Set(reservedItems.map(i => i.order_id).filter(Boolean))];
  
  if (orderIds.length === 0) {
    console.log('No order IDs attached to reserved items.');
    return;
  }
  
  // 3. Check which of these orders actually exist in the orders table
  // Since order.id in the app is mapped to inventory_id in the DB for the orders table...
  const { data: existingOrders, error: oErr } = await supabase
    .from('orders')
    .select('inventory_id')
    .in('inventory_id', orderIds);
    
  if (oErr) throw oErr;
  
  const existingOrderIds = new Set(existingOrders.map(o => o.inventory_id));
  
  // 4. Find items whose order_id does NOT exist in the orders table
  const stuckItems = reservedItems.filter(i => i.order_id && !existingOrderIds.has(i.order_id));
  
  if (stuckItems.length === 0) {
    console.log('No stuck items found. All reserved items belong to valid orders.');
    return;
  }
  
  console.log(`Found ${stuckItems.length} stuck items (orders were never saved):`);
  stuckItems.forEach(i => console.log(`- ${i.id} (Order: ${i.order_id})`));
  
  // 5. Revert them to 'In Stock'
  const stuckItemIds = stuckItems.map(i => i.id);
  
  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({
      status: 'In Stock',
      order_id: null,
      customer_name: null
    })
    .in('id', stuckItemIds);
    
  if (updateErr) throw updateErr;
  
  console.log('✅ Successfully reverted stuck items back to "In Stock".');
}

fixStuckItems().catch(console.error);
