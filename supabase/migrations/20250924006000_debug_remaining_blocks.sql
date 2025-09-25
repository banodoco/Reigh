-- Debug what's still causing database reverts after removing triggers
-- This will help identify any remaining blocking mechanisms

-- 1. Check for ANY triggers on shot_generations
DO $$
DECLARE
    trigger_rec RECORD;
    trigger_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== CHECKING FOR REMAINING TRIGGERS ===';
    
    FOR trigger_rec IN
        SELECT trigger_name, event_manipulation, action_timing, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'shot_generations'
    LOOP
        trigger_count := trigger_count + 1;
        RAISE NOTICE 'Found trigger: % (%) - %', 
            trigger_rec.trigger_name, 
            trigger_rec.event_manipulation,
            trigger_rec.action_timing;
    END LOOP;
    
    IF trigger_count = 0 THEN
        RAISE NOTICE '✅ No triggers found on shot_generations';
    ELSE
        RAISE NOTICE '🚨 Found % triggers still active!', trigger_count;
    END IF;
END $$;

-- 2. Check for ANY functions that might be called automatically
DO $$
DECLARE
    func_rec RECORD;
    func_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== CHECKING FOR FUNCTIONS THAT MIGHT INTERFERE ===';
    
    FOR func_rec IN
        SELECT routine_name, routine_type
        FROM information_schema.routines
        WHERE routine_definition ILIKE '%shot_generations%' 
           OR routine_definition ILIKE '%timeline_frame%'
           OR routine_name ILIKE '%timeline%'
           OR routine_name ILIKE '%position%'
    LOOP
        func_count := func_count + 1;
        RAISE NOTICE 'Found function: % (%)', func_rec.routine_name, func_rec.routine_type;
    END LOOP;
    
    IF func_count = 0 THEN
        RAISE NOTICE '✅ No suspicious functions found';
    ELSE
        RAISE NOTICE '⚠️ Found % functions that might interfere', func_count;
    END IF;
END $$;

-- 3. Check RLS policies on shot_generations
DO $$
DECLARE
    policy_rec RECORD;
    policy_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== CHECKING RLS POLICIES ===';
    
    FOR policy_rec IN
        SELECT policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE tablename = 'shot_generations'
    LOOP
        policy_count := policy_count + 1;
        RAISE NOTICE 'Found policy: % (%)', policy_rec.policyname, policy_rec.cmd;
    END LOOP;
    
    RAISE NOTICE 'Total RLS policies: %', policy_count;
END $$;

-- 4. Test a simple update to see what happens
DO $$
DECLARE
    test_id uuid;
    original_frame integer;
    new_frame integer := 999;
    actual_frame integer;
BEGIN
    RAISE NOTICE '=== TESTING DIRECT DATABASE UPDATE ===';
    
    -- Get a test record
    SELECT generation_id, timeline_frame INTO test_id, original_frame
    FROM shot_generations 
    WHERE timeline_frame IS NOT NULL 
    LIMIT 1;
    
    IF test_id IS NOT NULL THEN
        RAISE NOTICE 'Testing update on generation_id: %, original frame: %', 
            test_id, original_frame;
        
        -- Try to update it
        UPDATE shot_generations 
        SET timeline_frame = new_frame 
        WHERE generation_id = test_id;
        
        -- Check if it stuck immediately
        SELECT timeline_frame INTO actual_frame 
        FROM shot_generations 
        WHERE generation_id = test_id;
        
        RAISE NOTICE 'After update - expected: %, actual: %', new_frame, actual_frame;
        
        -- Wait 1 second and check again
        PERFORM pg_sleep(1);
        
        SELECT timeline_frame INTO actual_frame 
        FROM shot_generations 
        WHERE generation_id = test_id;
        
        RAISE NOTICE 'After 1 second wait - expected: %, actual: %', new_frame, actual_frame;
        
        -- Restore original value
        UPDATE shot_generations 
        SET timeline_frame = original_frame 
        WHERE generation_id = test_id;
        
        IF actual_frame = new_frame THEN
            RAISE NOTICE '✅ UPDATE WORKED - No database mechanism blocking it';
        ELSE
            RAISE NOTICE '🚨 UPDATE WAS REVERTED - Something is still blocking updates';
            RAISE NOTICE 'Expected: %, Got: %', new_frame, actual_frame;
        END IF;
    ELSE
        RAISE NOTICE 'No test records found with timeline_frame';
    END IF;
END $$;

-- 5. Check for any rules on the table
DO $$
DECLARE
    rule_rec RECORD;
    rule_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== CHECKING FOR TABLE RULES ===';
    
    FOR rule_rec IN
        SELECT rulename, definition
        FROM pg_rules
        WHERE tablename = 'shot_generations'
    LOOP
        rule_count := rule_count + 1;
        RAISE NOTICE 'Found rule: %', rule_rec.rulename;
    END LOOP;
    
    IF rule_count = 0 THEN
        RAISE NOTICE '✅ No rules found on shot_generations';
    ELSE
        RAISE NOTICE '⚠️ Found % rules', rule_count;
    END IF;
END $$;

-- 6. Summary
DO $$
BEGIN
    RAISE NOTICE '=== DEBUGGING COMPLETE ===';
    RAISE NOTICE 'If updates are still being reverted, check the application logs';
    RAISE NOTICE 'The issue might be in the client-side code or Supabase client behavior';
END $$;
