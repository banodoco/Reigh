-- Add based_on column to generations table to track source generation for derived content
-- This allows tracking magic edits, variations, and other derived generations back to their source

ALTER TABLE generations
ADD COLUMN based_on UUID REFERENCES generations(id) ON DELETE SET NULL;

-- Add index for efficient querying of derived generations
CREATE INDEX idx_generations_based_on ON generations(based_on) WHERE based_on IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN generations.based_on IS 'References the generation ID that this generation is based on (e.g., for magic edits, the source generation)';

