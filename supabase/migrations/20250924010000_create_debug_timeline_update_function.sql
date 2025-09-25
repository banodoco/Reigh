-- Create a comprehensive debug function for timeline updates
-- This will tell us exactly what's happening during updates

CREATE OR REPLACE FUNCTION debug_timeline_update(
    p_shot_id uuid,
    p_generation_id uuid,
    p_new_timeline_frame integer,
    p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_before_record record;
    v_after_record record;
    v_update_result record;
    v_rows_affected integer;
    v_debug_info jsonb;
    v_constraints_info jsonb;
    v_triggers_info jsonb;
    v_rls_info jsonb;
    v_permissions_info jsonb;
BEGIN
    -- Step 1: Capture the current state before any update attempt
    SELECT 
        id, timeline_frame, metadata, updated_at, created_at
    INTO v_before_record
    FROM shot_generations 
    WHERE shot_id = p_shot_id AND generation_id = p_generation_id;

    -- Step 2: Check if the record exists
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RECORD_NOT_FOUND',
            'message', 'No shot_generations record found for the given shot_id and generation_id',
            'shot_id', p_shot_id,
            'generation_id', p_generation_id,
            'search_performed', true,
            'timestamp', NOW()
        );
    END IF;

    -- Step 3: Check current user permissions
    SELECT jsonb_build_object(
        'current_user', current_user,
        'current_role', current_setting('role'),
        'session_user', session_user
    ) INTO v_permissions_info;

    -- Step 4: Check for any constraints that might block the update
    SELECT jsonb_agg(
        jsonb_build_object(
            'constraint_name', conname,
            'constraint_type', contype,
            'is_deferrable', condeferrable,
            'initially_deferred', condeferred
        )
    ) INTO v_constraints_info
    FROM pg_constraint 
    WHERE conrelid = 'shot_generations'::regclass;

    -- Step 5: Check for triggers on the table
    SELECT jsonb_agg(
        jsonb_build_object(
            'trigger_name', tgname,
            'trigger_when', CASE tgtype & 2 WHEN 0 THEN 'AFTER' ELSE 'BEFORE' END,
            'trigger_event', CASE 
                WHEN tgtype & 4 != 0 THEN 'INSERT'
                WHEN tgtype & 8 != 0 THEN 'DELETE'
                WHEN tgtype & 16 != 0 THEN 'UPDATE'
                ELSE 'UNKNOWN'
            END,
            'trigger_enabled', tgenabled = 'O'
        )
    ) INTO v_triggers_info
    FROM pg_trigger 
    WHERE tgrelid = 'shot_generations'::regclass AND NOT tgisinternal;

    -- Step 6: Attempt the update with detailed logging
    RAISE LOG '[DEBUG_TIMELINE_UPDATE] Attempting update: shot_id=%, generation_id=%, old_frame=%, new_frame=%, old_updated_at=%', 
        p_shot_id, p_generation_id, v_before_record.timeline_frame, p_new_timeline_frame, v_before_record.updated_at;

    -- Perform the actual update
    UPDATE shot_generations 
    SET 
        timeline_frame = p_new_timeline_frame,
        metadata = COALESCE(p_metadata, metadata),
        updated_at = NOW()  -- Explicitly set updated_at
    WHERE shot_id = p_shot_id AND generation_id = p_generation_id;

    -- Get the number of affected rows
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    RAISE LOG '[DEBUG_TIMELINE_UPDATE] Update completed: rows_affected=%', v_rows_affected;

    -- Step 7: Capture the state after the update attempt
    SELECT 
        id, timeline_frame, metadata, updated_at, created_at
    INTO v_after_record
    FROM shot_generations 
    WHERE shot_id = p_shot_id AND generation_id = p_generation_id;

    -- Step 8: Analyze what actually happened
    v_debug_info := jsonb_build_object(
        'success', true,
        'operation', 'UPDATE_ATTEMPTED',
        'rows_affected', v_rows_affected,
        'before_state', jsonb_build_object(
            'id', v_before_record.id,
            'timeline_frame', v_before_record.timeline_frame,
            'metadata', v_before_record.metadata,
            'updated_at', v_before_record.updated_at,
            'created_at', v_before_record.created_at
        ),
        'after_state', jsonb_build_object(
            'id', v_after_record.id,
            'timeline_frame', v_after_record.timeline_frame,
            'metadata', v_after_record.metadata,
            'updated_at', v_after_record.updated_at,
            'created_at', v_after_record.created_at
        ),
        'requested_changes', jsonb_build_object(
            'new_timeline_frame', p_new_timeline_frame,
            'new_metadata', p_metadata
        ),
        'analysis', jsonb_build_object(
            'timeline_frame_changed', v_after_record.timeline_frame != v_before_record.timeline_frame,
            'timeline_frame_correct', v_after_record.timeline_frame = p_new_timeline_frame,
            'updated_at_changed', v_after_record.updated_at != v_before_record.updated_at,
            'metadata_changed', v_after_record.metadata != v_before_record.metadata,
            'update_actually_executed', v_rows_affected > 0 AND v_after_record.updated_at != v_before_record.updated_at
        ),
        'database_info', jsonb_build_object(
            'constraints', v_constraints_info,
            'triggers', v_triggers_info,
            'permissions', v_permissions_info
        ),
        'timestamp', NOW()
    );

    -- Step 9: Log detailed results
    RAISE LOG '[DEBUG_TIMELINE_UPDATE] Analysis complete: update_executed=%, frame_correct=%, updated_at_changed=%',
        (v_rows_affected > 0 AND v_after_record.updated_at != v_before_record.updated_at),
        (v_after_record.timeline_frame = p_new_timeline_frame),
        (v_after_record.updated_at != v_before_record.updated_at);

    RETURN v_debug_info;

