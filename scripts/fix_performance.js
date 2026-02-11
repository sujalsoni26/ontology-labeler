import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function addSentenceCountColumn() {
  console.log('🛠️ Adding sentence_count column and updating counts...');

  // Since we can't run arbitrary SQL easily through the client without an RPC,
  // we will try to update the properties one by one or in batches after calculating counts.
  
  // 1. Fetch all properties
  const { data: props, error: pErr } = await supabase.from('properties').select('id');
  if (pErr) {
    console.error('❌ Error fetching properties:', pErr);
    return;
  }

  console.log(`Processing ${props.length} properties...`);

  for (const prop of props) {
    // 2. Count sentences for this property
    const { count, error: sErr } = await supabase
      .from('sentences')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', prop.id);
    
    if (sErr) {
      console.error(`❌ Error counting sentences for prop ${prop.id}:`, sErr);
      continue;
    }

    // 3. Update property (this will fail if column doesn't exist, but we can't add it via JS easily)
    // Actually, I'll just assume the user can run the SQL I provided or I can try to use an RPC if they have one.
    // Wait, I can't add a column via PostgREST.
  }
}

// Instead of trying to add the column via JS (which is impossible without an RPC),
// I will just inform the user they need to run the SQL, OR I will check if I can
// optimize the query in Properties.jsx without the column.

// Actually, I can optimize the migration script to load data differently if I had the column.
// But if I don't have the column, how can I make Properties.jsx faster?
