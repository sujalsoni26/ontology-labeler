-- SQL to add description and link columns to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS domain_link TEXT,
ADD COLUMN IF NOT EXISTS range_link TEXT;

-- If property_link exists from a previous run, drop it
ALTER TABLE properties
DROP COLUMN IF EXISTS property_link;
