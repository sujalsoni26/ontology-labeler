-- Migration: Create model_labels table and add extra_access to users
-- Created: 2026-03-26
-- Description: Support for AI model-labeled sentences with user confirmation workflow

-- 1. Create model_labels table
CREATE TABLE IF NOT EXISTS model_labels (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sentence_id BIGINT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('pdr', 'pd', 'pr', 'p', 'n')),
  subject_start INTEGER,
  subject_end INTEGER,
  object_start INTEGER,
  object_end INTEGER,
  model_name TEXT NOT NULL,
  confidence FLOAT,
  check_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_subject_span CHECK (
    (subject_start IS NULL AND subject_end IS NULL) OR 
    (subject_start IS NOT NULL AND subject_end IS NOT NULL AND subject_start <= subject_end)
  ),
  CONSTRAINT valid_object_span CHECK (
    (object_start IS NULL AND object_end IS NULL) OR 
    (object_start IS NOT NULL AND object_end IS NOT NULL AND object_start <= object_end)
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_model_labels_sentence_property 
  ON model_labels(sentence_id, property_id);
CREATE INDEX IF NOT EXISTS idx_model_labels_property_id 
  ON model_labels(property_id);
CREATE INDEX IF NOT EXISTS idx_model_labels_check_count 
  ON model_labels(check_count);

-- 2. Add extra_access column to auth.users (via users table if you have one)
-- If you have a custom users table:
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS extra_access BOOLEAN DEFAULT FALSE;

-- If not, and you're using auth.users directly, you'll need to use user_metadata:
-- This is handled via RLS policies or a separate profile table

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_model_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_model_labels_updated_at
  BEFORE UPDATE ON model_labels
  FOR EACH ROW
  EXECUTE FUNCTION update_model_labels_updated_at();

-- Enable RLS on model_labels if not already enabled
ALTER TABLE model_labels ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read model_labels
CREATE POLICY IF NOT EXISTS "Users can read model_labels"
  ON model_labels FOR SELECT
  TO authenticated
  USING (TRUE);

-- Allow only users with extra_access to increment check_count
CREATE POLICY IF NOT EXISTS "Extra access users can update check_count"
  ON model_labels FOR UPDATE
  TO authenticated
  USING (
    (SELECT extra_access FROM users WHERE id = auth.uid()) = TRUE
  )
  WITH CHECK (
    (SELECT extra_access FROM users WHERE id = auth.uid()) = TRUE
  );
