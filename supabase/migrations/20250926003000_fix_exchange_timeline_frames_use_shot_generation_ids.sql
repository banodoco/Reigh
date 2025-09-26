-- Fix exchange_timeline_frames to use shot_generations.id instead of generation_id
-- This ensures we're working with unique shot_generation records, not potentially duplicate generation_id references

DROP FUNCTION IF EXISTS exchange_timeline_frames(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION exchange_timeline_frames(
  p_shot_id uuid,
  p_shot_generation_id_a uuid,
  p_shot_generation_id_b uuid
)
RETURNS void AS $$
DECLARE
  item_a_frame integer;
  item_b_frame integer;
  item_a_gen_id uuid;
  item_b_gen_id uuid;
BEGIN
  -- Get current timeline_frames and generation_ids for both shot_generation records
  SELECT timeline_frame, generation_id
  INTO item_a_frame, item_a_gen_id
  FROM shot_generations
  WHERE id = p_shot_generation_id_a AND shot_id = p_shot_id;

  SELECT timeline_frame, generation_id
  INTO item_b_frame, item_b_gen_id
  FROM shot_generations
  WHERE id = p_shot_generation_id_b AND shot_id = p_shot_id;

  -- Verify both items exist
  IF item_a_frame IS NULL OR item_b_frame IS NULL THEN
    RAISE EXCEPTION 'One or both shot_generation records not found: % or %', p_shot_generation_id_a, p_shot_generation_id_b;
  END IF;

  -- Perform atomic swap of timeline_frames using shot_generations.id for precision
  UPDATE shot_generations SET
    timeline_frame = CASE
      WHEN id = p_shot_generation_id_a THEN item_b_frame
      WHEN id = p_shot_generation_id_b THEN item_a_frame
    END,
    updated_at = NOW()
  WHERE id IN (p_shot_generation_id_a, p_shot_generation_id_b)
    AND shot_id = p_shot_id;

  -- Log the exchange for debugging (using generation_ids for readability)
  RAISE LOG 'Exchanged timeline_frames via shot_generation IDs: % (gen: %, frame % -> %) and % (gen: %, frame % -> %)',
    p_shot_generation_id_a, item_a_gen_id, item_a_frame, item_b_frame,
    p_shot_generation_id_b, item_b_gen_id, item_b_frame, item_a_frame;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION exchange_timeline_frames(uuid, uuid, uuid) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ FIXED: exchange_timeline_frames now uses shot_generations.id instead of generation_id';
    RAISE NOTICE 'This ensures unique shot_generation record targeting for timeline frame swaps';
END $$;
