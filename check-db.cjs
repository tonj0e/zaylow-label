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

async function check() {
  const { data: stock, error: e1 } = await supabase.from('stock_summary').select('*');
  console.log('Stock Summary:', stock, e1);
  const { data: batches, error: e2 } = await supabase.from('inventory_batches').select('*');
  console.log('Inventory Batches:', batches, e2);
}
check();
