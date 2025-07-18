-- Fix RPC function to only return columns that exist in shot_generations table
-- Remove created_at since it doesn't exist in shot_generations

-- Drop the existing function first since we're changing the return type
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
  new_record record;
BEGIN
  -- Get the next position for this shot (with fully qualified column name)
  SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
  FROM shot_generations
  WHERE shot_generations.shot_id = p_shot_id;
  
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