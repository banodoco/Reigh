-- Add critical missing index on generation_id for JOIN performance
-- This significantly improves LEFT JOIN performance between generations and shot_generations

CREATE INDEX IF NOT EXISTS idx_shot_generations_generation_id
  ON shot_generations (generation_id);

-- This index enables fast lookups when joining:
-- generations LEFT JOIN shot_generations ON shot_generations.generation_id = generations.id 