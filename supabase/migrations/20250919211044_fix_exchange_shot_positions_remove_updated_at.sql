-- Add updated_at column to shot_generations table for proper timestamp tracking
-- This allows the exchange_shot_positions function to work correctly

-- Add updated_at column with default value
ALTER TABLE shot_generations 
ADD COLUMN updated_at timestamptz DEFAULT NOW();

-- Set updated_at for existing records
UPDATE shot_generations 
SET updated_at = NOW() 
WHERE updated_at IS NULL;

-- Make updated_at NOT NULL now that all records have values
ALTER TABLE shot_generations 
ALTER COLUMN updated_at SET NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN shot_generations.updated_at IS 'Timestamp when the record was last modified';

-- Verify the functions work correctly now
SELECT 'Added updated_at column to shot_generations table' as status;