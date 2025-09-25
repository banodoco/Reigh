-- Disable apply_timeline_frames function to prevent overwriting drag positions
-- This function was being called by triggers and overwriting user timeline drag operations

-- Replace the function with a no-op version
CREATE OR REPLACE FUNCTION apply_timeline_frames(
  p_shot_id uuid,
  p_changes jsonb,
  p_update_positions boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  generation_id uuid,
  "position" integer,
  timeline_frame integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- DISABLED: Skip all timeline frame updates to prevent overwriting drag positions
  RAISE LOG '[TimelineDragFix] apply_timeline_frames: DISABLED - Skipping all updates to prevent overwriting drag positions';
  RETURN;
END;
$$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'apply_timeline_frames has been disabled to prevent overwriting drag positions';
    RAISE NOTICE 'Timeline drag operations will now be preserved';
END $$;
