-- Fix the trigger logic to handle NULL timeline_frame correctly
CREATE OR REPLACE FUNCTION public.sync_shot_to_generation_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_shot_data jsonb;
  v_shot_id text;
  v_timeline_frame jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get current shot_data
    SELECT shot_data INTO current_shot_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    -- Initialize if NULL
    IF current_shot_data IS NULL THEN
      current_shot_data := '{}'::jsonb;
    END IF;
    
    v_shot_id := NEW.shot_id::TEXT;
    
    -- Handle timeline_frame carefully
    IF NEW.timeline_frame IS NULL THEN
      v_timeline_frame := 'null'::jsonb;
    ELSE
      v_timeline_frame := to_jsonb(NEW.timeline_frame);
    END IF;
    
    -- Use jsonb_build_object + || operator instead of jsonb_set to avoid NULL issues
    -- This is safer: existing_data || { "shot_id": frame }
    current_shot_data := current_shot_data || jsonb_build_object(v_shot_id, v_timeline_frame);
    
    -- Update
    UPDATE generations
    SET shot_data = current_shot_data
    WHERE id = NEW.generation_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE generations
    SET shot_data = COALESCE(shot_data, '{}'::jsonb) - OLD.shot_id::TEXT
    WHERE id = OLD.generation_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION sync_shot_to_generation_jsonb IS
'Keeps generations.shot_data in sync. FIXED: Uses || operator instead of jsonb_set to avoid NULL issues.';

-- Backfill again to fix any records that were set to NULL by the broken trigger
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
  
  RAISE NOTICE 'Fixed % generations that had broken shot_data', v_updated_count;
END $$;

