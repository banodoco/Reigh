-- Add generation_started_at column to tasks table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasks' 
                   AND column_name = 'generation_started_at') THEN
        ALTER TABLE tasks ADD COLUMN generation_started_at timestamptz;
    END IF;
END $$; 