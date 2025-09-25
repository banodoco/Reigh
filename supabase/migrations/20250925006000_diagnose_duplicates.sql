-- Diagnostic migration to understand the duplicate situation
DO $$
DECLARE
    duplicate_info RECORD;
    total_duplicates INTEGER := 0;
BEGIN
    RAISE LOG '=== DUPLICATE DIAGNOSTIC REPORT ===';
    
    -- Count total duplicates
    SELECT COUNT(*) INTO total_duplicates
    FROM (
        SELECT shot_id, timeline_frame, COUNT(*) as cnt
        FROM shot_generations 
        WHERE timeline_frame IS NOT NULL
        GROUP BY shot_id, timeline_frame
        HAVING COUNT(*) > 1
    ) dups;
    
    RAISE LOG 'Total duplicate groups found: %', total_duplicates;
    
    -- Show detailed information about each duplicate group
    FOR duplicate_info IN
        SELECT 
            shot_id, 
            timeline_frame, 
            COUNT(*) as duplicate_count,
            array_agg(id::text) as ids,
            array_agg(created_at::text) as created_dates
        FROM shot_generations 
        WHERE timeline_frame IS NOT NULL
        GROUP BY shot_id, timeline_frame
        HAVING COUNT(*) > 1
        ORDER BY shot_id, timeline_frame
        LIMIT 10  -- Show first 10 duplicate groups
    LOOP
        RAISE LOG 'DUPLICATE GROUP: shot_id=%, timeline_frame=%, count=%, ids=%, dates=%', 
            duplicate_info.shot_id, 
            duplicate_info.timeline_frame, 
            duplicate_info.duplicate_count,
            duplicate_info.ids,
            duplicate_info.created_dates;
    END LOOP;
    
    -- Check if there are any NULL timeline_frames
    SELECT COUNT(*) INTO total_duplicates
    FROM shot_generations 
    WHERE timeline_frame IS NULL;
    
    RAISE LOG 'Records with NULL timeline_frame: %', total_duplicates;
    
    -- Check total records
    SELECT COUNT(*) INTO total_duplicates
    FROM shot_generations;
    
    RAISE LOG 'Total shot_generations records: %', total_duplicates;
    
    RAISE LOG '=== END DIAGNOSTIC REPORT ===';
END $$;

-- Don't create the constraint yet - just diagnose
DO $$
BEGIN
    RAISE LOG '🔍 Diagnostic complete - check logs for duplicate details';
END $$;
