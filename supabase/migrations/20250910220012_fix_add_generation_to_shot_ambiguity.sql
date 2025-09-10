-- Fix ambiguous column references in add_generation_to_shot function
-- The issue is that shot_id and generation_id appear as both parameters and column names

CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id UUID,
  p_generation_id UUID,
  p_with_position BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  id UUID,
  shot_id UUID,
  generation_id UUID,
  "position" INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  next_pos integer;
  result_record record;
BEGIN
  IF p_with_position THEN
    -- Calculate next position once, upfront
    SELECT COALESCE(MAX(sg."position") + 1, 0) INTO next_pos
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id AND sg."position" IS NOT NULL;
    
    -- Try to update existing NULL position record first (single query)
    -- FIX: Fully qualify column names to avoid ambiguity
    UPDATE shot_generations
    SET "position" = next_pos
    WHERE shot_generations.shot_id = p_shot_id 
      AND shot_generations.generation_id = p_generation_id 
      AND shot_generations."position" IS NULL
    RETURNING * INTO result_record;
    
    -- If no record was updated, insert new one
    IF result_record.id IS NULL THEN
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO result_record;
    END IF;
  ELSE
    -- For unpositioned, always insert (no need to check)
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, NULL)
    RETURNING * INTO result_record;
  END IF;
  
  -- Return the record
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$;

-- Add comment explaining the fix
COMMENT ON FUNCTION add_generation_to_shot IS 
'Fixed ambiguous column references by fully qualifying shot_generations.shot_id and shot_generations.generation_id in UPDATE WHERE clause';
