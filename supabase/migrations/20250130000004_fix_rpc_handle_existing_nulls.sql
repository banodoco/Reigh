-- Fix add_generation_to_shot to handle existing records with null positions
DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid);

CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id uuid,
  p_generation_id uuid
)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, "position" integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  existing_id uuid;
  existing_pos integer;
BEGIN
  -- Check if record already exists
  SELECT sg.id, sg."position" 
  INTO existing_id, existing_pos
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id 
  AND sg.generation_id = p_generation_id;
  
  IF existing_id IS NOT NULL THEN
    -- Record exists
    IF existing_pos IS NULL THEN
      -- It exists but has no position, so assign one
      SELECT COALESCE(MAX(sg."position") + 1, 0) INTO next_pos
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id 
      AND sg."position" IS NOT NULL;
      
      -- Update with position
      UPDATE shot_generations 
      SET "position" = next_pos
      WHERE id = existing_id;
    END IF;
    
    -- Return the existing record (now with position)
    RETURN QUERY 
    SELECT sg.id, sg.shot_id, sg.generation_id, sg."position"
    FROM shot_generations sg
    WHERE sg.id = existing_id;
  ELSE
    -- No existing record, create new one
    SELECT COALESCE(MAX(sg."position") + 1, 0) INTO next_pos
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id;
    
    -- Insert and return
    RETURN QUERY
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, next_pos)
    RETURNING id, shot_id, generation_id, "position";
  END IF;
END;
$$; 