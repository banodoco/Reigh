-- Debug what's still causing database reverts
-- Check for any remaining triggers, functions, or policies

-- 1. Check for ANY triggers on shot_generations
SELECT 
    trigger_name, 
    event_manipulation, 
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'shot_generations';

-- 2. Check for ANY functions that might be called automatically
SELECT 
    routine_name, 
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_definition ILIKE '%shot_generations%' 
   OR routine_definition ILIKE '%timeline_frame%'
   OR routine_name ILIKE '%timeline%'
   OR routine_name ILIKE '%position%';

-- 3. Check RLS policies on shot_generations
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    cmd, 
    roles, 
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'shot_generations';

-- 4. Check for any constraints that might have CHECK conditions
SELECT 
    conname, 
    contype,
    consrc,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'shot_generations'::regclass;

-- 5. Check for any rules on the table
SELECT 
    rulename,
    definition
FROM pg_rules
WHERE tablename = 'shot_generations';

-- 6. Check table structure and permissions
\d shot_generations

-- 7. Test a simple update to see what happens
DO $$
DECLARE
    test_id uuid;
    original_frame integer;
    new_frame integer := 999;
BEGIN
    -- Get a test record
    SELECT generation_id, timeline_frame INTO test_id, original_frame
    FROM shot_generations 
    WHERE timeline_frame IS NOT NULL 
    LIMIT 1;
    
    IF test_id IS NOT NULL THEN
        RAISE NOTICE 'Testing update on generation_id: %, original frame: %', test_id, original_frame;
        
        -- Try to update it
        UPDATE shot_generations 
        SET timeline_frame = new_frame 
        WHERE generation_id = test_id;
        
        -- Check if it stuck
        SELECT timeline_frame INTO new_frame 
        FROM shot_generations 
        WHERE generation_id = test_id;
        
        RAISE NOTICE 'After update - expected: 999, actual: %', new_frame;
        
        -- Restore original value
        UPDATE shot_generations 
        SET timeline_frame = original_frame 
        WHERE generation_id = test_id;
        
        IF new_frame = 999 THEN
            RAISE NOTICE '✅ UPDATE WORKED - No database mechanism blocking it';
        ELSE
            RAISE NOTICE '🚨 UPDATE WAS REVERTED - Something is still blocking updates';
        END IF;
    ELSE
        RAISE NOTICE 'No test records found';
    END IF;
END $$;
