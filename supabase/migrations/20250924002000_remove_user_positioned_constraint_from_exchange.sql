-- Remove user_positioned constraint from exchange_timeline_frames to fix batch dragging
-- This migration completely removes the user_positioned checks that were blocking batch operations

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
BEGIN
  -- Get current timeline_frames for both items
  SELECT timeline_frame
  INTO item_a_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  SELECT timeline_frame
  INTO item_b_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Verify both items exist
  IF item_a_frame IS NULL OR item_b_frame IS NULL THEN
    RAISE EXCEPTION 'One or both items not found in shot %', p_shot_id;
  END IF;

  -- Perform atomic swap of timeline_frames (no user_positioned restrictions)
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
    RAISE NOTICE '✅ FIXED: Removed user_positioned constraint from exchange_timeline_frames';
    RAISE NOTICE 'Batch dragging in ShotEditor should now work properly';
END $$;
