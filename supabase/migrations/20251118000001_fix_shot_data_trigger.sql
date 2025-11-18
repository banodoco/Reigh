-- Fix the broken sync_shot_to_generation_jsonb trigger function
-- The issue: When shot_data is NULL and timeline_frame is NULL, jsonb_set fails silently

CREATE OR REPLACE FUNCTION public.sync_shot_to_generation_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

COMMENT ON FUNCTION sync_shot_to_generation_jsonb IS
'Keeps generations.shot_data in sync with shot_generations table.
FIXED: Now properly handles NULL shot_data by fetching and initializing it first.';

-- Now backfill all the missing shot_data records
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  RAISE NOTICE 'Backfilling missing shot_data...';
  
  WITH shot_mappings AS (
    SELECT 
      generation_id,
      jsonb_object_agg(shot_id::text, timeline_frame) as shot_data
    FROM shot_generations
    GROUP BY generation_id
  )
  UPDATE generations g
  SET shot_data = sm.shot_data
  FROM shot_mappings sm
  WHERE g.id = sm.generation_id
    AND (g.shot_data IS NULL OR g.shot_data = '{}'::jsonb);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE 'Backfilled % generations with shot_data', v_updated_count;
END $$;

