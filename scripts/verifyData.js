import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function verify() {
  console.log('🔍 Verifying database content...');
  
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseAnon = createClient(supabaseUrl, anonKey);

  // Check with Service Role
  const { count: propCount, error: propErr } = await supabaseAdmin.from('properties').select('*', { count: 'exact', head: true });
  const { count: sentCount, error: sentErr } = await supabaseAdmin.from('sentences').select('*', { count: 'exact', head: true });

  console.log(`--- Service Role ---`);
  console.log(`Properties: ${propCount}, Error: ${propErr?.message || 'None'}`);
  console.log(`Sentences: ${sentCount}, Error: ${sentErr?.message || 'None'}`);

  // Check with Anon Key (simulating frontend)
  const { count: propCountAnon, error: propErrAnon } = await supabaseAnon.from('properties').select('*', { count: 'exact', head: true });
  
  console.log(`--- Anon Key ---`);
  console.log(`Properties: ${propCountAnon}, Error: ${propErrAnon?.message || 'None'}`);

  if (propCountAnon === 0 && propCount > 0) {
    console.log('⚠️ Potential RLS issue: Service role sees data but Anon key does not.');
  }
}

verify();
