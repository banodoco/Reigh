-- Simulate exactly what happens when a shot_generation is inserted
WITH test_generation AS (
  INSERT INTO generations (project_id, location, type, shot_data)
  VALUES (
    'f3c36ed6-eeb4-4259-8f67-b8260efd1c0e',
    'https://test.com/test-trigger-' || gen_random_uuid() || '.mp4',
    'video',
    NULL
  )
  RETURNING id, shot_data
),
test_shot_generation AS (
  INSERT INTO shot_generations (generation_id, shot_id, timeline_frame)
  SELECT 
    id,
    'b277da46-9af8-4952-a969-6c8ef05b764f'::uuid,
    NULL::int
  FROM test_generation
  RETURNING generation_id, shot_id, timeline_frame
),
result AS (
  SELECT g.id, g.shot_data
  FROM generations g
  WHERE g.id IN (SELECT id FROM test_generation)
),
cleanup AS (
  DELETE FROM shot_generations
  WHERE generation_id IN (SELECT id FROM test_generation)
  RETURNING generation_id
),
cleanup2 AS (
  DELETE FROM generations
  WHERE id IN (SELECT id FROM test_generation)
  RETURNING id
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'test_generation_id', (SELECT substring(id::text, 1, 8) FROM test_generation),
    'inserted_shot_generation', (
      SELECT jsonb_build_object(
        'shot_id', shot_id,
        'timeline_frame', timeline_frame
      )
      FROM test_shot_generation
    ),
    'result_shot_data', (SELECT shot_data FROM result),
    'trigger_fired_successfully', (SELECT shot_data IS NOT NULL FROM result),
    'diagnosis', CASE
      WHEN (SELECT shot_data IS NULL FROM result) THEN 'TRIGGER FAILED - shot_data is still NULL after insert'
      WHEN (SELECT shot_data = '{}'::jsonb FROM result) THEN 'TRIGGER FAILED - shot_data is empty object'
      ELSE 'TRIGGER WORKED - shot_data was populated'
    END
  )
) as test_result;
