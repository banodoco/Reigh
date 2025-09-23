-- Fix for timeline position reset issue
-- This migration updates the update_single_timeline_frame function to properly preserve user_positioned metadata
-- and ensures that drag operations are not overridden by cleanup migrations

-- Update the RPC function to properly handle metadata preservation
CREATE OR REPLACE FUNCTION update_single_timeline_frame(p_generation_id uuid, p_new_timeline_frame integer, p_metadata jsonb)
RETURNS setof shot_generations AS $$
DECLARE
    v_shot_id uuid;
    v_current_metadata jsonb;
BEGIN
    -- Find the shot_id from the generation_id
    SELECT shot_id, metadata INTO v_shot_id, v_current_metadata
    FROM shot_generations WHERE generation_id = p_generation_id LIMIT 1;

    IF v_shot_id IS NULL THEN
        RAISE EXCEPTION 'Generation ID not found: %', p_generation_id;
    END IF;

    -- Preserve existing user_positioned status and merge new metadata
    -- If item was already user_positioned, keep it that way
    -- If item is being positioned by user (drag operation), set user_positioned=true
    UPDATE shot_generations
    SET
        timeline_frame = p_new_timeline_frame,
        metadata = jsonb_build_object(
            'user_positioned', COALESCE(
                (v_current_metadata->>'user_positioned')::boolean,
                (p_metadata->>'user_positioned')::boolean,
                (p_metadata->>'drag_source') IS NOT NULL
            ),
            'drag_source', COALESCE(
                v_current_metadata->>'drag_source',
                p_metadata->>'drag_source'
            ),
            'auto_positioned', COALESCE(
                v_current_metadata->>'auto_positioned',
                false
            )
        ) || p_metadata -- Merge any additional metadata
    WHERE generation_id = p_generation_id AND shot_id = v_shot_id;

    -- Log the update for debugging
    RAISE LOG 'update_single_timeline_frame: generation_id=%, timeline_frame=%->%, user_positioned=%',
        p_generation_id,
        v_current_metadata->>'timeline_frame',
        p_new_timeline_frame,
        COALESCE(
            (v_current_metadata->>'user_positioned')::boolean,
            (p_metadata->>'user_positioned')::boolean,
            (p_metadata->>'drag_source') IS NOT NULL
        );

    RETURN QUERY
        SELECT * FROM shot_generations WHERE generation_id = p_generation_id AND shot_id = v_shot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_single_timeline_frame(uuid, integer, jsonb) TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_single_timeline_frame IS 'Updates a single timeline frame with proper metadata handling. Preserves user_positioned status and prevents override by cleanup migrations.';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Fixed timeline position reset issue - update_single_timeline_frame now properly preserves user_positioned metadata';
END $$;
