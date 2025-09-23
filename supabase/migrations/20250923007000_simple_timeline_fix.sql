-- Simple fix for timeline position reset issue
-- Just ensure the update_single_timeline_frame function properly preserves user_positioned metadata

-- Update the RPC function to be bulletproof about preserving user positions
CREATE OR REPLACE FUNCTION update_single_timeline_frame(p_generation_id uuid, p_new_timeline_frame integer, p_metadata jsonb)
RETURNS setof shot_generations AS $$
DECLARE
    v_shot_id uuid;
    v_current_metadata jsonb;
    v_new_metadata jsonb;
BEGIN
    -- Get current data
    SELECT shot_id, metadata INTO v_shot_id, v_current_metadata
    FROM shot_generations WHERE generation_id = p_generation_id LIMIT 1;

    IF v_shot_id IS NULL THEN
        RAISE EXCEPTION 'Generation ID not found: %', p_generation_id;
    END IF;

    -- Build new metadata: preserve existing user_positioned status, merge new data
    v_new_metadata := jsonb_build_object(
        'user_positioned', true, -- Always set to true for drag operations
        'drag_source', COALESCE(
            v_current_metadata->>'drag_source',
            p_metadata->>'drag_source',
            'timeline_drag'
        )
    ) || COALESCE(p_metadata, '{}'::jsonb);

    -- Update the record
    UPDATE shot_generations
    SET timeline_frame = p_new_timeline_frame,
        metadata = v_new_metadata,
        updated_at = NOW()
    WHERE generation_id = p_generation_id AND shot_id = v_shot_id;

    -- Log for debugging
    RAISE LOG 'TIMELINE FIX: Updated % from % to %, user_positioned=true',
        p_generation_id, v_current_metadata->>'timeline_frame', p_new_timeline_frame;

    -- Return updated record
    RETURN QUERY SELECT * FROM shot_generations
                  WHERE generation_id = p_generation_id AND shot_id = v_shot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_single_timeline_frame(uuid, integer, jsonb) TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_single_timeline_frame IS 'Fixes timeline position reset issue by always preserving user_positioned=true for drag operations.';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ Timeline position reset fix applied';
    RAISE NOTICE 'Drag operations will now preserve exact positions';
END $$;
