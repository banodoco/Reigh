-- Fix batch dragging by allowing exchanges when both items are user-positioned
-- This enables batch dragging in ShotEditor while still protecting against automatic overwrites

-- Drop and recreate exchange_timeline_frames with updated logic
DROP FUNCTION IF EXISTS exchange_timeline_frames(uuid, uuid, uuid);

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

  -- UPDATED LOGIC: Only block exchanges where one item is user-positioned and the other is not
  -- This allows:
  -- 1. Both items non-user-positioned (original auto-positioning)
  -- 2. Both items user-positioned (batch dragging operations)
  -- But blocks:
  -- 1. One user-positioned, one not (protects user drag from being overwritten by auto-positioning)
  
  IF item_a_user_positioned AND NOT item_b_user_positioned THEN
    RAISE LOG 'Exchange blocked: Item A (%) is user-positioned but Item B (%) is not', p_generation_id_a, p_generation_id_b;
    RAISE EXCEPTION 'Cannot exchange user-positioned item % with auto-positioned item %', p_generation_id_a, p_generation_id_b;
  END IF;

  IF item_b_user_positioned AND NOT item_a_user_positioned THEN
    RAISE LOG 'Exchange blocked: Item B (%) is user-positioned but Item A (%) is not', p_generation_id_b, p_generation_id_a;
    RAISE EXCEPTION 'Cannot exchange user-positioned item % with auto-positioned item %', p_generation_id_b, p_generation_id_a;
  END IF;

  -- Log the type of exchange being performed
  IF item_a_user_positioned AND item_b_user_positioned THEN
    RAISE LOG 'Performing user-to-user exchange: % (frame %) <-> % (frame %)', 
      p_generation_id_a, item_a_frame, p_generation_id_b, item_b_frame;
  ELSE
    RAISE LOG 'Performing auto-to-auto exchange: % (frame %) <-> % (frame %)', 
      p_generation_id_a, item_a_frame, p_generation_id_b, item_b_frame;
  END IF;

  -- Perform atomic swap of timeline_frames
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
    RAISE NOTICE '✅ FIXED: exchange_timeline_frames now allows batch dragging between user-positioned items';
    RAISE NOTICE 'Exchange operations blocked only when mixing user-positioned with auto-positioned items';
    RAISE NOTICE 'This enables batch dragging in ShotEditor while protecting user positions from auto-overwrites';
END $$;
