-- Add indexes to optimize shot_generations queries

-- Index for finding existing records by shot+generation (used in RPC)
CREATE INDEX IF NOT EXISTS idx_shot_generations_shot_generation_lookup 
ON shot_generations (shot_id, generation_id);

-- Index for finding NULL position records (used in positioning logic)
CREATE INDEX IF NOT EXISTS idx_shot_generations_null_position_lookup 
ON shot_generations (shot_id, generation_id) 
WHERE "position" IS NULL;

-- Index for calculating max position per shot (used for next position calculation)
CREATE INDEX IF NOT EXISTS idx_shot_generations_position_calc 
ON shot_generations (shot_id, "position") 
WHERE "position" IS NOT NULL;
