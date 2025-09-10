-- Fix add_generation_to_shot to handle ALL existing records, not just NULL positioned ones
-- This prevents duplicate shot_generation records

DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid);
DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id uuid,
  p_generation_id uuid,
  p_with_position boolean DEFAULT true
)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, "position" integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  existing_record record;
  new_record record;
BEGIN
  -- First, check if ANY record exists for this shot-generation combo
  SELECT sg.id, sg."position" INTO existing_record
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id
  LIMIT 1;
  
  IF existing_record.id IS NOT NULL THEN
    -- Record already exists
    IF p_with_position AND existing_record."position" IS NULL THEN
      -- Existing record has no position, assign one
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      -- Update the existing record's position
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_record.id
      RETURNING * INTO new_record;
    ELSE
      -- Return existing record as-is (either it has position or we don't want position)
      SELECT sg.* INTO new_record
      FROM shot_generations sg
      WHERE sg.id = existing_record.id;
    END IF;
  ELSE
    -- No existing record, create new one
    IF p_with_position THEN
      -- Get the next position for this shot
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    ELSE
      -- Set position to NULL for unpositioned associations
      next_pos := NULL;
    END IF;
    
    -- Insert new record
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, next_pos)
    RETURNING * INTO new_record;
  END IF;
  
  -- Return the record (either existing or new)
  RETURN QUERY SELECT 
    new_record.id,
    new_record.shot_id,
    new_record.generation_id,
    new_record."position";
END;
$$;
