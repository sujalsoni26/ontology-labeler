-- Run this script in your Supabase SQL Editor to create a secure function for updating label counts

CREATE OR REPLACE FUNCTION increment_label_count(sentence_id_input bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sentences
  SET label_count = COALESCE(label_count, 0) + 1
  WHERE id = sentence_id_input;
END;
$$;
