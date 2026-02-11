import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function verifyQuery() {
  console.log('🔍 Testing frontend query...');
  const supabase = createClient(supabaseUrl, anonKey);

  const start = Date.now();
  const { data, error } = await supabase
    .from('properties')
    .select('*, sentences(count)')
    .order('name');
  const end = Date.now();

  if (error) {
    console.error('❌ Query failed:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
  } else {
    console.log(`✅ Query succeeded in ${end - start}ms`);
    console.log(`Returned ${data.length} properties.`);
    if (data.length > 0) {
      console.log('Sample property:', JSON.stringify(data[0], null, 2));
    }
  }
}

verifyQuery();
