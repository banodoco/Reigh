-- Standardize timeline_frame values across all shots
-- For each shot, reassign timeline_frame values to shot_generations in sequence: 0, 50, 100, 150, etc.
-- This creates a clean, standardized starting point for all timeline frames

DO $$
DECLARE
    shot_record RECORD;
    generation_record RECORD;
    frame_counter INTEGER;
BEGIN
    -- Log start of standardization
    RAISE NOTICE 'Starting timeline_frame standardization for all shots...';
    
    -- Iterate through each shot
    FOR shot_record IN 
        SELECT DISTINCT shot_id 
        FROM shot_generations 
        WHERE timeline_frame IS NOT NULL
        ORDER BY shot_id
    LOOP
        RAISE NOTICE 'Processing shot: %', shot_record.shot_id;
        
        -- Reset frame counter for each shot
        frame_counter := 0;
        
        -- Get all shot_generations for this shot that have timeline_frame values
        -- Order them by their current timeline_frame to preserve relative ordering
        FOR generation_record IN
            SELECT id, generation_id, timeline_frame
            FROM shot_generations
            WHERE shot_id = shot_record.shot_id 
              AND timeline_frame IS NOT NULL
            ORDER BY timeline_frame ASC, created_at ASC
        LOOP
            -- Update this generation's timeline_frame to the standardized value
            UPDATE shot_generations
            SET timeline_frame = frame_counter
            WHERE id = generation_record.id;
            
            RAISE NOTICE 'Updated generation % from timeline_frame % to %', 
                generation_record.generation_id, 
                generation_record.timeline_frame, 
                frame_counter;
            
            -- Increment counter by 50 for next generation
            frame_counter := frame_counter + 50;
        END LOOP;
        
        RAISE NOTICE 'Completed shot % with % generations', 
            shot_record.shot_id, 
            frame_counter / 50;
    END LOOP;
    
    -- Log completion
    RAISE NOTICE 'Timeline frame standardization completed successfully!';
END $$;
