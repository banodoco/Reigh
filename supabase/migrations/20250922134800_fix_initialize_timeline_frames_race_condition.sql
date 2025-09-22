-- Fix race condition in initialize_timeline_frames_for_shot function
-- Add advisory locking to prevent concurrent initialization attempts

CREATE OR REPLACE FUNCTION initialize_timeline_frames_for_shot(
  p_shot_id uuid,
  p_frame_spacing integer DEFAULT 60
)
RETURNS integer AS $$
DECLARE
  record_count integer := 0;
BEGIN
  -- Acquire advisory lock for this shot to prevent concurrent initialization
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));
  
  -- Check if initialization is needed first
  IF NOT EXISTS (
    SELECT 1 FROM shot_generations 
    WHERE shot_id = p_shot_id AND timeline_frame IS NULL
  ) THEN
    RAISE LOG 'No timeline frames need initialization for shot %', p_shot_id;
    RETURN 0;
  END IF;

  -- Update existing records that don't have timeline_frame set
  -- Use a more robust approach to avoid conflicts
  UPDATE shot_generations 
  SET 
    timeline_frame = position * p_frame_spacing,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('frame_spacing', p_frame_spacing, 'auto_initialized', true),
    updated_at = NOW()
  WHERE shot_id = p_shot_id 
    AND timeline_frame IS NULL
    AND NOT EXISTS (
      -- Double-check no other record already has this timeline_frame value
      SELECT 1 FROM shot_generations sg2 
      WHERE sg2.shot_id = p_shot_id 
      AND sg2.timeline_frame = shot_generations.position * p_frame_spacing
      AND sg2.id != shot_generations.id
    );
  
  GET DIAGNOSTICS record_count = ROW_COUNT;
  
  RAISE LOG 'Initialized timeline frames for % records in shot %', record_count, p_shot_id;
  RETURN record_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION initialize_timeline_frames_for_shot(uuid, integer) TO authenticated;

-- Verify the fix
SELECT 'Fixed race condition in initialize_timeline_frames_for_shot function' as status;
