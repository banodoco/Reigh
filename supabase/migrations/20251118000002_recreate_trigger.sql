-- Recreate the trigger to ensure it uses the updated function
-- The previous migration updated the function but didn't recreate the trigger

-- Drop and recreate the trigger to force it to use the updated function
DROP TRIGGER IF EXISTS sync_shot_generations_jsonb ON shot_generations;

CREATE TRIGGER sync_shot_generations_jsonb
  AFTER INSERT OR UPDATE OR DELETE ON shot_generations
  FOR EACH ROW
  EXECUTE FUNCTION sync_shot_to_generation_jsonb();

COMMENT ON TRIGGER sync_shot_generations_jsonb ON shot_generations IS
'Keeps generations.shot_data in sync with shot_generations table by calling sync_shot_to_generation_jsonb().';

-- Test the trigger by updating one record
DO $$
DECLARE
  test_gen_id uuid;
  test_shot_id uuid;
  result_shot_data jsonb;
BEGIN
  -- Find a generation with NULL shot_data but has shot_generations
  SELECT g.id, sg.shot_id
  INTO test_gen_id, test_shot_id
  FROM generations g
  INNER JOIN shot_generations sg ON sg.generation_id = g.id
  WHERE g.shot_data IS NULL OR g.shot_data = '{}'::jsonb
  LIMIT 1;
  
  IF test_gen_id IS NOT NULL THEN
    RAISE NOTICE 'Testing trigger on generation: %', test_gen_id;
    
    -- Update the shot_generation to trigger the function
    UPDATE shot_generations
    SET updated_at = NOW()
    WHERE generation_id = test_gen_id
      AND shot_id = test_shot_id;
    
    -- Check if shot_data was populated
    SELECT shot_data INTO result_shot_data
    FROM generations
    WHERE id = test_gen_id;
    
    IF result_shot_data IS NOT NULL AND result_shot_data != '{}'::jsonb THEN
      RAISE NOTICE 'SUCCESS: Trigger is now working! shot_data = %', result_shot_data;
    ELSE
      RAISE WARNING 'FAILED: Trigger still not working. shot_data = %', result_shot_data;
    END IF;
  ELSE
    RAISE NOTICE 'No test records found (all generations already have shot_data)';
  END IF;
END $$;

