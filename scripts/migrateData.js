import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const NEW_DATA_FILE = 'updates/property_text_corpus_full_new_400_original.json';
const DESC_DATA_FILE = 'updates/my_props_desc.json';

async function migrate() {
  console.log('🚀 Starting migration...');

  // 1. Read new data
  if (!fs.existsSync(NEW_DATA_FILE)) {
    console.error(`❌ Data file not found: ${NEW_DATA_FILE}`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(NEW_DATA_FILE, 'utf8'));

  // 2. Read description data
  let descData = {};
  if (fs.existsSync(DESC_DATA_FILE)) {
    console.log('📖 Reading description data...');
    descData = JSON.parse(fs.readFileSync(DESC_DATA_FILE, 'utf8'));
  } else {
    console.warn(`⚠️ Description file not found: ${DESC_DATA_FILE}`);
  }

  // 3. Clear existing data
  // Due to foreign key constraints, we should delete in order: labels -> sentences -> properties
  console.log('🧹 Clearing existing data...');
  
  const { error: delLabelsErr } = await supabase.from('labels').delete().neq('id', 0); // Delete all
  if (delLabelsErr) console.error('❌ Error deleting labels:', delLabelsErr);

  const { error: delSentencesErr } = await supabase.from('sentences').delete().neq('id', 0);
  if (delSentencesErr) console.error('❌ Error deleting sentences:', delSentencesErr);

  const { error: delPropsErr } = await supabase.from('properties').delete().neq('id', 0);
  if (delPropsErr) console.error('❌ Error deleting properties:', delPropsErr);

  console.log('✨ Data cleared.');

  // 4. Load new data
  console.log('📥 Loading new data...');
  for (const [propName, propData] of Object.entries(data)) {
    // Find matching metadata in descData
    // The keys in descData are full IRIs like http://dbpedia.org/ontology/absoluteMagnitude
    const fullIri = `http://dbpedia.org/ontology/${propName}`;
    const meta = descData[fullIri] || {};

    const { data: property, error: propErr } = await supabase
      .from('properties')
      .insert({
        name: propName,
        iri: fullIri,
        domain: propData.domain,
        range: propData.range,
        sentence_count: propData.texts.length,
        description: meta.description || '',
        domain_link: meta.domain?.[0] || '',
        range_link: meta.range?.[0] || ''
      })
      .select()
      .single();

    if (propErr) {
      console.error(`❌ Property error (${propName})`, propErr);
      continue;
    }

    const sentences = propData.texts.map(text => ({
      property_id: property.id,
      text,
      label_count: 0
    }));

    const { error: sentErr } = await supabase
      .from('sentences')
      .insert(sentences);

    if (sentErr) {
      console.error(`❌ Sentence error (${propName})`, sentErr);
    } else {
      console.log(`✅ Loaded ${propName} (${sentences.length} sentences)`);
    }
  }

  console.log('🎉 Migration completed successfully');
}

migrate();
