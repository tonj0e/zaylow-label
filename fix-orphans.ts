import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or Supabase Key in .env.local / environment.');
  process.exit(1);
}

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
