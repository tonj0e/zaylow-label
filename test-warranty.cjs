const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error: _error } = await supabase.from('orders').select('inventory_id, tracking_id, warranty_start, warranty_end, status').limit(5);
  console.log(data);
}
test();
