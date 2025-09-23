-- Fix timeline_frame spacing issues from previous migration
-- Some shots have irregular spacing (60-unit instead of 50-unit) after position 200
-- This corrects all shots to have proper 0, 50, 100, 150, 200, 250, 300... spacing

DO $$
DECLARE
    shot_record RECORD;
    generation_record RECORD;
    frame_counter INTEGER;
    affected_shots INTEGER := 0;
    total_updates INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting timeline_frame spacing correction...';
    
    -- Find shots that have irregular spacing (gaps != 50 between consecutive frames)
    FOR shot_record IN 
        WITH shot_frames AS (
            SELECT DISTINCT shot_id,
                   timeline_frame,
                   LAG(timeline_frame) OVER (PARTITION BY shot_id ORDER BY timeline_frame) as prev_frame
            FROM shot_generations 
            WHERE timeline_frame IS NOT NULL
        ),
        irregular_shots AS (
            SELECT DISTINCT shot_id
            FROM shot_frames
            WHERE prev_frame IS NOT NULL 
              AND (timeline_frame - prev_frame) != 50
        )
        SELECT shot_id FROM irregular_shots
        ORDER BY shot_id
    LOOP
        affected_shots := affected_shots + 1;
        RAISE NOTICE 'Fixing shot: % (shot % of affected shots)', shot_record.shot_id, affected_shots;
        
        -- Reset frame counter for each shot
        frame_counter := 0;
        
        -- Get all shot_generations for this shot, ordered by current timeline_frame
        FOR generation_record IN
            SELECT id, generation_id, timeline_frame, metadata
            FROM shot_generations
            WHERE shot_id = shot_record.shot_id
              AND timeline_frame IS NOT NULL
            ORDER BY timeline_frame ASC, created_at ASC
        LOOP
            -- Skip items that have been manually positioned by users (drag operations)
            -- Check metadata for user_positioned flag or drag_source flag
            IF NOT EXISTS (
                SELECT 1 FROM shot_generations
                WHERE id = generation_record.id
                AND (metadata->>'user_positioned' = 'true' OR metadata->>'drag_source' IS NOT NULL)
            ) THEN
                -- Only update auto-positioned items that don't match expected spacing
                IF generation_record.timeline_frame != frame_counter THEN
                    UPDATE shot_generations
                    SET timeline_frame = frame_counter
                    WHERE id = generation_record.id;

                    total_updates := total_updates + 1;

                    RAISE NOTICE '  Updated generation % from timeline_frame % to %',
                        generation_record.generation_id,
                        generation_record.timeline_frame,
                        frame_counter;
                END IF;
            ELSE
                RAISE NOTICE '  Skipping user-positioned generation % at timeline_frame %',
                    generation_record.generation_id,
                    generation_record.timeline_frame;
            END IF;
            
            -- Increment counter by 50 for next generation
            frame_counter := frame_counter + 50;
        END LOOP;
        
        RAISE NOTICE '  Completed shot % with % generations', 
            shot_record.shot_id, 
            frame_counter / 50;
    END LOOP;
    
    RAISE NOTICE 'Timeline frame spacing correction completed!';
    RAISE NOTICE 'Affected shots: %, Total updates: % (user-positioned items preserved)', affected_shots, total_updates;
END $$;
