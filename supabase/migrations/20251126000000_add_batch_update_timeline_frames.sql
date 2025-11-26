-- Migration: Add batch_update_timeline_frames function
-- Purpose: Allow updating multiple timeline positions in a single atomic transaction
-- This prevents race conditions and reduces round trips when dragging/dropping items

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS batch_update_timeline_frames(jsonb);

-- Create the batch update function
CREATE OR REPLACE FUNCTION batch_update_timeline_frames(
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update jsonb;
  v_shot_generation_id uuid;
  v_timeline_frame integer;
  v_metadata jsonb;
  v_results jsonb := '[]'::jsonb;
  v_affected_shot_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user for RLS
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Log the operation start
  RAISE NOTICE '[batch_update_timeline_frames] Starting batch update with % items', jsonb_array_length(p_updates);

  -- Process each update
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_shot_generation_id := (v_update->>'shot_generation_id')::uuid;
    v_timeline_frame := (v_update->>'timeline_frame')::integer;
    v_metadata := COALESCE(v_update->'metadata', '{}'::jsonb);
    
    -- Validate the shot_generation exists and user has access
    SELECT sg.shot_id INTO v_affected_shot_id
    FROM shot_generations sg
    JOIN shots s ON sg.shot_id = s.id
    JOIN projects p ON s.project_id = p.id
    WHERE sg.id = v_shot_generation_id
      AND p.user_id = v_user_id;
    
    IF v_affected_shot_id IS NULL THEN
      RAISE WARNING '[batch_update_timeline_frames] Shot generation % not found or access denied', v_shot_generation_id;
      CONTINUE;
    END IF;
    
    -- Update the timeline_frame and merge metadata
    UPDATE shot_generations
    SET 
      timeline_frame = v_timeline_frame,
      metadata = COALESCE(metadata, '{}'::jsonb) || v_metadata,
      updated_at = now()
    WHERE id = v_shot_generation_id;
    
    -- Add to results
    v_results := v_results || jsonb_build_object(
      'shot_generation_id', v_shot_generation_id,
      'timeline_frame', v_timeline_frame,
      'success', true
    );
    
    RAISE NOTICE '[batch_update_timeline_frames] Updated % to frame %', v_shot_generation_id, v_timeline_frame;
  END LOOP;

  -- Log completion
  RAISE NOTICE '[batch_update_timeline_frames] Batch update completed: % items processed', jsonb_array_length(v_results);

  RETURN v_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_update_timeline_frames(jsonb) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION batch_update_timeline_frames(jsonb) IS 
'Batch updates multiple timeline_frame values in a single atomic transaction.
Input format: [{"shot_generation_id": "uuid", "timeline_frame": 123, "metadata": {...}}, ...]
Returns: [{"shot_generation_id": "uuid", "timeline_frame": 123, "success": true}, ...]';

