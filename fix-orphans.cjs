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

async function run() {
  console.log('Fetching reserved items...');
  const { data: reservedItems } = await supabase
    .from('inventory_items')
    .select('id, order_id')
    .neq('status', 'In Stock');

  if (!reservedItems || reservedItems.length === 0) {
    console.log('No reserved items found.');
    return;
  }

  console.log(`Found ${reservedItems.length} reserved items.`);

  const { data: orders } = await supabase.from('orders').select('inventory_id');
  const validOrderIds = new Set(orders?.map(o => o.inventory_id));

  let fixed = 0;
  for (const item of reservedItems) {
    if (item.order_id && !validOrderIds.has(item.order_id)) {
      console.log(`Orphan found! Item ${item.id} has order ${item.order_id} which does not exist.`);
      await supabase
        .from('inventory_items')
        .update({
          order_id: null,
          customer_name: null,
          status: 'In Stock',
          reserved_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);
      fixed++;
    }
  }
  
  console.log(`Fixed ${fixed} orphaned items.`);
}

run();
