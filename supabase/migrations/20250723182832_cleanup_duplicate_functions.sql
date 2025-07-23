-- Clean up duplicate and obsolete database functions
-- This migration removes functions that have been superseded by newer implementations
-- 
-- IMPORTANT: Before running this migration, ensure that:
-- 1. All Edge Functions have been updated to use the new function names
-- 2. No external workers are still using the old functions

-- First, let's verify the new functions exist before dropping the old ones
DO $$
BEGIN
    -- Check that replacement functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'func_claim_available_task') THEN
        RAISE EXCEPTION 'func_claim_available_task does not exist - cannot remove old claim functions';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'func_mark_task_complete') THEN
        RAISE EXCEPTION 'func_mark_task_complete does not exist - cannot remove old completion function';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'add_generation_to_shot') THEN
        RAISE EXCEPTION 'add_generation_to_shot does not exist - cannot remove old generation functions';
    END IF;
END $$;

-- 1. Remove obsolete task claiming functions (replaced by func_claim_available_task)
DROP FUNCTION IF EXISTS func_claim_task(text, text);
DROP FUNCTION IF EXISTS func_claim_user_task(text, text, uuid);

-- 2. Remove obsolete task completion function (replaced by func_mark_task_complete/failed)
DROP FUNCTION IF EXISTS complete_task_with_timing(uuid, text);

-- 3. Remove obsolete generation-to-shot functions (replaced by add_generation_to_shot)
DROP FUNCTION IF EXISTS associate_generation_with_shot(uuid, uuid);
DROP FUNCTION IF EXISTS position_existing_generation_in_shot(uuid, uuid);

-- 4. Remove noop broadcast triggers that are no longer needed
-- These were replaced by Supabase Realtime
DROP TRIGGER IF EXISTS trigger_broadcast_generation_created ON generations;
DROP TRIGGER IF EXISTS trigger_noop_broadcast_generation_created ON generations;
DROP FUNCTION IF EXISTS noop_broadcast_generation_created();

DROP TRIGGER IF EXISTS trigger_broadcast_task_status ON tasks;
DROP TRIGGER IF EXISTS trigger_noop_broadcast_task_status ON tasks;
DROP FUNCTION IF EXISTS noop_broadcast_task_status();

-- 5. Optional: Remove helper functions if not used elsewhere
-- Note: Keeping bytea_to_text and text_to_bytea as they might be used by extensions
-- Note: Keeping all http_* functions as they're from the http extension
-- Note: Keeping verify_api_token as it's used by RLS policies
-- Note: Keeping all prevent_* and refresh_* triggers as they're security-related

-- Document the canonical functions that remain:
COMMENT ON FUNCTION func_claim_available_task(text) IS 'Primary function for workers to claim tasks from the queue. Replaces func_claim_task and func_claim_user_task.';
COMMENT ON FUNCTION func_mark_task_complete(uuid, jsonb) IS 'Primary function to mark a task as completed with results. Replaces complete_task_with_timing.';
COMMENT ON FUNCTION func_mark_task_failed(uuid, text) IS 'Primary function to mark a task as failed with error message.';
COMMENT ON FUNCTION add_generation_to_shot(uuid, uuid, boolean) IS 'Primary function to link a generation to a shot with optional positioning. Replaces associate_generation_with_shot and position_existing_generation_in_shot.'; 