-- Simpler test: Create generation, insert shot_generation, check result
DO $$
DECLARE
  test_gen_id uuid;
  result_shot_data jsonb;
BEGIN
  -- Step 1: Create test generation
  INSERT INTO generations (project_id, location, type, shot_data)
  VALUES (
    'f3c36ed6-eeb4-4259-8f67-b8260efd1c0e',
    'https://test.com/test-' || gen_random_uuid() || '.mp4',
    'video',
    NULL
  )
  RETURNING id INTO test_gen_id;
  
  -- Step 2: Insert shot_generation (this should trigger the function)
  INSERT INTO shot_generations (generation_id, shot_id, timeline_frame)
  VALUES (test_gen_id, 'b277da46-9af8-4952-a969-6c8ef05b764f', NULL);
  
  -- Step 3: Check if shot_data was populated
  SELECT shot_data INTO result_shot_data
  FROM generations
  WHERE id = test_gen_id;
  
  -- Step 4: Show result
  RAISE NOTICE 'Test generation ID: %', test_gen_id;
  RAISE NOTICE 'Result shot_data: %', result_shot_data;
  RAISE NOTICE 'Is NULL: %', result_shot_data IS NULL;
  RAISE NOTICE 'Trigger worked: %', result_shot_data IS NOT NULL;
  
  -- Cleanup
  DELETE FROM shot_generations WHERE generation_id = test_gen_id;
  DELETE FROM generations WHERE id = test_gen_id;
  
  -- Return result as exception message so user can see it
  IF result_shot_data IS NULL THEN
    RAISE EXCEPTION 'TRIGGER FAILED: shot_data is NULL after inserting shot_generation';
  ELSE
    RAISE EXCEPTION 'TRIGGER WORKED: shot_data = %', result_shot_data;
  END IF;
END $$;

