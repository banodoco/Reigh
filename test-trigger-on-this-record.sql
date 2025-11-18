-- Manually run the trigger logic on this specific record to see what happens
DO $$
DECLARE
  current_shot_data jsonb;
  v_generation_id uuid := 'db048ea7-72f6-487b-af8a-f098edb964aa';
  v_shot_id uuid := 'b277da46-9af8-4952-a969-6c8ef05b764f';
  v_timeline_frame int := NULL;
BEGIN
  RAISE NOTICE 'Testing trigger logic on generation %', v_generation_id;
  
  -- Get current shot_data (might be NULL)
  SELECT shot_data INTO current_shot_data
  FROM generations
  WHERE id = v_generation_id;
  
  RAISE NOTICE 'Current shot_data: %', current_shot_data;
  RAISE NOTICE 'Is NULL: %', current_shot_data IS NULL;
  
  -- Initialize to empty object if NULL
  IF current_shot_data IS NULL THEN
    current_shot_data := '{}'::jsonb;
    RAISE NOTICE 'Initialized to empty object: %', current_shot_data;
  END IF;
  
  -- Try jsonb_set
  current_shot_data := jsonb_set(
    current_shot_data,
    ARRAY[v_shot_id::TEXT],
    to_jsonb(v_timeline_frame),
    true
  );
  
  RAISE NOTICE 'After jsonb_set: %', current_shot_data;
  
  -- Try the UPDATE
  UPDATE generations
  SET shot_data = current_shot_data
  WHERE id = v_generation_id;
  
  RAISE NOTICE 'UPDATE executed, FOUND: %', FOUND;
  
  -- Check the result
  SELECT shot_data INTO current_shot_data
  FROM generations
  WHERE id = v_generation_id;
  
  RAISE NOTICE 'Final shot_data: %', current_shot_data;
  
  -- Don't actually commit
  RAISE EXCEPTION 'Test complete - rolling back';
END $$;

