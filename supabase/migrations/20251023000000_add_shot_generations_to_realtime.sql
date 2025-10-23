-- Add shot_generations table to Supabase Realtime publication
-- This fixes CHANNEL_ERROR when subscribing to shot_generations changes

DO $$
BEGIN
    -- Check if shot_generations is already in the realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'shot_generations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE shot_generations;
        RAISE NOTICE 'Added shot_generations table to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'shot_generations table already in supabase_realtime publication';
    END IF;
END $$;

