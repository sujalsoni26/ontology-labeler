import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function testAggregation() {
  console.log('🔍 Testing JS aggregation of counts...');
  const supabase = createClient(supabaseUrl, anonKey);

  const start = Date.now();
  const { data, error } = await supabase
    .from('sentences')
    .select('property_id');
  const end = Date.now();

  if (error) {
    console.error('❌ Fetch failed:', error.message);
  } else {
    console.log(`✅ Fetched ${data.length} IDs in ${end - start}ms`);
    const counts = {};
    data.forEach(s => {
      counts[s.property_id] = (counts[s.property_id] || 0) + 1;
    });
    console.log(`Aggregated into ${Object.keys(counts).length} properties.`);
    console.log('Sample count:', Object.entries(counts)[0]);
  }
}

testAggregation();
