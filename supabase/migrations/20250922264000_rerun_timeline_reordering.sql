-- Re-run timeline frame reordering after fixing type classifications
-- Now that image/video types are correct, ensure proper 0,50,100... spacing for images

CREATE OR REPLACE FUNCTION rerun_timeline_reordering()
RETURNS void AS $$
DECLARE
  r_shot RECORD;
  r_gen RECORD;
  current_frame_value INTEGER;
  frame_spacing CONSTANT INTEGER := 50;
  affected_shots_count INTEGER := 0;
  video_cleared INTEGER := 0;
  image_updates INTEGER := 0;
BEGIN
  RAISE NOTICE 'Re-running timeline frame reordering with correct type classifications...';

  -- First, clear timeline_frame from any remaining video generations (just to be safe)
  UPDATE public.shot_generations
  SET timeline_frame = NULL, updated_at = NOW()
  FROM public.generations
  WHERE shot_generations.generation_id = generations.id
    AND generations.type = 'video'
    AND shot_generations.timeline_frame IS NOT NULL;
  
  GET DIAGNOSTICS video_cleared = ROW_COUNT;
  RAISE NOTICE 'Cleared timeline_frame from % video generations', video_cleared;

  -- Now renumber image generations for each shot
  FOR r_shot IN
    SELECT DISTINCT sg.shot_id 
    FROM public.shot_generations sg
    JOIN public.generations g ON sg.generation_id = g.id
    WHERE g.type = 'image' OR g.type IS NULL -- Include 'image' and NULL types (treating NULL as image)
    ORDER BY sg.shot_id
  LOOP
    current_frame_value := 0;
    affected_shots_count := affected_shots_count + 1;
    RAISE NOTICE 'Renumbering image generations for shot: % (shot % of affected shots)', r_shot.shot_id, affected_shots_count;

    FOR r_gen IN
      SELECT sg.id, sg.generation_id, sg.timeline_frame, g.type, sg.metadata
      FROM public.shot_generations sg
      JOIN public.generations g ON sg.generation_id = g.id
      WHERE sg.shot_id = r_shot.shot_id
        AND (g.type = 'image' OR g.type IS NULL) -- Only process image/NULL generations
      ORDER BY sg.timeline_frame ASC NULLS LAST, sg.created_at ASC -- Ensure stable order
    LOOP
      -- Skip user-positioned items (drag operations)
      IF NOT (r_gen.metadata->>'user_positioned' = 'true' OR r_gen.metadata->>'drag_source' IS NOT NULL) THEN
        IF r_gen.timeline_frame IS DISTINCT FROM current_frame_value THEN
          UPDATE public.shot_generations
          SET timeline_frame = current_frame_value, updated_at = NOW()
          WHERE id = r_gen.id;
          image_updates := image_updates + 1;
          RAISE NOTICE '  Updated generation % (type: %) from timeline_frame % to %',
            r_gen.generation_id,
            COALESCE(r_gen.type, 'NULL'),
            r_gen.timeline_frame,
            current_frame_value;
        END IF;
      ELSE
        RAISE NOTICE '  Skipping user-positioned generation % (type: %) at timeline_frame %',
          r_gen.generation_id,
          COALESCE(r_gen.type, 'NULL'),
          r_gen.timeline_frame;
      END IF;
      current_frame_value := current_frame_value + frame_spacing;
    END LOOP;
    
    RAISE NOTICE '  Completed shot % with % image generations', r_shot.shot_id, (current_frame_value / frame_spacing);
  END LOOP;

  RAISE NOTICE 'Timeline frame reordering completed!';
  RAISE NOTICE 'Summary: Cleared % video timeline_frames, Updated % image timeline_frames, Processed % shots', 
    video_cleared, image_updates, affected_shots_count;
END;
$$ LANGUAGE plpgsql;

-- Execute the reordering function
SELECT rerun_timeline_reordering();

-- Drop the function after use
DROP FUNCTION rerun_timeline_reordering();
