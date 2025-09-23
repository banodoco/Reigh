-- Fix exchange_timeline_frames to respect user_positioned metadata
-- This function was also overriding user drag operations

-- Drop the problematic function
DROP FUNCTION IF EXISTS exchange_timeline_frames(uuid, uuid, uuid);

-- Recreate with user_positioned protection
CREATE OR REPLACE FUNCTION exchange_timeline_frames(
  p_shot_id uuid,
  p_generation_id_a uuid,
  p_generation_id_b uuid
)
RETURNS void AS $$
DECLARE
  item_a_frame integer;
  item_b_frame integer;
  item_a_user_positioned boolean;
  item_b_user_positioned boolean;
BEGIN
  -- Get current timeline_frames and user_positioned status for both items
  SELECT timeline_frame, (metadata->>'user_positioned' = 'true' OR metadata->>'drag_source' IS NOT NULL)
  INTO item_a_frame, item_a_user_positioned
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  SELECT timeline_frame, (metadata->>'user_positioned' = 'true' OR metadata->>'drag_source' IS NOT NULL)
  INTO item_b_frame, item_b_user_positioned
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Verify both items exist
  IF item_a_frame IS NULL OR item_b_frame IS NULL THEN
    RAISE EXCEPTION 'One or both items not found in shot %', p_shot_id;
  END IF;

  -- Check if either item is user-positioned
  IF item_a_user_positioned THEN
    RAISE LOG 'Exchange blocked: Item A (%) is user-positioned at frame %', p_generation_id_a, item_a_frame;
    RAISE EXCEPTION 'Cannot exchange user-positioned item: %', p_generation_id_a;
  END IF;

  IF item_b_user_positioned THEN
    RAISE LOG 'Exchange blocked: Item B (%) is user-positioned at frame %', p_generation_id_b, item_b_frame;
    RAISE EXCEPTION 'Cannot exchange user-positioned item: %', p_generation_id_b;
  END IF;

  -- Perform atomic swap of timeline_frames (only for non-user-positioned items)
  UPDATE shot_generations SET
    timeline_frame = CASE
      WHEN generation_id = p_generation_id_a THEN item_b_frame
      WHEN generation_id = p_generation_id_b THEN item_a_frame
    END,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (p_generation_id_a, p_generation_id_b);

  -- Log the exchange for debugging
  RAISE LOG 'Exchanged timeline_frames: % (frame % -> %) and % (frame % -> %)',
    p_generation_id_a, item_a_frame, item_b_frame,
    p_generation_id_b, item_b_frame, item_a_frame;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION exchange_timeline_frames(uuid, uuid, uuid) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ FIXED: exchange_timeline_frames now respects user_positioned metadata';
    RAISE NOTICE 'Exchange operations will no longer affect user drag positions';
    RAISE NOTICE 'Function now blocks exchanges involving user-positioned items';
END $$;
