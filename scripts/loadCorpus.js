import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', serviceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const data = JSON.parse(
  fs.readFileSync('property_text_corpus_full_original.json', 'utf8')
);

async function load() {
  for (const [propName, propData] of Object.entries(data)) {

    const { data: property, error: propErr } = await supabase
      .from('properties')
      .insert({
        name: propName,
        iri: `ex:${propName}`,
        domain: propData.domain,
        range: propData.range
      })
      .select()
      .single();

    if (propErr) {
      console.error(`❌ Property error (${propName})`, propErr);
      continue;
    }

    const sentences = propData.texts.map(text => ({
      property_id: property.id,
      text
    }));

    const { error: sentErr } = await supabase
      .from('sentences')
      .insert(sentences);

    if (sentErr) {
      console.error(`❌ Sentence error (${propName})`, sentErr);
    }

    console.log(`✅ Loaded ${propName}`);
  }

  console.log('🎉 Corpus loaded successfully');
}

load();
