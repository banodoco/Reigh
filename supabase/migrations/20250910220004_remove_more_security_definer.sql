-- Remove SECURITY DEFINER from additional functions that could cause authorization issues

-- Fix create_shot_with_image - remove SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_shot_with_image(
  p_project_id UUID,
  p_shot_name TEXT,
  p_generation_id UUID
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_generation_id UUID,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
  v_next_position INTEGER;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with position 1
  INSERT INTO shot_generations (shot_id, generation_id, position)
  VALUES (v_shot_id, p_generation_id, 1)
  RETURNING id INTO v_shot_generation_id;
  
  -- Return the results
  RETURN QUERY SELECT 
    v_shot_id,
    p_shot_name,
    v_shot_generation_id,
    TRUE;
    
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN QUERY SELECT 
    NULL::UUID,
    NULL::TEXT,
    NULL::UUID,
    FALSE;
END;
-- REMOVED SECURITY DEFINER - function runs with caller's privileges
$$ LANGUAGE plpgsql;

-- Fix ensure_shot_association_from_params - remove SECURITY DEFINER  
CREATE OR REPLACE FUNCTION ensure_shot_association_from_params(
    p_generation_id uuid,
    p_params jsonb
)
RETURNS boolean
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER - function runs with caller's privileges
AS $$
DECLARE
    extracted_shot_id uuid;
    shot_exists boolean := false;
    association_exists boolean := false;
BEGIN
    -- Try to extract shot_id from various locations in params
    extracted_shot_id := COALESCE(
        (p_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid,
        (p_params->>'shot_id')::uuid,
        (p_params->'full_orchestrator_payload'->>'shot_id')::uuid
    );
    
    -- If no shot_id found, return false
    IF extracted_shot_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if shot exists
    SELECT EXISTS(SELECT 1 FROM shots WHERE id = extracted_shot_id) INTO shot_exists;
    
    -- Check if association already exists
    SELECT EXISTS(
        SELECT 1 FROM shot_generations 
        WHERE shot_generations.shot_id = extracted_shot_id AND shot_generations.generation_id = p_generation_id
    ) INTO association_exists;
    
    -- Create association if shot exists and no association exists
    IF shot_exists AND NOT association_exists THEN
        INSERT INTO shot_generations (shot_id, generation_id, position)
        VALUES (extracted_shot_id, p_generation_id, NULL);
        
        RETURN true;
    END IF;
    
    RETURN association_exists;
END;
$$;

-- Add comments explaining the changes
COMMENT ON FUNCTION create_shot_with_image IS 
'Removed SECURITY DEFINER to run with caller privileges and avoid RLS conflicts';

COMMENT ON FUNCTION ensure_shot_association_from_params IS 
'Removed SECURITY DEFINER to run with caller privileges and avoid RLS conflicts';
