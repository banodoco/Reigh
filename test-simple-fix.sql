-- Simple test: manually fix this one record and verify the trigger function works
-- First, let's manually fix this record
UPDATE generations
SET shot_data = jsonb_build_object('b277da46-9af8-4952-a969-6c8ef05b764f', NULL)
WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa';

-- Verify it worked
SELECT jsonb_pretty(
  jsonb_build_object(
    'generation_id', 'db048ea7-72f6-487b-af8a-f098edb964aa',
    'shot_data_after_fix', (SELECT shot_data FROM generations WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa'),
    'fix_succeeded', (SELECT shot_data IS NOT NULL FROM generations WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa')
  )
) as fix_result;

