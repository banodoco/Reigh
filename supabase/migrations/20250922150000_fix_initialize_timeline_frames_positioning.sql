-- Fix initialize_timeline_frames_for_shot to use max existing frame + 50 instead of position * frame_spacing
-- This prevents new items from jumping really far ahead on the timeline

CREATE OR REPLACE FUNCTION initialize_timeline_frames_for_shot(
  p_shot_id uuid,
  p_frame_spacing integer DEFAULT 60
)
RETURNS integer AS $$
DECLARE
  record_count integer := 0;
  max_existing_frame integer := 0;
  next_frame integer := 50; -- Default starting frame if no existing frames
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

  -- Find the maximum existing timeline frame for this shot
  SELECT COALESCE(MAX(timeline_frame), 0) INTO max_existing_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND timeline_frame IS NOT NULL;

  -- Set starting frame to max existing + 50, or 50 if no existing frames
  next_frame := GREATEST(max_existing_frame + 50, 50);

  RAISE LOG 'Initializing timeline frames for shot %, max existing frame: %, starting at frame: %', 
    p_shot_id, max_existing_frame, next_frame;

  -- Update existing records that don't have timeline_frame set
  -- Use a sequential approach: order by position, then assign frames incrementally
  WITH ordered_items AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, created_at ASC) - 1 as item_index
    FROM shot_generations
    WHERE shot_id = p_shot_id AND timeline_frame IS NULL
  )
  UPDATE shot_generations
  SET
    timeline_frame = next_frame + (ordered_items.item_index * p_frame_spacing),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'frame_spacing', p_frame_spacing, 
      'auto_initialized', true,
      'max_existing_frame', max_existing_frame
    ),
    updated_at = NOW()
  FROM ordered_items
  WHERE shot_generations.id = ordered_items.id;

  GET DIAGNOSTICS record_count = ROW_COUNT;

  RAISE LOG 'Initialized timeline frames for % records in shot %, starting from frame %', 
    record_count, p_shot_id, next_frame;
  
  RETURN record_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION initialize_timeline_frames_for_shot(uuid, integer) TO authenticated;

-- Verify the fix
SELECT 'Fixed initialize_timeline_frames_for_shot to use max existing frame + 50 instead of position * frame_spacing' as status;
