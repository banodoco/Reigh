-- Update default spacing from 50 to 81 frames (matching client-side)

CREATE OR REPLACE FUNCTION public.add_generation_to_shot(p_shot_id uuid, p_generation_id uuid, p_with_position boolean DEFAULT true)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, timeline_frame integer)
LANGUAGE plpgsql
AS $function$
DECLARE
  next_frame integer;
  new_record record;
  item_count integer;
  min_frame integer;
  max_frame integer;
  avg_spacing integer;
  DEFAULT_SPACING constant integer := 81;
  MIN_SPACING constant integer := 10;
BEGIN
  -- Always create a new record (allow duplicates)
  IF p_with_position THEN
    -- Get stats about existing positioned items
    SELECT COUNT(*), MIN(sg.timeline_frame), MAX(sg.timeline_frame)
    INTO item_count, min_frame, max_frame
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id
      AND sg.timeline_frame IS NOT NULL;
    
    -- Calculate spacing based on existing items
    IF item_count < 2 THEN
      -- 0-1 items: use default spacing
      avg_spacing := DEFAULT_SPACING;
    ELSE
      -- 2+ items: calculate average spacing = (max - min) / (count - 1)
      -- Cap at DEFAULT_SPACING to prevent huge gaps from outliers
      avg_spacing := LEAST(DEFAULT_SPACING, GREATEST(MIN_SPACING, (max_frame - min_frame) / (item_count - 1)));
    END IF;
    
    -- Calculate next frame position
    IF max_frame IS NULL THEN
      next_frame := 0;  -- First item starts at 0
    ELSE
      next_frame := max_frame + avg_spacing;
    END IF;
    
    RAISE LOG '[AddGenToShot] Dynamic spacing: items=%, min=%, max=%, avg_spacing=%, next_frame=%',
      item_count, min_frame, max_frame, avg_spacing, next_frame;
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

COMMENT ON FUNCTION add_generation_to_shot IS 'Adds a generation to a shot with dynamic timeline spacing. Calculates average spacing from existing items (min 10, max 81). Always creates a new record, allowing duplicates.';
