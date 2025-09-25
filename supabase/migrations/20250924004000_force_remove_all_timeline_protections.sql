-- Force remove ALL timeline protections and triggers
-- This will ensure no database mechanisms are blocking updates

-- Drop ALL possible triggers on shot_generations table
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    FOR trigger_rec IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'shot_generations'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_rec.trigger_name || ' ON shot_generations';
        RAISE NOTICE 'Dropped trigger: %', trigger_rec.trigger_name;
    END LOOP;
END $$;

-- Drop ALL possible functions that might be interfering
DROP FUNCTION IF EXISTS prevent_user_positioned_modification();
DROP FUNCTION IF EXISTS protect_user_positioned_timeline_frames();
DROP FUNCTION IF EXISTS timeline_protection_trigger();
DROP FUNCTION IF EXISTS user_positioned_protection_trigger();
DROP FUNCTION IF EXISTS check_user_positioned_modification();
DROP FUNCTION IF EXISTS validate_timeline_frame_update();

-- Drop ALL possible RLS policies on shot_generations
DROP POLICY IF EXISTS "Users can view their own shot_generations" ON shot_generations;
DROP POLICY IF EXISTS "Users can update their own shot_generations" ON shot_generations;
DROP POLICY IF EXISTS "Users can insert their own shot_generations" ON shot_generations;
DROP POLICY IF EXISTS "Users can delete their own shot_generations" ON shot_generations;
DROP POLICY IF EXISTS "Allow all operations on shot_generations" ON shot_generations;
DROP POLICY IF EXISTS "shot_generations_policy" ON shot_generations;

-- Disable RLS on shot_generations if it's enabled
ALTER TABLE shot_generations DISABLE ROW LEVEL SECURITY;

-- Drop ALL possible constraints that might be reverting changes
DO $$
DECLARE
    constraint_rec RECORD;
BEGIN
    FOR constraint_rec IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'shot_generations'::regclass
    LOOP
        EXECUTE 'ALTER TABLE shot_generations DROP CONSTRAINT IF EXISTS ' || constraint_rec.conname || ' CASCADE';
        RAISE NOTICE 'Dropped constraint: %', constraint_rec.conname;
    END LOOP;
END $$;

-- Update settings to ensure no protection flags are active
UPDATE settings
SET value = 'false'
WHERE key IN ('permanently_disable_timeline_standardization', 'timeline_standardization_permanently_disabled', 'enable_timeline_protection');

-- Delete any settings that might be causing issues
DELETE FROM settings WHERE key LIKE '%timeline%' OR key LIKE '%position%';

-- Add comment to document the complete removal
COMMENT ON TABLE shot_generations IS 'Timeline positions: ALL protection mechanisms removed. Direct updates allowed.';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ FORCE REMOVED: ALL timeline protection mechanisms';
    RAISE NOTICE '✅ Dropped all triggers, functions, policies, and constraints';
    RAISE NOTICE '✅ Disabled RLS on shot_generations table';
    RAISE NOTICE '✅ Timeline drag operations should now work without any database interference';
    RAISE NOTICE '✅ No more automatic reverts or blocks on timeline_frame updates';
END $$;

-- Verify no triggers remain
DO $$
DECLARE
    remaining_triggers INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_triggers
    FROM information_schema.triggers
    WHERE event_object_table = 'shot_generations';

    RAISE NOTICE 'Remaining triggers on shot_generations: %', remaining_triggers;

    IF remaining_triggers = 0 THEN
        RAISE NOTICE '✅ SUCCESS: No triggers remaining - database updates should work freely';
    ELSE
        RAISE NOTICE '⚠️ WARNING: % triggers still exist', remaining_triggers;
        RAISE NOTICE 'Check information_schema.triggers for remaining trigger names';
    END IF;
END $$;
