-- Update add_generation_to_shot RPC function to work with timeline_frame instead of position
-- This function is used by the frontend to add generations to shots

DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid);
DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id UUID,
  p_generation_id UUID,
  p_with_position BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  id UUID,
  shot_id UUID,
  generation_id UUID,
  timeline_frame INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  next_frame integer;
  existing_record record;
  new_record record;
BEGIN
  -- Check if this generation is already associated with this shot
  SELECT sg.id, sg.timeline_frame 
  INTO existing_record
  FROM shot_generations sg 
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id
  LIMIT 1;

  IF FOUND THEN
    -- Record exists
    IF p_with_position AND existing_record.timeline_frame IS NULL THEN
      -- Need to assign timeline_frame to existing record
      -- But only calculate next frame for items that haven't been manually positioned
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
        AND (sg.metadata->>'user_positioned' IS NULL AND sg.metadata->>'drag_source' IS NULL);
      
      UPDATE shot_generations
      SET timeline_frame = next_frame,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('auto_positioned', true)
      WHERE id = existing_record.id;
      
      -- Return updated record
      SELECT sg.id, sg.shot_id, sg.generation_id, sg.timeline_frame
      INTO new_record
      FROM shot_generations sg
      WHERE sg.id = existing_record.id;
      
      RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
    ELSE
      -- Return existing record as-is
      RETURN QUERY SELECT existing_record.id, p_shot_id, p_generation_id, existing_record.timeline_frame;
    END IF;
  ELSE
    -- Create new record
    IF p_with_position THEN
      -- Calculate next timeline_frame
      -- But only consider items that haven't been manually positioned
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
        AND (sg.metadata->>'user_positioned' IS NULL AND sg.metadata->>'drag_source' IS NULL);
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
  END IF;
END;
$$;

COMMENT ON FUNCTION add_generation_to_shot IS 'Add a generation to a shot with optional timeline_frame positioning. Respects user-positioned items (with user_positioned or drag_source metadata) and auto-positions new items after them.';
