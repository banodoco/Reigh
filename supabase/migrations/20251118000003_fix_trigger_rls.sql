-- Fix the trigger function to bypass RLS
-- The issue: RLS policies on generations table are blocking the trigger's UPDATE
-- even though the function has SECURITY DEFINER

-- First, create a policy that allows the postgres user to bypass RLS for this trigger
DO $$
BEGIN
  -- Drop existing policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'Allow trigger to update shot_data'
      AND polrelid = 'generations'::regclass
  ) THEN
    DROP POLICY "Allow trigger to update shot_data" ON generations;
  END IF;
END $$;

CREATE POLICY "Allow trigger to update shot_data"
  ON generations
  FOR UPDATE
  TO postgres
  USING (true)
  WITH CHECK (true);

-- Now recreate the function (same as before, but now postgres has a policy)
CREATE OR REPLACE FUNCTION public.sync_shot_to_generation_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_shot_data jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get current shot_data (might be NULL)
    SELECT shot_data INTO current_shot_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    -- Initialize to empty object if NULL
    IF current_shot_data IS NULL THEN
      current_shot_data := '{}'::jsonb;
    END IF;
    
    -- Add/update shot_id and timeline_frame in shot_data JSONB
    UPDATE generations
    SET shot_data = jsonb_set(
      current_shot_data,
      ARRAY[NEW.shot_id::TEXT],
      to_jsonb(NEW.timeline_frame),
      true
    )
    WHERE id = NEW.generation_id;
    
    -- Log if UPDATE didn't find the generation (shouldn't happen)
    IF NOT FOUND THEN
      RAISE WARNING 'sync_shot_to_generation_jsonb: Generation % not found for shot_generation %', 
        NEW.generation_id, NEW.id;
    END IF;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove shot_id from shot_data JSONB
    UPDATE generations
    SET shot_data = COALESCE(shot_data, '{}'::jsonb) - OLD.shot_id::TEXT
    WHERE id = OLD.generation_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Grant execute permission to bypass RLS
GRANT EXECUTE ON FUNCTION sync_shot_to_generation_jsonb() TO service_role;
GRANT EXECUTE ON FUNCTION sync_shot_to_generation_jsonb() TO postgres;

COMMENT ON FUNCTION sync_shot_to_generation_jsonb IS
'Keeps generations.shot_data in sync with shot_generations table.
FIXED: Added SET search_path and proper permissions to bypass RLS.';

-- Test the trigger
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
      RAISE NOTICE '✓ SUCCESS: Trigger is now working! shot_data = %', result_shot_data;
    ELSE
      RAISE WARNING '✗ FAILED: Trigger still not working. shot_data = %', result_shot_data;
    END IF;
  ELSE
    RAISE NOTICE 'No test records found (all generations already have shot_data)';
  END IF;
END $$;

