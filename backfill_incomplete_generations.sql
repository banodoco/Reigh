-- Backfill script for tasks that are Complete but missing generations
-- Run this immediately after deploying the migration and new edge function
-- This handles any edge cases where tasks completed before the migration

-- First, let's see what we're dealing with
SELECT 
    t.id,
    t.task_type,
    t.status,
    t.generation_created,
    t.output_location,
    t.created_at,
    t.updated_at,
    tt.category,
    tt.tool_type
FROM tasks t
INNER JOIN task_types tt ON tt.name = t.task_type
WHERE t.status = 'Complete'::task_status 
    AND t.generation_created = FALSE
    AND tt.category = 'generation'
    AND t.output_location IS NOT NULL
ORDER BY t.updated_at DESC;

-- If there are any tasks found above, they need to be processed
-- Since the edge function now handles generation creation, we need to either:
-- 1) Call the complete_task edge function again for these tasks (recommended)
-- 2) Or create a one-time edge function to process these specific tasks

-- For now, let's just mark these tasks for manual review
-- You can call complete_task edge function again for each of these task IDs

-- Optional: Create a temporary table to track backfill progress
CREATE TEMP TABLE IF NOT EXISTS backfill_tasks AS
SELECT 
    t.id as task_id,
    t.task_type,
    t.output_location,
    tt.category,
    tt.tool_type,
    'pending' as backfill_status
FROM tasks t
INNER JOIN task_types tt ON tt.name = t.task_type
WHERE t.status = 'Complete'::task_status 
    AND t.generation_created = FALSE
    AND tt.category = 'generation'
    AND t.output_location IS NOT NULL;

-- Show the tasks that need backfill
SELECT 
    COUNT(*) as total_tasks_needing_backfill,
    task_type,
    category,
    tool_type
FROM backfill_tasks
GROUP BY task_type, category, tool_type
ORDER BY total_tasks_needing_backfill DESC;

-- Instructions for manual backfill:
-- For each task_id in the results above, you can either:
-- 1) Re-call the complete_task edge function with the existing file data
-- 2) Or create a simple script that calls createGenerationFromTask directly

SELECT 'Backfill analysis complete. Review the results above and process any incomplete tasks manually.' as instructions;
