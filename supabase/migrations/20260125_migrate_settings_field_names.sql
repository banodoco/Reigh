-- Migration: Unify settings field names
-- This migration moves all old field names to new standardized names and removes the old ones.
--
-- Shot settings (shots.settings['travel-between-images']):
--   batchVideoPrompt -> prompt
--   selectedLoras -> loras
--   steerableMotionSettings.negative_prompt -> negativePrompt
--
-- Segment overrides (shot_generations.metadata):
--   pair_prompt -> segmentOverrides.prompt
--   pair_negative_prompt -> segmentOverrides.negativePrompt
--   pair_loras -> segmentOverrides.loras
--   pair_motion_mode -> segmentOverrides.motionMode
--   pair_amount_of_motion -> segmentOverrides.amountOfMotion
--   pair_phase_config -> segmentOverrides.phaseConfig
--   pair_selected_phase_preset_id -> segmentOverrides.selectedPhasePresetId
--   pair_random_seed -> segmentOverrides.randomSeed
--   pair_seed -> segmentOverrides.seed
--   pair_num_frames -> segmentOverrides.numFrames

-- ============================================================================
-- PART 1: Migrate shot settings
-- ============================================================================

-- Migrate batchVideoPrompt -> prompt (only if prompt doesn't exist or is null)
UPDATE shots
SET settings = jsonb_set(
  settings,
  '{travel-between-images,prompt}',
  settings->'travel-between-images'->'batchVideoPrompt'
)
WHERE settings->'travel-between-images'->'batchVideoPrompt' IS NOT NULL
  AND (settings->'travel-between-images'->'prompt' IS NULL
       OR settings->'travel-between-images'->'prompt' = 'null'::jsonb);

-- Remove batchVideoPrompt
UPDATE shots
SET settings = settings #- '{travel-between-images,batchVideoPrompt}'
WHERE settings->'travel-between-images'->'batchVideoPrompt' IS NOT NULL;

-- Migrate selectedLoras -> loras (only if loras doesn't exist or is null)
UPDATE shots
SET settings = jsonb_set(
  settings,
  '{travel-between-images,loras}',
  settings->'travel-between-images'->'selectedLoras'
)
WHERE settings->'travel-between-images'->'selectedLoras' IS NOT NULL
  AND (settings->'travel-between-images'->'loras' IS NULL
       OR settings->'travel-between-images'->'loras' = 'null'::jsonb);

-- Remove selectedLoras
UPDATE shots
SET settings = settings #- '{travel-between-images,selectedLoras}'
WHERE settings->'travel-between-images'->'selectedLoras' IS NOT NULL;

-- Migrate steerableMotionSettings.negative_prompt -> negativePrompt
UPDATE shots
SET settings = jsonb_set(
  settings,
  '{travel-between-images,negativePrompt}',
  settings->'travel-between-images'->'steerableMotionSettings'->'negative_prompt'
)
WHERE settings->'travel-between-images'->'steerableMotionSettings'->'negative_prompt' IS NOT NULL
  AND (settings->'travel-between-images'->'negativePrompt' IS NULL
       OR settings->'travel-between-images'->'negativePrompt' = 'null'::jsonb);

-- Remove negative_prompt from steerableMotionSettings
UPDATE shots
SET settings = jsonb_set(
  settings,
  '{travel-between-images,steerableMotionSettings}',
  (settings->'travel-between-images'->'steerableMotionSettings') - 'negative_prompt'
)
WHERE settings->'travel-between-images'->'steerableMotionSettings'->'negative_prompt' IS NOT NULL;

-- ============================================================================
-- PART 2: Migrate segment overrides in shot_generations.metadata
-- ============================================================================

-- Create segmentOverrides object if it doesn't exist but old fields do
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides}',
  '{}'::jsonb
)
WHERE metadata IS NOT NULL
  AND metadata->'segmentOverrides' IS NULL
  AND (metadata->'pair_prompt' IS NOT NULL
       OR metadata->'pair_negative_prompt' IS NOT NULL
       OR metadata->'pair_loras' IS NOT NULL
       OR metadata->'pair_motion_mode' IS NOT NULL
       OR metadata->'pair_amount_of_motion' IS NOT NULL
       OR metadata->'pair_phase_config' IS NOT NULL
       OR metadata->'pair_selected_phase_preset_id' IS NOT NULL
       OR metadata->'pair_random_seed' IS NOT NULL
       OR metadata->'pair_seed' IS NOT NULL
       OR metadata->'pair_num_frames' IS NOT NULL);

-- Migrate pair_prompt -> segmentOverrides.prompt
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,prompt}',
  metadata->'pair_prompt'
)
WHERE metadata->'pair_prompt' IS NOT NULL
  AND (metadata->'segmentOverrides'->'prompt' IS NULL
       OR metadata->'segmentOverrides'->'prompt' = 'null'::jsonb);

-- Remove pair_prompt
UPDATE shot_generations
SET metadata = metadata - 'pair_prompt'
WHERE metadata->'pair_prompt' IS NOT NULL;

-- Migrate pair_negative_prompt -> segmentOverrides.negativePrompt
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,negativePrompt}',
  metadata->'pair_negative_prompt'
)
WHERE metadata->'pair_negative_prompt' IS NOT NULL
  AND (metadata->'segmentOverrides'->'negativePrompt' IS NULL
       OR metadata->'segmentOverrides'->'negativePrompt' = 'null'::jsonb);

