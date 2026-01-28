-- Fix: Use ->> instead of -> for JSONB text extraction
-- The original migration used -> which returns JSONB, but we need text to cast to UUID

CREATE OR REPLACE FUNCTION demote_orphaned_video_variants(p_shot_id UUID)
RETURNS INTEGER AS $$
DECLARE
  demoted_count INTEGER := 0;
  video_record RECORD;
  stored_gen_id UUID;
  current_gen_id UUID;
BEGIN
  -- Find all primary video variants linked to this shot via pair_shot_generation_id
  -- These are child video segments (is_child = true) with a slot link
  FOR video_record IN
    SELECT
      g.id as generation_id,
      g.pair_shot_generation_id,
      g.params->'orchestrator_details'->'input_image_generation_ids' as parent_stored_ids,
      g.params->'individual_segment_params'->>'start_image_generation_id' as child_stored_id,
      g.child_order,
      gv.id as variant_id
    FROM generations g
    JOIN generation_variants gv ON gv.generation_id = g.id
    WHERE g.is_child = true
      AND g.type = 'video'
      AND g.pair_shot_generation_id IS NOT NULL
      AND gv.is_primary = true
      AND EXISTS (
        SELECT 1 FROM shot_generations sg
        WHERE sg.id = g.pair_shot_generation_id
          AND sg.shot_id = p_shot_id
      )
  LOOP
    -- Get current generation_id at the shot_generations slot
    SELECT sg.generation_id INTO current_gen_id
    FROM shot_generations sg
    WHERE sg.id = video_record.pair_shot_generation_id;

    -- Get stored generation_id for this segment's start image
    -- Child segments store it in individual_segment_params.start_image_generation_id
    -- Parent segments store it in orchestrator_details.input_image_generation_ids[child_order]
    IF video_record.child_stored_id IS NOT NULL THEN
      -- Child segment - use direct stored ID (already text from ->>)
      stored_gen_id := video_record.child_stored_id::UUID;
    ELSIF video_record.parent_stored_ids IS NOT NULL AND video_record.child_order IS NOT NULL THEN
      -- Parent segment - look up by child_order index (->> returns text)
      stored_gen_id := (video_record.parent_stored_ids->>video_record.child_order)::UUID;
    ELSE
      -- No stored ID to compare, skip
      CONTINUE;
    END IF;

    -- If they don't match, demote the variant
    IF stored_gen_id IS NOT NULL AND current_gen_id IS DISTINCT FROM stored_gen_id THEN
      UPDATE generation_variants
      SET is_primary = false
      WHERE id = video_record.variant_id;

      demoted_count := demoted_count + 1;

      RAISE NOTICE 'Demoted variant % for generation % (stored: %, current: %)',
        video_record.variant_id, video_record.generation_id, stored_gen_id, current_gen_id;
    END IF;
  END LOOP;

  RETURN demoted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
