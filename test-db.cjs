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

async function testConnection() {
  console.log(`Testing connection to: ${url}`);
  try {
    const { data: _data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
      if (error.code === '42P01') {
        console.log('✅ Connected successfully, but "orders" table is missing (needs schema.sql).');
      } else {
        console.error('❌ Error testing connection:', error.message);
      }
    } else {
      console.log('✅ Connected successfully! Found orders table.');
    }
  } catch (err) {
    console.error('❌ Connection failed:', err);
  }
}

testConnection();