-- Remove pair_negative_prompt
UPDATE shot_generations
SET metadata = metadata - 'pair_negative_prompt'
WHERE metadata->'pair_negative_prompt' IS NOT NULL;

-- Migrate pair_loras -> segmentOverrides.loras
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,loras}',
  metadata->'pair_loras'
)
WHERE metadata->'pair_loras' IS NOT NULL
  AND (metadata->'segmentOverrides'->'loras' IS NULL
       OR metadata->'segmentOverrides'->'loras' = 'null'::jsonb);

-- Remove pair_loras
UPDATE shot_generations
SET metadata = metadata - 'pair_loras'
WHERE metadata->'pair_loras' IS NOT NULL;

-- Migrate pair_motion_mode -> segmentOverrides.motionMode
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,motionMode}',
  metadata->'pair_motion_mode'
)
WHERE metadata->'pair_motion_mode' IS NOT NULL
  AND (metadata->'segmentOverrides'->'motionMode' IS NULL
       OR metadata->'segmentOverrides'->'motionMode' = 'null'::jsonb);

-- Remove pair_motion_mode
UPDATE shot_generations
SET metadata = metadata - 'pair_motion_mode'
WHERE metadata->'pair_motion_mode' IS NOT NULL;

-- Migrate pair_amount_of_motion -> segmentOverrides.amountOfMotion
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,amountOfMotion}',
  metadata->'pair_amount_of_motion'
)
WHERE metadata->'pair_amount_of_motion' IS NOT NULL
  AND (metadata->'segmentOverrides'->'amountOfMotion' IS NULL
       OR metadata->'segmentOverrides'->'amountOfMotion' = 'null'::jsonb);

-- Remove pair_amount_of_motion
UPDATE shot_generations
SET metadata = metadata - 'pair_amount_of_motion'
WHERE metadata->'pair_amount_of_motion' IS NOT NULL;

-- Migrate pair_phase_config -> segmentOverrides.phaseConfig
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,phaseConfig}',
  metadata->'pair_phase_config'
)
WHERE metadata->'pair_phase_config' IS NOT NULL
  AND (metadata->'segmentOverrides'->'phaseConfig' IS NULL
       OR metadata->'segmentOverrides'->'phaseConfig' = 'null'::jsonb);

-- Remove pair_phase_config
UPDATE shot_generations
SET metadata = metadata - 'pair_phase_config'
WHERE metadata->'pair_phase_config' IS NOT NULL;

-- Migrate pair_selected_phase_preset_id -> segmentOverrides.selectedPhasePresetId
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,selectedPhasePresetId}',
  metadata->'pair_selected_phase_preset_id'
)
WHERE metadata->'pair_selected_phase_preset_id' IS NOT NULL
  AND (metadata->'segmentOverrides'->'selectedPhasePresetId' IS NULL
       OR metadata->'segmentOverrides'->'selectedPhasePresetId' = 'null'::jsonb);

-- Remove pair_selected_phase_preset_id
UPDATE shot_generations
SET metadata = metadata - 'pair_selected_phase_preset_id'
WHERE metadata->'pair_selected_phase_preset_id' IS NOT NULL;

-- Migrate pair_random_seed -> segmentOverrides.randomSeed
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,randomSeed}',
  metadata->'pair_random_seed'
)
WHERE metadata->'pair_random_seed' IS NOT NULL
  AND (metadata->'segmentOverrides'->'randomSeed' IS NULL
       OR metadata->'segmentOverrides'->'randomSeed' = 'null'::jsonb);

-- Remove pair_random_seed
UPDATE shot_generations
SET metadata = metadata - 'pair_random_seed'
WHERE metadata->'pair_random_seed' IS NOT NULL;

-- Migrate pair_seed -> segmentOverrides.seed
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,seed}',
  metadata->'pair_seed'
)
WHERE metadata->'pair_seed' IS NOT NULL
  AND (metadata->'segmentOverrides'->'seed' IS NULL
       OR metadata->'segmentOverrides'->'seed' = 'null'::jsonb);

-- Remove pair_seed
UPDATE shot_generations
SET metadata = metadata - 'pair_seed'
WHERE metadata->'pair_seed' IS NOT NULL;

-- Migrate pair_num_frames -> segmentOverrides.numFrames
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{segmentOverrides,numFrames}',
  metadata->'pair_num_frames'
)
WHERE metadata->'pair_num_frames' IS NOT NULL
  AND (metadata->'segmentOverrides'->'numFrames' IS NULL
       OR metadata->'segmentOverrides'->'numFrames' = 'null'::jsonb);

-- Remove pair_num_frames
UPDATE shot_generations
SET metadata = metadata - 'pair_num_frames'
WHERE metadata->'pair_num_frames' IS NOT NULL;

-- ============================================================================
-- PART 3: Clean up empty segmentOverrides objects
-- ============================================================================

-- Remove empty segmentOverrides objects
UPDATE shot_generations
SET metadata = metadata - 'segmentOverrides'
WHERE metadata->'segmentOverrides' = '{}'::jsonb;
