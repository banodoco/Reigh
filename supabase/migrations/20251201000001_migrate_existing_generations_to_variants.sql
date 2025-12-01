-- Migration: Migrate existing generations data to generation_variants
-- This creates variants for all existing generations
-- IMPORTANT: For generations WITH upscaled_url, the upscaled version becomes primary
--            For generations WITHOUT upscaled_url, the original becomes primary

-- 1. Create 'original' variants for ALL generations with output
-- For generations WITH upscaled_url: original is NOT primary (upscaled will be)
-- For generations WITHOUT upscaled_url: original IS primary
INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, name, is_primary, variant_type, created_at)
SELECT 
  gen_random_uuid(),
  id,
  location,
  thumbnail_url,
  params,
  name,
  upscaled_url IS NULL,    -- Primary only if NO upscaled version exists
  'original',
  created_at
FROM generations
WHERE location IS NOT NULL
  AND NOT EXISTS (
    -- Skip if variants already exist for this generation (idempotency)
    SELECT 1 FROM generation_variants gv WHERE gv.generation_id = generations.id
  );

-- 2. Create upscaled variants where upscaled_url exists
-- These ARE primary - upscaled is the preferred version
INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, name, is_primary, variant_type, created_at)
SELECT 
  gen_random_uuid(),
  id,
  upscaled_url,
  thumbnail_url,           -- Share thumbnail with original for now
  params,                  -- Copy params from generation
  'Upscaled',              -- Name the variant
  true,                    -- Upscaled becomes primary
  'upscaled',
  COALESCE(updated_at, created_at)
FROM generations
WHERE upscaled_url IS NOT NULL
  AND NOT EXISTS (
    -- Skip if upscaled variant already exists (idempotency)
    SELECT 1 FROM generation_variants gv 
    WHERE gv.generation_id = generations.id 
    AND gv.variant_type = 'upscaled'
  );

-- 3. Update primary_variant_id on generations to point to primary variants
UPDATE generations g
SET primary_variant_id = (
  SELECT gv.id 
  FROM generation_variants gv 
  WHERE gv.generation_id = g.id AND gv.is_primary = true
  LIMIT 1
)
WHERE g.primary_variant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM generation_variants gv 
    WHERE gv.generation_id = g.id AND gv.is_primary = true
  );

-- 4. For generations with upscaled versions, update generations table to reflect upscaled as primary
-- The trigger would normally do this, but we need to do it explicitly for migrated data
UPDATE generations g
SET 
  location = gv.location,
  name = gv.name
FROM generation_variants gv
WHERE gv.generation_id = g.id 
  AND gv.is_primary = true
  AND gv.variant_type = 'upscaled';

-- Log migration stats
DO $$
DECLARE
  total_generations INTEGER;
  generations_with_variants INTEGER;
  total_variants INTEGER;
  upscaled_variants INTEGER;
  upscaled_as_primary INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_generations FROM generations WHERE location IS NOT NULL;
  SELECT COUNT(DISTINCT generation_id) INTO generations_with_variants FROM generation_variants;
  SELECT COUNT(*) INTO total_variants FROM generation_variants;
  SELECT COUNT(*) INTO upscaled_variants FROM generation_variants WHERE variant_type = 'upscaled';
  SELECT COUNT(*) INTO upscaled_as_primary FROM generation_variants WHERE variant_type = 'upscaled' AND is_primary = true;
  
  RAISE NOTICE 'Migration complete: % generations, % with variants, % total variants (% upscaled, % upscaled as primary)',
    total_generations, generations_with_variants, total_variants, upscaled_variants, upscaled_as_primary;
END $$;

