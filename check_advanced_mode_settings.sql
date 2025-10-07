-- Check where advancedMode is set to true in the database

-- Check user settings
SELECT 
  'USER' as scope,
  id as entity_id,
  settings->'travel-between-images'->>'advancedMode' as advanced_mode_value,
  settings->'travel-between-images' as full_travel_settings
FROM users
WHERE settings->'travel-between-images'->>'advancedMode' = 'true';

-- Check project settings
SELECT 
  'PROJECT' as scope,
  id as entity_id,
  name as project_name,
  settings->'travel-between-images'->>'advancedMode' as advanced_mode_value,
  settings->'travel-between-images' as full_travel_settings
FROM projects
WHERE settings->'travel-between-images'->>'advancedMode' = 'true';

-- Check shot settings
SELECT 
  'SHOT' as scope,
  s.id as entity_id,
  s.name as shot_name,
  p.name as project_name,
  s.settings->'travel-between-images'->>'advancedMode' as advanced_mode_value,
  s.settings->'travel-between-images'->'phaseConfig' as phase_config
FROM shots s
JOIN projects p ON s.project_id = p.id
WHERE s.settings->'travel-between-images'->>'advancedMode' = 'true'
LIMIT 20;

-- Count totals
SELECT 
  'Summary' as info,
  (SELECT COUNT(*) FROM users WHERE settings->'travel-between-images'->>'advancedMode' = 'true') as users_with_advanced_mode,
  (SELECT COUNT(*) FROM projects WHERE settings->'travel-between-images'->>'advancedMode' = 'true') as projects_with_advanced_mode,
  (SELECT COUNT(*) FROM shots WHERE settings->'travel-between-images'->>'advancedMode' = 'true') as shots_with_advanced_mode;

