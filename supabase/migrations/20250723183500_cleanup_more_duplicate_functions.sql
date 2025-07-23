-- Clean up additional duplicate functions
-- This migration removes more duplicate functions related to user creation

-- User creation functions analysis:
-- 1. auto_create_user_before_project() - trigger function for automatic user creation
-- 2. create_user_record_if_not_exists() - manual user creation function
-- 3. ensure_user_exists() - another trigger function for user creation
-- These all do similar things - ensure a user record exists

-- Check which triggers are using these functions
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    -- Check for triggers using ensure_user_exists
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.proname = 'ensure_user_exists';
    
    IF trigger_count > 0 THEN
        RAISE NOTICE 'ensure_user_exists is used by % trigger(s)', trigger_count;
    END IF;
    
    -- Check for triggers using auto_create_user_before_project
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.proname = 'auto_create_user_before_project';
    
    IF trigger_count > 0 THEN
        RAISE NOTICE 'auto_create_user_before_project is used by % trigger(s)', trigger_count;
    END IF;
END $$;

-- Based on the migration history, it looks like:
-- - ensure_user_exists was replaced by auto_create_user_before_project
-- - create_user_record_if_not_exists is a standalone function that can be called manually

-- Remove the old ensure_user_exists function and its trigger
DROP TRIGGER IF EXISTS ensure_user_exists_trigger ON projects;
DROP FUNCTION IF EXISTS ensure_user_exists();

-- Keep auto_create_user_before_project as it's the current trigger function
-- Keep create_user_record_if_not_exists as it's used for manual user creation

-- Document the remaining functions
COMMENT ON FUNCTION auto_create_user_before_project() IS 'Trigger function that automatically creates a user record when a project is created';
COMMENT ON FUNCTION create_user_record_if_not_exists() IS 'Manually create a user record for the authenticated user if it does not exist';

-- Additional cleanup for other potential duplicates

-- Normalize image path functions - check if we have duplicates
-- normalize_image_path(text) and normalize_image_paths_in_jsonb(jsonb) are complementary, not duplicates

-- Worker management functions - these look like they're all part of the same system
-- func_update_worker_heartbeat, func_reset_orphaned_tasks, func_get_tasks_by_status
-- These are all needed for worker management

-- The http_* functions are overloads from the http extension - not duplicates

-- Document key functions for clarity
COMMENT ON FUNCTION func_update_worker_heartbeat(text, integer, integer) IS 'Update worker heartbeat and optionally VRAM usage';
COMMENT ON FUNCTION func_reset_orphaned_tasks(text[]) IS 'Reset tasks from failed workers back to Queued status';
COMMENT ON FUNCTION func_get_tasks_by_status(text[]) IS 'Get tasks filtered by status array';
COMMENT ON FUNCTION normalize_image_path(text) IS 'Normalize a single image path by removing local server URLs';
COMMENT ON FUNCTION normalize_image_paths_in_jsonb(jsonb) IS 'Recursively normalize all image paths in a JSONB structure'; 