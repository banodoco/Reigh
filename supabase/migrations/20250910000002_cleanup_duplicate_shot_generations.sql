-- Clean up duplicate shot_generation records
-- Keep the record with the lowest position (or NULL if all are NULL)
-- Remove duplicates

-- First, let's see what duplicates exist (for logging)
DO $$
DECLARE
    duplicate_count integer;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT shot_id, generation_id, COUNT(*) as cnt
        FROM shot_generations
        GROUP BY shot_id, generation_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Found % shot-generation combinations with duplicates', duplicate_count;
END $$;

-- Remove duplicates, keeping the "best" record for each shot-generation combo
-- Priority: 1) Record with lowest non-null position, 2) Record with null position, 3) Oldest record
WITH ranked_records AS (
    SELECT 
        id,
        shot_id,
        generation_id,
        "position",
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY shot_id, generation_id 
            ORDER BY 
                CASE WHEN "position" IS NULL THEN 1 ELSE 0 END,  -- NULL positions last
                "position" ASC NULLS LAST,                        -- Lower positions first
                created_at ASC                                    -- Older records first
        ) as rn
    FROM shot_generations
),
duplicates_to_delete AS (
    SELECT id
    FROM ranked_records
    WHERE rn > 1
)
DELETE FROM shot_generations
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- Log the cleanup results
DO $$
DECLARE
    remaining_duplicates integer;
BEGIN
    SELECT COUNT(*) INTO remaining_duplicates
    FROM (
        SELECT shot_id, generation_id, COUNT(*) as cnt
        FROM shot_generations
        GROUP BY shot_id, generation_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'After cleanup: % shot-generation combinations still have duplicates', remaining_duplicates;
END $$;
