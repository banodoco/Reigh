-- Add generation_started_at column to tasks table
ALTER TABLE tasks ADD COLUMN generation_started_at timestamptz; 