-- Add extensive logging to figure out exactly what's failing
CREATE OR REPLACE FUNCTION public.sync_shot_to_generation_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_shot_data jsonb;
  v_gen_exists boolean;
  v_update_count int;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Log the input
    RAISE NOTICE '[TRIGGER] Processing % on shot_generations. generation_id=%, shot_id=%', 
      TG_OP, NEW.generation_id, NEW.shot_id;
    
    -- Check if generation exists
    SELECT EXISTS(SELECT 1 FROM generations WHERE id = NEW.generation_id) INTO v_gen_exists;
    RAISE NOTICE '[TRIGGER] Generation exists: %', v_gen_exists;
    
    IF NOT v_gen_exists THEN
      RAISE WARNING '[TRIGGER] Generation % does not exist! Cannot update shot_data.', NEW.generation_id;
      RETURN NEW;
    END IF;
    
    -- Get current shot_data (might be NULL)
    SELECT shot_data INTO current_shot_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    RAISE NOTICE '[TRIGGER] Current shot_data: % (is NULL: %)', current_shot_data, current_shot_data IS NULL;
    
    -- Initialize to empty object if NULL
    IF current_shot_data IS NULL THEN
      current_shot_data := '{}'::jsonb;
      RAISE NOTICE '[TRIGGER] Initialized to empty object';
    END IF;
    
    -- Build the new shot_data value
    current_shot_data := jsonb_set(
      current_shot_data,
      ARRAY[NEW.shot_id::TEXT],
      to_jsonb(NEW.timeline_frame),
      true
    );
    
    RAISE NOTICE '[TRIGGER] New shot_data value: %', current_shot_data;
    
    -- Add/update shot_id and timeline_frame in shot_data JSONB
    UPDATE generations
    SET shot_data = current_shot_data
    WHERE id = NEW.generation_id;
    
    GET DIAGNOSTICS v_update_count = ROW_COUNT;
    
    RAISE NOTICE '[TRIGGER] UPDATE affected % rows', v_update_count;
    
    -- Log if UPDATE didn't find the generation
    IF v_update_count = 0 THEN
      RAISE WARNING '[TRIGGER] UPDATE found 0 rows! generation_id=%, shot_data_value=%', 
        NEW.generation_id, current_shot_data;
    ELSE
      RAISE NOTICE '[TRIGGER] SUCCESS! Updated generation % with shot_data=%', 
        NEW.generation_id, current_shot_data;
    END IF;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE NOTICE '[TRIGGER] Deleting shot % from generation %', OLD.shot_id, OLD.generation_id;
    
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
DEBUGGING VERSION: Added extensive logging to diagnose why UPDATE is not working.';

