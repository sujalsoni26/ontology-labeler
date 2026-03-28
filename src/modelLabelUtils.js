import { supabase } from './supabase';

/**
 * Fetch sentences with combined count (label_count + check_count)
 * @param {number} propertyId - Property ID
 * @param {string} sortMode - 'below_threshold', 'least_labeled', 'all', or 'model_labeled'
 * @param {number} labelThreshold - Threshold for below_threshold mode
 * @param {number} limit - Number of records to fetch
 * @param {number} offset - Pagination offset
 * @returns {Promise<Array>} Array of sentences with combined counts
 */
export async function fetchSentencesWithCombinedCount(
  propertyId,
  sortMode = 'below_threshold',
  labelThreshold = 1,
  limit = 10,
  offset = 0
) {
  try {
    const { data, error } = await supabase.rpc(
      'get_sentences_with_combined_count',
      {
        p_property_id: propertyId,
        p_sort_mode: sortMode,
        p_label_threshold: labelThreshold,
        p_limit: limit,
        p_offset: offset
      }
    );

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching sentences with combined count:', err);
    throw err;
  }
}

/**
 * Get total count of sentences for pagination
 * @param {number} propertyId - Property ID
 * @param {string} sortMode - 'below_threshold', 'least_labeled', 'all', or 'model_labeled'
 * @param {number} labelThreshold - Threshold for below_threshold mode
 * @returns {Promise<number>} Total count
 */
export async function getSentencesCount(
  propertyId,
  sortMode = 'below_threshold',
  labelThreshold = 1
) {
  try {
    const { data, error } = await supabase.rpc(
      'get_sentences_count',
      {
        p_property_id: propertyId,
        p_sort_mode: sortMode,
        p_label_threshold: labelThreshold
      }
    );

    if (error) throw error;
    return data || 0;
  } catch (err) {
    console.error('Error getting sentences count:', err);
    throw err;
  }
}

/**
 * Fetch a specific model-labeled sentence with all details
 * @param {number} sentenceId - Sentence ID
 * @returns {Promise<Object>} Model labeled sentence details
 */
export async function getModelLabeledSentence(sentenceId) {
  try {
    const { data, error } = await supabase.rpc(
      'get_model_labeled_sentence',
      {
        p_sentence_id: sentenceId
      }
    );

    if (error) throw error;
    return data?.[0] || null;
  } catch (err) {
    console.error('Error fetching model labeled sentence:', err);
    throw err;
  }
}

/**
 * Increment check_count for a model label
 * @param {number} sentenceId - Sentence ID
 * @param {number} propertyId - Property ID
 * @returns {Promise<Object>} Updated model label
 */
export async function incrementModelLabelCheckCount(sentenceId, propertyId) {
  try {
    const { data, error } = await supabase.rpc(
      'increment_model_label_check_count',
      {
        p_sentence_id: sentenceId,
        p_property_id: propertyId
      }
    );

    if (error) throw error;
    return data?.[0] || null;
  } catch (err) {
    console.error('Error incrementing check count:', err);
    throw err;
  }
}

/**
 * Get user agreement rate with model-labeled confirmations
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<Object>} Agreement statistics
 */
export async function getUserAgreementRate(userId) {
  try {
    const { data, error } = await supabase.rpc(
      'get_user_agreement_rate',
      {
        p_user_id: userId
      }
    );

    if (error) throw error;
    return data?.[0] || null;
  } catch (err) {
    console.error('Error fetching user agreement rate:', err);
    throw err;
  }
}

/**
 * Check if user has extra_access
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<boolean>}
 */
export async function hasExtraAccess(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('extra_access')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Could not fetch user extra_access:', error);
      return false;
    }
    return data?.extra_access || false;
  } catch (err) {
    console.error('Error checking extra access:', err);
    return false;
  }
}

/**
 * Save a user confirmation of a model label
 * Increments check_count and saves label as a user label
 * @param {number} sentenceId - Sentence ID
 * @param {number} propertyId - Property ID
 * @param {string} userId - User ID (UUID)
 * @param {Object} labelData - Label data to save
 * @returns {Promise<Object>} Saved label
 */
export async function confirmModelLabel(sentenceId, propertyId, userId, labelData) {
  try {
    // First, save the label as user confirmation
    const { data: labelResult, error: labelErr } = await supabase
      .from('labels')
      .insert([
        {
          sentence_id: sentenceId,
          property_id: propertyId,
          user_id: userId,
          label: labelData.label,
          subject_start: labelData.subject_start,
          subject_end: labelData.subject_end,
          object_start: labelData.object_start,
          object_end: labelData.object_end,
          label_source: 'model_confirmed'
        }
      ])
      .select();

    if (labelErr) throw labelErr;

    // Then, increment the model label check_count
    await incrementModelLabelCheckCount(sentenceId, propertyId);

    return labelResult?.[0] || null;
  } catch (err) {
    console.error('Error confirming model label:', err);
    throw err;
  }
}
