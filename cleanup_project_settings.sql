-- Remove advancedMode and phaseConfig from project-level settings
-- These should only exist at the shot level

UPDATE projects
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{travel-between-images}',
  COALESCE(settings->'travel-between-images', '{}'::jsonb) 
    - 'advancedMode' 
    - 'phaseConfig'
)
WHERE settings ? 'travel-between-images'
  AND (
    settings->'travel-between-images' ? 'advancedMode'
    OR settings->'travel-between-images' ? 'phaseConfig'
  );

-- Show results
SELECT 
  id,
  name,
  settings->'travel-between-images' as travel_settings
FROM projects
WHERE settings ? 'travel-between-images'
LIMIT 10;

