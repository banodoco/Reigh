-- Migrate generation creation from DB triggers to Edge Function
-- AGGRESSIVE APPROACH: Drop all legacy triggers and functions in one migration
-- This migration removes the old system and relies on complete_task edge function

-- 1) Drop the main generation creation trigger and function
DROP TRIGGER IF EXISTS trigger_create_generation_on_task_complete ON tasks;
DROP FUNCTION IF EXISTS create_generation_on_task_complete();

-- 2) Drop legacy realtime broadcast triggers (currently no-op anyway)
DROP TRIGGER IF EXISTS trigger_broadcast_generation_created ON generations;
DROP FUNCTION IF EXISTS noop_broadcast_generation_created();

DROP TRIGGER IF EXISTS trigger_broadcast_task_status ON tasks;
DROP FUNCTION IF EXISTS noop_broadcast_task_status();

-- 3) Keep add_generation_to_shot RPC - still needed by edge function
-- (This RPC is still used by the edge function for shot linking)

-- 4) Add comment explaining the migration
COMMENT ON FUNCTION add_generation_to_shot IS 
'RPC function for linking generations to shots. Used by complete_task edge function after migration from DB triggers (2025-09-17).';

-- Log the migration completion
SELECT 'Migration complete: Generation creation moved from DB triggers to complete_task edge function' as status;
