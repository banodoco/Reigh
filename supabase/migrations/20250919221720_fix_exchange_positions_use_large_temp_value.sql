-- Fix the exchange_shot_positions function to use a large positive temporary value
-- The issue: negative temporary values violate the timeline_frame_non_negative constraint
-- Solution: Use a very large positive number that won't conflict with real timeline frames

DROP FUNCTION IF EXISTS exchange_shot_positions(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION exchange_shot_positions(
  p_shot_id uuid,
  p_generation_id_a uuid,
  p_generation_id_b uuid
)
RETURNS void AS $$
DECLARE
  item_a_position integer;
  item_a_timeline_frame integer;
  item_b_position integer;
  item_b_timeline_frame integer;
  temp_timeline_frame integer;
BEGIN
  -- Get current positions for both items
  SELECT position, timeline_frame
  INTO item_a_position, item_a_timeline_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  SELECT position, timeline_frame
  INTO item_b_position, item_b_timeline_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Verify both items exist
  IF item_a_position IS NULL OR item_b_position IS NULL THEN
    RAISE EXCEPTION 'One or both items not found in shot %', p_shot_id;
  END IF;

  -- Use a three-step process to avoid unique constraint violations
  -- Step 1: Set item A to a very large temporary timeline_frame value (won't conflict with real frames)
  temp_timeline_frame := 2000000000; -- 2 billion - way larger than any realistic timeline frame
  
  UPDATE shot_generations SET
    timeline_frame = temp_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  -- Step 2: Set item B to item A's original values
  UPDATE shot_generations SET
    position = item_a_position,
    timeline_frame = item_a_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Step 3: Set item A to item B's original values
  UPDATE shot_generations SET
    position = item_b_position,
    timeline_frame = item_b_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  -- Log the exchange for debugging
  RAISE LOG 'Exchanged positions: % (pos % -> %) and % (pos % -> %)',
    p_generation_id_a, item_a_position, item_b_position,
    p_generation_id_b, item_b_position, item_a_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION exchange_shot_positions(uuid, uuid, uuid) TO authenticated;

-- Verify the migration
SELECT 'Fixed exchange_shot_positions function to use large positive temporary value' as status;