EXCEPTION
    WHEN OTHERS THEN
        -- Capture any errors that occur during the update
        RAISE LOG '[DEBUG_TIMELINE_UPDATE] ERROR: %', SQLERRM;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UPDATE_EXCEPTION',
            'message', SQLERRM,
            'sqlstate', SQLSTATE,
            'shot_id', p_shot_id,
            'generation_id', p_generation_id,
            'requested_frame', p_new_timeline_frame,
            'before_state', CASE 
                WHEN v_before_record.id IS NOT NULL THEN
                    jsonb_build_object(
                        'timeline_frame', v_before_record.timeline_frame,
                        'updated_at', v_before_record.updated_at
                    )
                ELSE NULL
            END,
            'database_info', jsonb_build_object(
                'constraints', v_constraints_info,
                'triggers', v_triggers_info,
                'permissions', v_permissions_info
            ),
            'timestamp', NOW()
        );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION debug_timeline_update(uuid, uuid, integer, jsonb) TO authenticated;

-- Create a simpler wrapper function that matches the current interface
CREATE OR REPLACE FUNCTION update_timeline_frame_debug(
    p_shot_id uuid,
    p_generation_id uuid,
    p_new_timeline_frame integer,
    p_metadata jsonb DEFAULT jsonb_build_object('user_positioned', true, 'drag_source', 'timeline_drag')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Call the debug function and return the results
    RETURN debug_timeline_update(p_shot_id, p_generation_id, p_new_timeline_frame, p_metadata);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_timeline_frame_debug(uuid, uuid, integer, jsonb) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ CREATED: debug_timeline_update() function';
    RAISE NOTICE 'This function will provide detailed analysis of what happens during timeline updates';
    RAISE NOTICE 'Use: SELECT debug_timeline_update(shot_id, generation_id, new_frame, metadata);';
    RAISE NOTICE 'Or use the wrapper: SELECT update_timeline_frame_debug(shot_id, generation_id, new_frame);';
END $$;
