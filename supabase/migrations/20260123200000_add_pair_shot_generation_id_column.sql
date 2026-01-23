-- Migration: Add pair_shot_generation_id as proper FK column on generations
--
-- This replaces storing pair_shot_generation_id in the JSONB params column
-- with a proper foreign key column that has referential integrity.
--
-- When a shot_generation is deleted (image removed from timeline), the
-- pair_shot_generation_id will be set to NULL (ON DELETE SET NULL).
-- This makes the child generation "unpositioned" but preserves the content.

-- 1. Add the column (nullable UUID with FK to shot_generations)
ALTER TABLE generations
ADD COLUMN IF NOT EXISTS pair_shot_generation_id UUID
REFERENCES shot_generations(id) ON DELETE SET NULL;

-- 2. Migrate existing data from params JSONB to the new column
-- Only update rows where the column is currently NULL and params has the value
UPDATE generations
SET pair_shot_generation_id = (params->>'pair_shot_generation_id')::uuid
WHERE pair_shot_generation_id IS NULL
  AND params->>'pair_shot_generation_id' IS NOT NULL
  AND params->>'pair_shot_generation_id' != ''
  AND (params->>'pair_shot_generation_id')::uuid IS NOT NULL;

-- 3. Create index for efficient lookups by pair_shot_generation_id
-- This is used when matching videos to timeline slots
CREATE INDEX IF NOT EXISTS idx_generations_pair_shot_generation_id
ON generations(pair_shot_generation_id)
WHERE pair_shot_generation_id IS NOT NULL;

-- 4. Create composite index for the common query pattern:
-- Finding children of a parent that match a specific pair
CREATE INDEX IF NOT EXISTS idx_generations_parent_pair_lookup
ON generations(parent_generation_id, pair_shot_generation_id)
WHERE is_child = true AND pair_shot_generation_id IS NOT NULL;

-- Note: We don't remove pair_shot_generation_id from params because:
-- 1. Tasks still pass it through params (that's the source)
-- 2. Some frontend code may still read from params (backward compat)
-- 3. The params copy serves as an audit trail
-- The column becomes the source of truth for queries/FK integrity.
