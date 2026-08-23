const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envConfig[key.trim()] = val.join('=').trim();
});

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY || envConfig.VITE_SUPABASE_PUBLISHABLE_KEY);

async function testInsert() {
  const { data: _data, error } = await supabase.from('orders').insert({
    id: 'ZYL-123456',
    customer_name: 'Test',
    payment_type: 'COD',
    status: 'Pending'
  });
  console.log('Error:', error);
}
testInsert();
