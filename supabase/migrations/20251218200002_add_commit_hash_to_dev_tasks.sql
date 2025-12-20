-- Add github commit hash to dev_tasks
ALTER TABLE dev_tasks ADD COLUMN commit_hash TEXT;
