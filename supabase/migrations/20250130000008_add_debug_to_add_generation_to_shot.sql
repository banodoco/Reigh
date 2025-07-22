-- Add debug notices to add_generation_to_shot for troubleshooting
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
  result_record record;
BEGIN
  RAISE NOTICE '[AddGenerationToShotDebug] Called with shot_id: %, generation_id: %, with_position: %', p_shot_id, p_generation_id, p_with_position;
  
  IF p_with_position THEN
    SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    
    RAISE NOTICE '[AddGenerationToShotDebug] Calculated next_pos: %', next_pos;
    
    SELECT * INTO existing_record
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id 
      AND shot_generations.generation_id = p_generation_id 
      AND shot_generations."position" IS NULL
    LIMIT 1;
    
    IF existing_record IS NOT NULL THEN
      RAISE NOTICE '[AddGenerationToShotDebug] Found existing record with NULL position: id=%', existing_record.id;
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_record.id
      RETURNING * INTO result_record;
      RAISE NOTICE '[AddGenerationToShotDebug] Updated position to %', next_pos;
    ELSE
      RAISE NOTICE '[AddGenerationToShotDebug] No existing NULL position record found, inserting new';
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO result_record;
      RAISE NOTICE '[AddGenerationToShotDebug] Inserted new record with id=%, position=%', result_record.id, result_record."position";
    END IF;
  ELSE
    RAISE NOTICE '[AddGenerationToShotDebug] with_position=false, inserting with NULL position';
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, NULL)
    RETURNING * INTO result_record;
    RAISE NOTICE '[AddGenerationToShotDebug] Inserted new record with id=%, position=NULL', result_record.id;
  END IF;
  
  RAISE NOTICE '[AddGenerationToShotDebug] Returning record: id=%, position=%', result_record.id, result_record."position";
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$; 