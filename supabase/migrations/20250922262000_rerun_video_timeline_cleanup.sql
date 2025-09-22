-- Re-run video timeline cleanup after fixing video types
-- This will now catch any generations that were just corrected to type = 'video'

CREATE OR REPLACE FUNCTION rerun_video_timeline_cleanup()
RETURNS void AS $$
DECLARE
  r_shot RECORD;
  r_gen RECORD;
  current_frame_value INTEGER;
  frame_spacing CONSTANT INTEGER := 50;
  affected_shots_count INTEGER := 0;
  video_updates INTEGER := 0;
  image_updates INTEGER := 0;
BEGIN
  RAISE NOTICE 'Re-running video timeline_frame cleanup after type corrections...';

  -- Remove timeline_frame from all video generations (including newly corrected ones)
  UPDATE public.shot_generations
  SET timeline_frame = NULL, updated_at = NOW()
  FROM public.generations
  WHERE shot_generations.generation_id = generations.id
    AND generations.type = 'video'
    AND shot_generations.timeline_frame IS NOT NULL;
  
  GET DIAGNOSTICS video_updates = ROW_COUNT;
  RAISE NOTICE 'Removed timeline_frame from % video generations (including newly corrected ones)', video_updates;

  -- Now renumber remaining image generations for each shot
  FOR r_shot IN
    SELECT DISTINCT sg.shot_id 
    FROM public.shot_generations sg
    JOIN public.generations g ON sg.generation_id = g.id
    WHERE g.type != 'video' OR g.type IS NULL -- Include both 'image' and NULL types
    ORDER BY sg.shot_id
  LOOP
    current_frame_value := 0;
    affected_shots_count := affected_shots_count + 1;
    RAISE NOTICE 'Renumbering image generations for shot: % (shot % of affected shots)', r_shot.shot_id, affected_shots_count;

    FOR r_gen IN
      SELECT sg.id, sg.generation_id, sg.timeline_frame, g.type
      FROM public.shot_generations sg
      JOIN public.generations g ON sg.generation_id = g.id
      WHERE sg.shot_id = r_shot.shot_id
        AND (g.type != 'video' OR g.type IS NULL) -- Only process non-video generations
      ORDER BY sg.timeline_frame ASC NULLS LAST, sg.created_at ASC -- Ensure stable order
    LOOP
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
      current_frame_value := current_frame_value + frame_spacing;
    END LOOP;
    
    RAISE NOTICE '  Completed shot % with % image generations', r_shot.shot_id, (current_frame_value / frame_spacing);
  END LOOP;

  RAISE NOTICE 'Video timeline cleanup re-run completed!';
  RAISE NOTICE 'Summary: Cleared % video timeline_frames, Updated % image timeline_frames, Processed % shots', 
    video_updates, image_updates, affected_shots_count;
END;
$$ LANGUAGE plpgsql;

-- Execute the cleanup function
SELECT rerun_video_timeline_cleanup();

-- Drop the function after use
DROP FUNCTION rerun_video_timeline_cleanup();
