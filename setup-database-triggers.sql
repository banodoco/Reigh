-- Setup script for database trigger configuration
-- Run this in your Supabase SQL editor to configure the triggers

-- Set the Supabase URL and service role key for trigger functions
-- Replace with your actual values:

-- For local development:
-- ALTER DATABASE postgres SET app.supabase_url = 'http://localhost:54321';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-local-service-role-key';

-- For production (replace with your actual Supabase project URL and key):
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project-ref.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

-- Example setup commands (update with your values):
-- ALTER DATABASE postgres SET app.supabase_url = 'https://wczysqzxlwdndgxitrvc.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key-here';

-- Verify the settings are applied:
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE 'app.%';

-- Test the trigger setup by checking if the functions exist:
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('process_completed_task_trigger', 'broadcast_task_status_update');

-- Check if triggers are created:
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname IN ('trigger_process_completed_tasks', 'trigger_broadcast_task_status'); 