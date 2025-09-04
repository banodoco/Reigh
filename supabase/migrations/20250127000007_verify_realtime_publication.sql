-- Verify and ensure all required tables are in the supabase_realtime publication
-- This is critical for postgres_changes events to work

-- Check current publication state
DO $$
DECLARE
    missing_tables text[] := '{}';
    table_name text;
    required_tables text[] := ARRAY['tasks', 'generations', 'shot_generations'];
BEGIN
    -- Check each required table
    FOREACH table_name IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    -- Add missing tables
    IF array_length(missing_tables, 1) > 0 THEN
        FOREACH table_name IN ARRAY missing_tables
        LOOP
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
            RAISE NOTICE '[RealtimeRefactor] Added % table to supabase_realtime publication', table_name;
        END LOOP;
    ELSE
        RAISE NOTICE '[RealtimeRefactor] All required tables already in supabase_realtime publication';
    END IF;
    
    -- Log final state
    RAISE NOTICE '[RealtimeRefactor] Publication contains tables: %', (
        SELECT string_agg(tablename, ', ')
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    );
END $$;

-- Optional: Remove the no-op triggers since we don't need them for postgres_changes
-- They're harmless but unnecessary overhead
DROP TRIGGER IF EXISTS trigger_broadcast_task_status ON tasks;
DROP FUNCTION IF EXISTS noop_broadcast_task_status();

DROP TRIGGER IF EXISTS trigger_broadcast_generation_created ON generations;  
DROP FUNCTION IF EXISTS noop_broadcast_generation_created();

-- Add a comment explaining the approach
COMMENT ON PUBLICATION supabase_realtime IS 
'Realtime publication for postgres_changes events. Tables: tasks, generations, shot_generations. No custom triggers needed - events come directly from WAL.';
