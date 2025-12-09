-- Update add_generation_to_shot to ALWAYS create a new record
-- This allows the same generation to appear multiple times in a shot
-- (useful for duplicating images on the timeline)

CREATE OR REPLACE FUNCTION public.add_generation_to_shot(p_shot_id uuid, p_generation_id uuid, p_with_position boolean DEFAULT true)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, timeline_frame integer)
LANGUAGE plpgsql
AS $function$
DECLARE
  next_frame integer;
  new_record record;
BEGIN
  -- Always create a new record (allow duplicates)
  IF p_with_position THEN
    -- Calculate next timeline_frame
    -- Look at ALL items with valid timeline_frame
    SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
    INTO next_frame
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id
      AND sg.timeline_frame IS NOT NULL;
  ELSE
    -- No timeline_frame (unpositioned)
    next_frame := NULL;
  END IF;
  
  -- Insert new record
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
  VALUES (p_shot_id, p_generation_id, next_frame,
          CASE WHEN p_with_position THEN jsonb_build_object('auto_positioned', true) ELSE '{}'::jsonb END)
  RETURNING shot_generations.id, shot_generations.shot_id, shot_generations.generation_id, shot_generations.timeline_frame
  INTO new_record;
  
  RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
END;
$function$;

COMMENT ON FUNCTION add_generation_to_shot IS 'Adds a generation to a shot. Always creates a new record, allowing the same generation to appear multiple times in a shot (for timeline duplicates).';
