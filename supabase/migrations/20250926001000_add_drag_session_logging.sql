-- Add drag session ID logging to timeline update tracking
-- This creates a common log identifier that spans frontend and backend

-- Update the timeline update trigger to extract and log drag session IDs
CREATE OR REPLACE FUNCTION log_timeline_frame_updates()
RETURNS TRIGGER AS $$
DECLARE
    drag_session_id text;
BEGIN
    -- Extract drag session ID from metadata if present
    drag_session_id := COALESCE(
        NEW.metadata->>'drag_session_id',
        OLD.metadata->>'drag_session_id',
        'no-session'
    );

    -- Log every timeline_frame change
    INSERT INTO timeline_update_log (
        generation_id,
        shot_id,
        old_timeline_frame,
        new_timeline_frame,
        operation_type,
        call_source,
        metadata
    ) VALUES (
        COALESCE(NEW.generation_id, OLD.generation_id),
        COALESCE(NEW.shot_id, OLD.shot_id),
        OLD.timeline_frame,
        NEW.timeline_frame,
        TG_OP,
        CONCAT('trigger_', TG_NAME),
        jsonb_build_object(
            'trigger_name', TG_NAME,
            'table_name', TG_TABLE_NAME,
            'drag_session_id', drag_session_id
        )
    );
    
    -- Enhanced PostgreSQL log with drag session ID for immediate visibility
    RAISE LOG '[TimelineDragFlow] [DB_TRIGGER] 🎯 Session: % | %: generation_id=%, shot_id=%, timeline_frame: % -> %, metadata: %',
        drag_session_id,
        TG_OP,
        COALESCE(NEW.generation_id, OLD.generation_id),
        COALESCE(NEW.shot_id, OLD.shot_id),
        OLD.timeline_frame,
        NEW.timeline_frame,
        NEW.metadata;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Update add_generation_to_shot function to log with drag session ID if available
CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id UUID,
  p_generation_id UUID,
  p_with_position BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_record RECORD;
  next_position INTEGER := 0;
  result_message TEXT;
BEGIN
  -- Log the RPC call with any available drag session context
  RAISE LOG '[TimelineDragFlow] [DB_RPC] 🎯 Session: % | RPC add_generation_to_shot CALLED: shot_id=%, generation_id=%, with_position=%',
    COALESCE(current_setting('app.drag_session_id', true), 'no-session'),
    p_shot_id, p_generation_id, p_with_position;

  -- Insert log entry for tracking
  INSERT INTO timeline_update_log (
    generation_id,
    shot_id,
    operation_type,
    call_source,
    metadata
  ) VALUES (
    p_generation_id,
    p_shot_id,
    'RPC_add_generation_to_shot',
    'add_generation_to_shot',
    jsonb_build_object(
      'with_position', p_with_position,
      'drag_session_id', COALESCE(current_setting('app.drag_session_id', true), 'no-session')
    )
  );

  -- Check if the record already exists
  SELECT timeline_frame INTO existing_record
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id;

  IF FOUND THEN
    -- Record exists
    RAISE LOG '[TimelineDragFlow] [DB_RPC] Session: % | RPC add_generation_to_shot: existing record found, timeline_frame=%', 
      COALESCE(current_setting('app.drag_session_id', true), 'no-session'),
      existing_record.timeline_frame;
    
    IF p_with_position AND existing_record.timeline_frame IS NULL THEN
      -- Find the next available position after user-positioned items
      SELECT COALESCE(MAX(timeline_frame), -50) + 50
      INTO next_position
      FROM shot_generations
      WHERE shot_id = p_shot_id
        AND timeline_frame IS NOT NULL
        AND (metadata->>'user_positioned' IS NULL AND metadata->>'drag_source' IS NULL);

      -- Update the existing record with a position
      UPDATE shot_generations
      SET timeline_frame = next_position,
          updated_at = NOW()
      WHERE shot_id = p_shot_id AND generation_id = p_generation_id;

      result_message := 'Existing record updated with timeline_frame: ' || next_position;
    ELSE
      result_message := 'Record already exists with timeline_frame: ' || COALESCE(existing_record.timeline_frame::text, 'NULL');
    END IF;
  ELSE
    -- Record doesn't exist, create it
    IF p_with_position THEN
      -- Find the next available position after user-positioned items
      SELECT COALESCE(MAX(timeline_frame), -50) + 50
      INTO next_position
      FROM shot_generations
      WHERE shot_id = p_shot_id
        AND timeline_frame IS NOT NULL
        AND (metadata->>'user_positioned' IS NULL AND metadata->>'drag_source' IS NULL);
    ELSE
      -- Explicitly set to NULL for unpositioned items
      next_position := NULL;
    END IF;

    -- Insert new record
    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
    VALUES (p_shot_id, p_generation_id, next_position, '{}');

    IF p_with_position THEN
      result_message := 'New record created with timeline_frame: ' || next_position;
    ELSE
      result_message := 'New record created with timeline_frame: NULL (unpositioned)';
    END IF;
  END IF;

  RAISE LOG '[TimelineDragFlow] [DB_RPC] Session: % | RPC add_generation_to_shot COMPLETED: %',
    COALESCE(current_setting('app.drag_session_id', true), 'no-session'),
    result_message;

  RETURN jsonb_build_object('message', result_message, 'timeline_frame', next_position);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION add_generation_to_shot(uuid, uuid, boolean) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ DRAG SESSION LOGGING ENABLED';
    RAISE NOTICE 'Timeline operations now include drag session IDs in logs';
    RAISE NOTICE 'Use [TimelineDragFlow] tag to trace operations from frontend to backend';
END $$;
