-- Drop the task_cost_configs table as it's been replaced by task_types table with billing_type support
-- This migration is safe to run as all references have been updated to use task_types

-- Drop indexes first
DROP INDEX IF EXISTS idx_task_cost_configs_task_type;
DROP INDEX IF EXISTS idx_task_cost_configs_category;
DROP INDEX IF EXISTS idx_task_cost_configs_active;

-- Drop the table
DROP TABLE IF EXISTS task_cost_configs;
