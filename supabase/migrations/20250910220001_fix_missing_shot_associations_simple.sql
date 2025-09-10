-- Fix remaining missing shot associations for travel-between-images videos
-- This is a simpler version that avoids the ON CONFLICT issue

DO $$
DECLARE
    missing_record RECORD;
    extracted_shot_id uuid;
    association_count integer := 0;
    association_exists boolean;
BEGIN
    RAISE NOTICE 'Starting comprehensive check for missing shot associations...';
    
    -- Find generations that:
    -- 1. Are video types from travel-between-images tool
    -- 2. Have shot_id in their params
    -- 3. Are NOT already associated with any shot
    FOR missing_record IN 
        SELECT 
            g.id as generation_id,
            g.params,
            g.created_at,
            -- Try to extract shot_id from different possible locations in params
            COALESCE(
                (g.params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid,
                (g.params->>'shot_id')::uuid,
                (g.params->'full_orchestrator_payload'->>'shot_id')::uuid
            ) as extracted_shot_id
        FROM generations g
        LEFT JOIN shot_generations sg ON g.id = sg.generation_id
        WHERE 
            g.type LIKE '%video%'
            AND (
                g.params->'originalParams'->'orchestrator_details'->>'shot_id' IS NOT NULL
                OR g.params->>'shot_id' IS NOT NULL
                OR g.params->'full_orchestrator_payload'->>'shot_id' IS NOT NULL
            )
            AND sg.generation_id IS NULL  -- Not already associated
            AND g.created_at >= '2025-09-01'  -- Only recent generations
    LOOP
        extracted_shot_id := missing_record.extracted_shot_id;
        
        -- Verify the shot exists and no association exists before creating
        IF extracted_shot_id IS NOT NULL AND EXISTS(SELECT 1 FROM shots WHERE id = extracted_shot_id) THEN
            -- Check if association already exists (double-check)
            SELECT EXISTS(
                SELECT 1 FROM shot_generations 
                WHERE shot_generations.shot_id = extracted_shot_id 
                  AND shot_generations.generation_id = missing_record.generation_id
            ) INTO association_exists;
            
            IF NOT association_exists THEN
                INSERT INTO shot_generations (shot_id, generation_id, position)
                VALUES (extracted_shot_id, missing_record.generation_id, NULL);
                
                association_count := association_count + 1;
                RAISE NOTICE 'Created association for generation % with shot %', 
                    missing_record.generation_id, extracted_shot_id;
            END IF;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Completed: Created % missing shot associations', association_count;
END $$;

-- Add a function to help prevent this issue in the future
-- This function can be called when a generation is created to ensure proper shot linking
CREATE OR REPLACE FUNCTION ensure_shot_association_from_params(
    p_generation_id uuid,
    p_params jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Add comment explaining the purpose
COMMENT ON FUNCTION ensure_shot_association_from_params IS 
'Ensures a generation is properly associated with a shot based on params. Returns true if association exists or was created.';
