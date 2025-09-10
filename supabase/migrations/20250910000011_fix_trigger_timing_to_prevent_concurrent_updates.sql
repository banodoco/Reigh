-- Fix trigger timing to prevent concurrent update errors
-- Change from BEFORE UPDATE to AFTER UPDATE to avoid modifying the same row within the same command

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_create_generation_on_task_complete ON tasks;

-- Recreate as AFTER UPDATE trigger
CREATE TRIGGER trigger_create_generation_on_task_complete
    AFTER UPDATE ON tasks
    FOR EACH ROW
    WHEN (NEW.status = 'Complete'::task_status AND OLD.status != 'Complete'::task_status)
    EXECUTE FUNCTION create_generation_on_task_complete();
