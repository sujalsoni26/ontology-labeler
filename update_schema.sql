-- 1. Add the label_count column to sentences table
ALTER TABLE sentences 
ADD COLUMN IF NOT EXISTS label_count INTEGER DEFAULT 0;

-- 2. Populate the column with existing counts
UPDATE sentences 
SET label_count = (
    SELECT COUNT(*) 
    FROM labels 
    WHERE labels.sentence_id = sentences.id
);

-- 3. Create a function to automatically update the count
CREATE OR REPLACE FUNCTION update_label_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE sentences 
        SET label_count = label_count + 1 
        WHERE id = NEW.sentence_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE sentences 
        SET label_count = label_count - 1 
        WHERE id = OLD.sentence_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Create the trigger to fire on INSERT or DELETE
DROP TRIGGER IF EXISTS update_label_count_trigger ON labels;

CREATE TRIGGER update_label_count_trigger
AFTER INSERT OR DELETE ON labels
FOR EACH ROW EXECUTE FUNCTION update_label_count();
