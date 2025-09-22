-- Fix ensure_shot_association_from_params to use timeline_frame instead of position
-- This function is used by database triggers

DROP FUNCTION IF EXISTS ensure_shot_association_from_params(uuid, jsonb);

CREATE OR REPLACE FUNCTION ensure_shot_association_from_params(
    p_generation_id uuid,
    p_params jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    shot_exists boolean;
    association_exists boolean;
    extracted_shot_id uuid;
BEGIN
    -- Extract shot_id from params (same as before)
    extracted_shot_id := COALESCE(
        (p_params->>'shot_id')::uuid,
        (p_params->'originalParams'->>'shot_id')::uuid,
        (p_params->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'originalParams'->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'orchestrator_details'->>'shot_id')::uuid,
        (p_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid
    );
    
    -- Return false if no shot_id found
    IF extracted_shot_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if shot exists
    SELECT EXISTS (
        SELECT 1 FROM shots WHERE id = extracted_shot_id
    ) INTO shot_exists;
    
    -- Check if association already exists
    SELECT EXISTS (
        SELECT 1 FROM shot_generations 
        WHERE shot_id = extracted_shot_id AND generation_id = p_generation_id
    ) INTO association_exists;
    
    -- Create association if shot exists and no association exists
    IF shot_exists AND NOT association_exists THEN
        -- Insert without timeline_frame (unpositioned by default)
        INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
        VALUES (extracted_shot_id, p_generation_id, NULL);
        
        RETURN true;
    END IF;
    
    RETURN association_exists;
END;
$$;

COMMENT ON FUNCTION ensure_shot_association_from_params IS 
'Updated to use timeline_frame instead of position column. Creates unpositioned associations by default.';
