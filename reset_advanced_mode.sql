-- Reset advancedMode and phaseConfig for all shots
-- This cleans up data contamination from the settings cross-save bug

UPDATE shots
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{travel-between-images}',
  COALESCE(settings->'travel-between-images', '{}'::jsonb) 
    - 'advancedMode' 
    - 'phaseConfig'
    || '{"advancedMode": false}'::jsonb
)
WHERE settings ? 'travel-between-images'
  AND (
    (settings->'travel-between-images'->>'advancedMode')::boolean = true
    OR settings->'travel-between-images' ? 'phaseConfig'
  );

-- Show how many shots were updated
SELECT 
  COUNT(*) as shots_updated,
  COUNT(DISTINCT project_id) as projects_affected
FROM shots
WHERE settings->'travel-between-images'->>'advancedMode' = 'false';

