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

async function fix() {
  const { data: batches } = await supabase.from('inventory_batches').select('*');
  for (const batch of batches) {
    const { data: existing } = await supabase
      .from('stock_summary')
      .select('*')
      .eq('product_name', batch.product_name)
      .single();

    if (!existing) {
      console.log(`Adding ${batch.product_name} to stock_summary...`);
      await supabase.from('stock_summary').insert({
        product_name: batch.product_name,
        sku: batch.sku || batch.product_name.replace(/\s+/g, '-').toUpperCase(),
        total_in: batch.total_pieces,
        available: batch.total_pieces,
        last_updated: new Date().toISOString()
      });
    }
  }
  console.log('Done fixing stock_summary.');
}
fix();
