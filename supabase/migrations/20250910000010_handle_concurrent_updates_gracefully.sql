-- Make add_generation_to_shot more resilient to concurrent updates
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
  result_record record;
  retry_count integer := 0;
  max_retries integer := 3;
BEGIN
  -- Retry loop to handle concurrent updates
  LOOP
    BEGIN
      IF p_with_position THEN
        -- Calculate next position once, upfront
        SELECT COALESCE(MAX(sg."position") + 1, 0) INTO next_pos
        FROM shot_generations sg
        WHERE sg.shot_id = p_shot_id AND sg."position" IS NOT NULL;
        
        -- Try to update existing NULL position record first (single query)
        UPDATE shot_generations
        SET "position" = next_pos
        WHERE shot_generations.shot_id = p_shot_id 
          AND shot_generations.generation_id = p_generation_id 
          AND shot_generations."position" IS NULL
        RETURNING * INTO result_record;
        
        -- If no record was updated (FOUND is false), insert new one
        IF NOT FOUND THEN
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
      
      -- If we get here, operation succeeded
      EXIT;
      
    EXCEPTION
      WHEN serialization_failure OR deadlock_detected THEN
        -- Handle concurrent update conflicts
        retry_count := retry_count + 1;
        IF retry_count >= max_retries THEN
          RAISE EXCEPTION 'Failed to add generation to shot after % retries due to concurrent updates', max_retries;
        END IF;
        
        -- Wait a small random amount before retrying
        PERFORM pg_sleep(random() * 0.1);
        
      WHEN unique_violation THEN
        -- Handle duplicate key violations (record already exists)
        -- Try to find and return the existing record
        SELECT sg.* INTO result_record
        FROM shot_generations sg
        WHERE sg.shot_id = p_shot_id 
          AND sg.generation_id = p_generation_id
        LIMIT 1;
        
        IF result_record.id IS NOT NULL THEN
          EXIT; -- Return the existing record
        ELSE
          RAISE; -- Re-raise if we can't find the existing record
        END IF;
    END;
  END LOOP;
  
  -- Return the record
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$;
