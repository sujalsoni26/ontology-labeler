-- PostgreSQL RPC Functions for model-labeled sentences
-- Description: Functions to retrieve sentences with combined label counts

-- Function to get sentences with combined count (label_count + check_count)
CREATE OR REPLACE FUNCTION get_sentences_with_combined_count(
  p_property_id BIGINT,
  p_sort_mode TEXT DEFAULT 'below_threshold',
  p_label_threshold INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  text TEXT,
  property_id BIGINT,
  label_count INTEGER,
  check_count INTEGER,
  combined_count INTEGER
) AS $$
DECLARE
  v_sort_filter TEXT;
BEGIN
  -- Build filter based on sort_mode
  CASE p_sort_mode
    WHEN 'below_threshold' THEN
      v_sort_filter := 'WHERE s.property_id = ' || p_property_id || 
                       ' AND s.label_count < ' || p_label_threshold;
    WHEN 'least_labeled' THEN
      v_sort_filter := 'WHERE s.property_id = ' || p_property_id;
    WHEN 'all' THEN
      v_sort_filter := 'WHERE s.property_id = ' || p_property_id;
    ELSE
      v_sort_filter := 'WHERE s.property_id = ' || p_property_id;
  END CASE;

  RETURN QUERY
  EXECUTE format('
    SELECT 
      s.id,
      s.text,
      s.property_id,
      COALESCE(s.label_count, 0)::INTEGER as label_count,
      COALESCE(SUM(ml.check_count), 0)::INTEGER as check_count,
      (COALESCE(s.label_count, 0) + COALESCE(SUM(ml.check_count), 0))::INTEGER as combined_count
    FROM sentences s
    LEFT JOIN model_labels ml ON s.id = ml.sentence_id AND ml.property_id = s.property_id
    %s
    GROUP BY s.id, s.text, s.property_id, s.label_count
    ORDER BY combined_count ASC, s.id ASC
    LIMIT %L OFFSET %L
  ', v_sort_filter, p_limit, p_offset);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get total count of sentences (useful for pagination)
CREATE OR REPLACE FUNCTION get_sentences_count(
  p_property_id BIGINT,
  p_sort_mode TEXT DEFAULT 'below_threshold',
  p_label_threshold INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  CASE p_sort_mode
    WHEN 'below_threshold' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM sentences
      WHERE property_id = p_property_id AND label_count < p_label_threshold;
    WHEN 'least_labeled' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM sentences
      WHERE property_id = p_property_id;
    WHEN 'all' THEN
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM sentences
      WHERE property_id = p_property_id;
    ELSE
      SELECT COUNT(*)::INTEGER INTO v_count
      FROM sentences
      WHERE property_id = p_property_id;
  END CASE;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get a specific model-labeled sentence with all details
CREATE OR REPLACE FUNCTION get_model_labeled_sentence(
  p_sentence_id BIGINT
)
RETURNS TABLE (
  sentence_id BIGINT,
  sentence_text TEXT,
  property_id BIGINT,
  label TEXT,
  subject_start INTEGER,
  subject_end INTEGER,
  object_start INTEGER,
  object_end INTEGER,
  model_name TEXT,
  confidence FLOAT,
  check_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ml.sentence_id,
    s.text,
    ml.property_id,
    ml.label,
    ml.subject_start,
    ml.subject_end,
    ml.object_start,
    ml.object_end,
    ml.model_name,
    ml.confidence,
    ml.check_count
  FROM model_labels ml
  JOIN sentences s ON ml.sentence_id = s.id
  WHERE ml.sentence_id = p_sentence_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to increment check_count for a model label
CREATE OR REPLACE FUNCTION increment_model_label_check_count(
  p_sentence_id BIGINT,
  p_property_id BIGINT
)
RETURNS TABLE (
  id BIGINT,
  new_check_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE model_labels
  SET check_count = check_count + 1
  WHERE sentence_id = p_sentence_id AND property_id = p_property_id
  RETURNING model_labels.id, model_labels.check_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user agreement rate for model-labeled confirmations
CREATE OR REPLACE FUNCTION get_user_agreement_rate(
  p_user_id UUID
)
RETURNS TABLE (
  total_confirmations INTEGER,
  agreements INTEGER,
  disagreements INTEGER,
  agreement_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT l.id)::INTEGER as total_confirmations,
    SUM(CASE 
      WHEN l.label = ml.label 
        AND COALESCE(l.subject_start, -1) = COALESCE(ml.subject_start, -1)
        AND COALESCE(l.subject_end, -1) = COALESCE(ml.subject_end, -1)
        AND COALESCE(l.object_start, -1) = COALESCE(ml.object_start, -1)
        AND COALESCE(l.object_end, -1) = COALESCE(ml.object_end, -1)
      THEN 1 ELSE 0 END)::INTEGER as agreements,
    (COUNT(DISTINCT l.id) - SUM(CASE 
      WHEN l.label = ml.label 
        AND COALESCE(l.subject_start, -1) = COALESCE(ml.subject_start, -1)
        AND COALESCE(l.subject_end, -1) = COALESCE(ml.subject_end, -1)
        AND COALESCE(l.object_start, -1) = COALESCE(ml.object_start, -1)
        AND COALESCE(l.object_end, -1) = COALESCE(ml.object_end, -1)
      THEN 1 ELSE 0 END))::INTEGER as disagreements,
    ROUND(
      (SUM(CASE 
        WHEN l.label = ml.label 
          AND COALESCE(l.subject_start, -1) = COALESCE(ml.subject_start, -1)
          AND COALESCE(l.subject_end, -1) = COALESCE(ml.subject_end, -1)
          AND COALESCE(l.object_start, -1) = COALESCE(ml.object_start, -1)
          AND COALESCE(l.object_end, -1) = COALESCE(ml.object_end, -1)
        THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(DISTINCT l.id), 0) * 100), 2
    ) as agreement_percentage
  FROM labels l
  JOIN model_labels ml ON l.sentence_id = ml.sentence_id AND l.property_id = ml.property_id
  WHERE l.user_id = p_user_id AND l.label_source = 'model_confirmed';
END;
$$ LANGUAGE plpgsql STABLE;
