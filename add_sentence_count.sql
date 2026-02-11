-- Add sentence_count to properties table for performance
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS sentence_count INTEGER DEFAULT 0;

-- Update existing counts
UPDATE properties p
SET sentence_count = (
    SELECT COUNT(*) 
    FROM sentences s 
    WHERE s.property_id = p.id
);
