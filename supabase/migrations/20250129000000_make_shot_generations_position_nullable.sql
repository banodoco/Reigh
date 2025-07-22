-- Make position column nullable in shot_generations table
-- This allows generations to be associated with a shot without having a specific position
ALTER TABLE shot_generations 
ALTER COLUMN position DROP NOT NULL;

-- Update the existing add_generation_to_shot RPC function to handle null positions
DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid);

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
  new_record record;
BEGIN
  IF p_with_position THEN
    -- Get the next position for this shot (with fully qualified column name)
    SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
  ELSE
    -- Set position to NULL for unpositioned associations
    next_pos := NULL;
  END IF;
  
  -- Insert the new shot_generation record
  INSERT INTO shot_generations (shot_id, generation_id, "position")
  VALUES (p_shot_id, p_generation_id, next_pos)
  RETURNING * INTO new_record;
  
  -- Return the inserted record (only columns that exist)
  RETURN QUERY SELECT 
    new_record.id,
    new_record.shot_id,
    new_record.generation_id,
    new_record."position";
END;
$$;

-- Add a function to associate a generation with a shot without position
CREATE OR REPLACE FUNCTION associate_generation_with_shot(
  p_shot_id UUID,
  p_generation_id UUID
) RETURNS UUID AS $$
DECLARE
  v_shot_generation_id UUID;
BEGIN
  -- Insert the new shot_generation entry with NULL position
  INSERT INTO shot_generations (shot_id, generation_id, "position")
  VALUES (p_shot_id, p_generation_id, NULL)
  RETURNING id INTO v_shot_generation_id;
  
  RETURN v_shot_generation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 