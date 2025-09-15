-- Debug script to check thumbnail generation trigger
-- Run this in Supabase SQL Editor to debug the issue

-- 1. Check if http extension exists
SELECT * FROM pg_extension WHERE extname = 'http';

-- 2. Check if the trigger function exists
SELECT proname, prosrc FROM pg_proc WHERE proname = 'create_generation_on_task_complete';

-- 3. Check if the trigger is attached to the tasks table
SELECT tgname, tgfoid::regproc as trigger_function, tgenabled 
FROM pg_trigger 
WHERE tgrelid = 'tasks'::regclass;

-- 4. Check recent completed tasks that should trigger thumbnail generation
SELECT 
    id, 
    task_type, 
    status, 
    generation_created,
    created_at,
    updated_at,
    CASE 
        WHEN task_type IN (
            SELECT name FROM task_types WHERE category = 'generation'
        ) THEN 'Should trigger'
        ELSE 'Will not trigger'
    END as trigger_status
FROM tasks 
WHERE status = 'Complete' 
ORDER BY created_at DESC 
LIMIT 10;

-- 5. Check task_types with generation category
SELECT name, category, tool_type, is_active 
FROM task_types 
WHERE category = 'generation';

-- 6. Check if there are any generations that should have thumbnails but don't
SELECT 
    g.id,
    g.type,
    g.location,
    g.thumbnail_url,
    g.created_at,
    CASE 
        WHEN g.thumbnail_url IS NOT NULL THEN 'Has thumbnail'
        WHEN g.type = 'image' THEN 'Missing thumbnail'
        ELSE 'Not applicable'
    END as thumbnail_info
FROM generations g
WHERE g.created_at > NOW() - INTERVAL '1 day'
ORDER BY g.created_at DESC
LIMIT 10;

-- 7. Check database configuration settings
SELECT 
    name,
    setting,
    CASE 
        WHEN name = 'app.supabase_url' AND setting IS NOT NULL THEN 'Configured'
        WHEN name = 'app.service_role_key' AND setting IS NOT NULL THEN 'Configured'
        ELSE 'Missing'
    END as status
FROM pg_settings 
WHERE name IN ('app.supabase_url', 'app.service_role_key')
UNION ALL
SELECT 
    'app.supabase_url' as name,
    current_setting('app.supabase_url', true) as setting,
    CASE 
        WHEN current_setting('app.supabase_url', true) IS NOT NULL THEN 'Available'
        ELSE 'Not set'
    END as status
UNION ALL
SELECT 
    'app.service_role_key' as name,
    'HIDDEN' as setting,
    CASE 
        WHEN current_setting('app.service_role_key', true) IS NOT NULL THEN 'Available'
        ELSE 'Not set'
    END as status;
