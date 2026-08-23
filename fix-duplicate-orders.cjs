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
  console.log('Fetching all orders...');
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, inventory_id, created_at, customer_name')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }

  // Group by inventory_id
  const grouped = {};
  for (const order of orders) {
    const key = order.inventory_id || order.id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  }

  let deleted = 0;
  for (const [invId, rows] of Object.entries(grouped)) {
    if (rows.length > 1) {
      console.log(`Duplicate found for ${invId} (${rows[0].customer_name}): ${rows.length} rows`);
      // Keep the first (most recent), delete the rest
      const toDelete = rows.slice(1);
      for (const row of toDelete) {
        const { error: delErr } = await supabase.from('orders').delete().eq('id', row.id);
        if (delErr) {
          console.error(`Failed to delete ${row.id}:`, delErr);
        } else {
          console.log(`  Deleted duplicate row id=${row.id}`);
          deleted++;
        }
      }
    }
  }

  console.log(`\nDone. Deleted ${deleted} duplicate order rows.`);
}

run();
