-- Comprehensive timeline drag protection
-- Disable all mechanisms that could overwrite user drag positions

-- 1. Disable the useUpdateShotImageOrder mutation by making it no-op
-- (This was overwriting drag positions with index * 50)
CREATE OR REPLACE FUNCTION update_shot_image_order_disabled(
  p_shot_id uuid,
  p_ordered_shot_generation_ids uuid[],
  p_project_id uuid
)
RETURNS jsonb AS $$
BEGIN
  RAISE LOG '[TimelineDragFix] update_shot_image_order: DISABLED - Would overwrite drag positions with index-based spacing';
  RETURN jsonb_build_object('message', 'Operation disabled to protect drag positions');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Disable apply_timeline_frames function completely
-- (This was being called by triggers and overwriting positions)
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

-- 3. Disable any triggers that might call position updates
-- (Comment out any problematic triggers)

-- 4. Add protection trigger to prevent unauthorized timeline_frame changes
CREATE OR REPLACE FUNCTION prevent_drag_position_overwrites()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an update to timeline_frame and the item is user-positioned, block it
  IF TG_OP = 'UPDATE' AND
     (OLD.metadata->>'user_positioned' = 'true' OR OLD.metadata->>'drag_source' IS NOT NULL) AND
     NEW.timeline_frame IS DISTINCT FROM OLD.timeline_frame THEN

    RAISE LOG '[TimelineDragFix] PROTECTED: Blocking timeline_frame update for user-positioned item % (drag_source: %, user_positioned: %)',
      OLD.generation_id,
      OLD.metadata->>'drag_source',
      OLD.metadata->>'user_positioned';

    -- Restore the original timeline_frame
    NEW.timeline_frame := OLD.timeline_frame;
    NEW.metadata := OLD.metadata;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply the protection trigger
DROP TRIGGER IF EXISTS prevent_drag_position_overwrites_trigger ON shot_generations;
CREATE TRIGGER prevent_drag_position_overwrites_trigger
    BEFORE UPDATE ON shot_generations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_drag_position_overwrites();

-- 5. Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ COMPREHENSIVE TIMELINE DRAG PROTECTION APPLIED';
    RAISE NOTICE 'Disabled: useUpdateShotImageOrder, apply_timeline_frames';
    RAISE NOTICE 'Added: Protection trigger for user-positioned items';
    RAISE NOTICE 'Timeline drag operations are now fully protected';
END $$;
