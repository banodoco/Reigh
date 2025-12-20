-- Add 'stuck' status to dev_tasks
ALTER TABLE dev_tasks DROP CONSTRAINT dev_tasks_status_check;
ALTER TABLE dev_tasks ADD CONSTRAINT dev_tasks_status_check 
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'stuck', 'done', 'cancelled'));
