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

// Label mapping from JSON format (A/B/C/D/E) to our system (pdr/pd/pr/p/n)
const LABEL_MAPPING = {
  'A': 'pdr',  // Full alignment (Property, Domain, Range)
  'B': 'pd',   // Property and Domain
  'C': 'pr',   // Property and Range
  'D': 'p',    // Property only
  'E': 'n'     // No alignment
};

/**
 * Convert subject_text/object_text to span indices
 * Returns { start, end } or null if text is empty or not found
 */
function textToSpan(fullText, targetText) {
  if (!targetText || targetText.trim() === '') {
    return null;
  }

  const tokens = fullText.split(/\s+/);
  const targetTokens = targetText.split(/\s+/);

  if (targetTokens.length === 0) return null;

  // Find the target tokens in the full text tokens
  for (let i = 0; i <= tokens.length - targetTokens.length; i++) {
    let match = true;
    for (let j = 0; j < targetTokens.length; j++) {
      if (tokens[i + j].toLowerCase() !== targetTokens[j].toLowerCase()) {
        match = false;
        break;
      }
    }
    if (match) {
      return {
        start: i,
        end: i + targetTokens.length - 1
      };
    }
  }

  console.warn(`⚠️  Could not find "${targetText}" in sentence: "${fullText.substring(0, 80)}..."`);
  return null;
}

/**
 * Validate a single model label record
 */
async function validateRecord(record, propertyId, sentenceId, sentenceText, index) {
  const errors = [];

  // Explicitly check for null/undefined labels
  if (record.label === null || record.label === undefined) {
    errors.push(`Label is null/undefined (skipped)`);
    return { valid: false, errors, sentenceId, propertyId, isNullLabel: true };
  }

  if (!LABEL_MAPPING[record.label]) {
    errors.push(`Invalid label: "${record.label}". Must be A/B/C/D/E`);
  }

  if (!sentenceText) {
    errors.push(`Sentence text is empty`);
  }

  // Validate subject_text and object_text are strings
  if (typeof record.subject_text !== 'string' || typeof record.object_text !== 'string') {
    errors.push(`subject_text and object_text must be strings`);
  }

  return { valid: errors.length === 0, errors, sentenceId, propertyId, isNullLabel: false };
}

/**
 * Convert a JSON record to model_labels table format
 */
function recordToModelLabel(record, propertyId, sentenceId, sentenceText, modelMetadata) {
  const mappedLabel = LABEL_MAPPING[record.label];
  const subjectSpan = textToSpan(sentenceText, record.subject_text);
  const objectSpan = textToSpan(sentenceText, record.object_text);

  return {
    sentence_id: sentenceId,
    property_id: propertyId,
    label: mappedLabel,
    subject_start: subjectSpan ? subjectSpan.start : null,
    subject_end: subjectSpan ? subjectSpan.end : null,
    object_start: objectSpan ? objectSpan.start : null,
    object_end: objectSpan ? objectSpan.end : null,
    model_name: modelMetadata.last_model || 'unknown',
    confidence: record.confidence || null,
    check_count: 0
  };
}

/**
 * Main upload function
 */
async function uploadModelLabels() {
  console.log('📂 Reading labels_first50.json...');
  
  let jsonData;
  try {
    const fileContent = fs.readFileSync('labels_first50.json', 'utf8');
    jsonData = JSON.parse(fileContent);
  } catch (err) {
    console.error('❌ Error reading/parsing JSON:', err.message);
    process.exit(1);
  }

  const meta = jsonData._meta || {};
  console.log(`✅ Metadata: Model=${meta.last_model}, Provider=${meta.last_provider}`);
  console.log(`✅ Total properties in file: ${Object.keys(jsonData).length - 1}`);

  let totalRecords = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalNullLabels = 0;
  const propertyErrors = {};

  // Process each property
  for (const [propName, propData] of Object.entries(jsonData)) {
    if (propName === '_meta') continue;

    console.log(`\n🔄 Processing property: ${propName}`);

    // Get or create property
    let { data: propertyRecord, error: propErr } = await supabase
      .from('properties')
      .select('id')
      .eq('name', propName)
      .single();

    if (propErr || !propertyRecord) {
      console.warn(`⚠️  Property "${propName}" not found. Skipping...`);
      propertyErrors[propName] = 'Property not found in database';
      continue;
    }

    const propertyId = propertyRecord.id;
    const items = propData.items || [];
    console.log(`📝 Items to process: ${items.length}`);

    const modelLabelsToInsert = [];
    let propertySkipped = 0;
    let propertyNullLabels = 0;

    // Validate and prepare records
    for (const item of items) {
      totalRecords++;
      const { index, text, label, subject_text, object_text } = item;

      // Validate record
      const validation = await validateRecord(
        item,
        propertyId,
        null, // sentenceId not needed yet
        text,
        index
      );

      // Track null labels separately
      if (validation.isNullLabel) {
        propertyNullLabels++;
        totalNullLabels++;
        continue;
      }

      if (!validation.valid) {
        console.warn(`⚠️  Validation failed (index ${index}):`, validation.errors.join(', '));
        propertySkipped++;
        continue;
      }

      // Get sentence
      const { data: sentenceRecord, error: sentErr } = await supabase
        .from('sentences')
        .select('id')
        .eq('property_id', propertyId)
        .eq('text', text)
        .single();

      if (sentErr || !sentenceRecord) {
        console.warn(`⚠️  Sentence not found (index ${index}): "${text.substring(0, 50)}..."`);
        propertySkipped++;
        continue;
      }

      const sentenceId = sentenceRecord.id;

      // Convert to model_labels format
      const modelLabel = recordToModelLabel(item, propertyId, sentenceId, text, meta);
      modelLabelsToInsert.push(modelLabel);
    }

    // Batch insert
    if (modelLabelsToInsert.length > 0) {
      console.log(`📤 Inserting ${modelLabelsToInsert.length} records...`);
      const { error: insertErr, count } = await supabase
        .from('model_labels')
        .insert(modelLabelsToInsert);

      if (insertErr) {
        console.error(`❌ Insert error for ${propName}:`, insertErr.message);
        propertyErrors[propName] = insertErr.message;
      } else {
        console.log(`✅ Inserted ${modelLabelsToInsert.length} records for ${propName}`);
        totalInserted += modelLabelsToInsert.length;
      }
    }

    totalSkipped += propertySkipped;
    if (propertyNullLabels > 0) {
      console.log(`⏭️  Skipped ${propertyNullLabels} records with null/undefined labels for ${propName}`);
    }
    if (propertySkipped > 0) {
      console.log(`⚠️  Skipped ${propertySkipped} other problematic records for ${propName}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 UPLOAD SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total records processed: ${totalRecords}`);
  console.log(`Successfully inserted: ${totalInserted}`);
  console.log(`Null/undefined labels (skipped): ${totalNullLabels}`);
  console.log(`Other issues (skipped): ${totalSkipped - totalNullLabels}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Success rate: ${totalRecords > 0 ? ((totalInserted / totalRecords) * 100).toFixed(2) : 0}%`);

  if (Object.keys(propertyErrors).length > 0) {
    console.log('\n❌ Errors by property:');
    for (const [prop, error] of Object.entries(propertyErrors)) {
      console.log(`   ${prop}: ${error}`);
    }
  }

  console.log('\n✅ Upload complete!');
}

// Run the upload
uploadModelLabels().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
