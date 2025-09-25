-- Add comprehensive logging to track ALL timeline_frame updates
-- This will help us definitively identify what's causing the reverts

-- Create a logging table for timeline updates
CREATE TABLE IF NOT EXISTS timeline_update_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id uuid NOT NULL,
    shot_id uuid,
    old_timeline_frame integer,
    new_timeline_frame integer,
    operation_type text NOT NULL, -- 'UPDATE', 'RPC_add_generation_to_shot', 'RPC_apply_timeline_frames', etc.
    call_source text, -- Function name or trigger name
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Create a trigger to log ALL updates to timeline_frame
CREATE OR REPLACE FUNCTION log_timeline_frame_updates()
RETURNS TRIGGER AS $$
BEGIN
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
        'shot_generations_trigger',
        jsonb_build_object(
            'old_metadata', OLD.metadata,
            'new_metadata', NEW.metadata,
            'trigger_name', TG_NAME,
            'table_name', TG_TABLE_NAME
        )
    );
    
    -- Also log to PostgreSQL logs for immediate visibility
    RAISE LOG '[TimelineUpdateTracker] %: generation_id=%, shot_id=%, timeline_frame: % -> %, metadata: %',
        TG_OP,
        COALESCE(NEW.generation_id, OLD.generation_id),
        COALESCE(NEW.shot_id, OLD.shot_id),
        OLD.timeline_frame,
        NEW.timeline_frame,
        NEW.metadata;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS log_timeline_updates_trigger ON shot_generations;
CREATE TRIGGER log_timeline_updates_trigger
    AFTER INSERT OR UPDATE OR DELETE ON shot_generations
    FOR EACH ROW
    EXECUTE FUNCTION log_timeline_frame_updates();

-- Modify add_generation_to_shot to log its operations
CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id UUID,
  p_generation_id UUID,
  p_with_position BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  id UUID,
  shot_id UUID,
  generation_id UUID,
  timeline_frame INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  next_frame integer;
  existing_record record;
  new_record record;
BEGIN
  -- Log the RPC call
  RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot CALLED: shot_id=%, generation_id=%, with_position=%',
    p_shot_id, p_generation_id, p_with_position;

  INSERT INTO timeline_update_log (
    generation_id,
    shot_id,
    operation_type,
    call_source,
    metadata
  ) VALUES (
    p_generation_id,
    p_shot_id,
    'RPC_CALL_START',
    'add_generation_to_shot',
    jsonb_build_object('with_position', p_with_position)
  );

  -- Check if this generation is already associated with this shot
  SELECT sg.id, sg.timeline_frame 
  INTO existing_record
  FROM shot_generations sg 
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id
  LIMIT 1;

  IF FOUND THEN
    -- Record exists
    RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot: existing record found, timeline_frame=%', existing_record.timeline_frame;
    
    IF p_with_position AND existing_record.timeline_frame IS NULL THEN
      -- Need to assign timeline_frame to existing record
      -- But only calculate next frame for items that haven't been manually positioned
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
        AND (sg.metadata->>'user_positioned' IS NULL AND sg.metadata->>'drag_source' IS NULL);
      
      RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot: assigning timeline_frame=% to existing record', next_frame;
      
      UPDATE shot_generations
      SET timeline_frame = next_frame,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('auto_positioned', true)
      WHERE id = existing_record.id;
      
      -- Return updated record
      SELECT sg.id, sg.shot_id, sg.generation_id, sg.timeline_frame
      INTO new_record
      FROM shot_generations sg
      WHERE sg.id = existing_record.id;
      
      RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
    ELSE
      -- Return existing record as-is
      RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot: returning existing record unchanged';
      RETURN QUERY SELECT existing_record.id, p_shot_id, p_generation_id, existing_record.timeline_frame;
    END IF;
  ELSE
    -- Create new record
    IF p_with_position THEN
      -- Calculate next timeline_frame
      -- But only consider items that haven't been manually positioned
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
        AND (sg.metadata->>'user_positioned' IS NULL AND sg.metadata->>'drag_source' IS NULL);
      
      RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot: creating new record with timeline_frame=%', next_frame;
    ELSE
      -- No timeline_frame (unpositioned)
      next_frame := NULL;
      RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot: creating new record without position';
    END IF;
    
    -- Insert new record
    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
    VALUES (p_shot_id, p_generation_id, next_frame,
            CASE WHEN p_with_position THEN jsonb_build_object('auto_positioned', true) ELSE '{}'::jsonb END)
    RETURNING shot_generations.id, shot_generations.shot_id, shot_generations.generation_id, shot_generations.timeline_frame
    INTO new_record;
    
    RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
  END IF;
  
  -- Log completion
  RAISE LOG '[TimelineUpdateTracker] RPC add_generation_to_shot COMPLETED';
END;
$$;

-- Create a function to query recent timeline updates
CREATE OR REPLACE FUNCTION get_recent_timeline_updates(p_generation_id uuid DEFAULT NULL, p_minutes integer DEFAULT 5)
RETURNS TABLE(
    log_id uuid,
    generation_id uuid,
    shot_id uuid,
    old_frame integer,
    new_frame integer,
    operation_type text,
    call_source text,
    created_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tul.id,
        tul.generation_id,
        tul.shot_id,
        tul.old_timeline_frame,
        tul.new_timeline_frame,
        tul.operation_type,
        tul.call_source,
        tul.created_at
    FROM timeline_update_log tul
    WHERE (p_generation_id IS NULL OR tul.generation_id = p_generation_id)
      AND tul.created_at >= NOW() - INTERVAL '1 minute' * p_minutes
    ORDER BY tul.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON timeline_update_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_timeline_updates(uuid, integer) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ ADDED: Comprehensive timeline update logging';
    RAISE NOTICE 'Use get_recent_timeline_updates() to see what is modifying timeline positions';
    RAISE NOTICE 'Check PostgreSQL logs for real-time timeline_frame changes';
END $$;
