-- Update task_cost_configs to use float values instead of integer cents
-- Change base_cost_cents_per_second to base_cost_per_second with decimal type

-- First, add the new column with decimal type
ALTER TABLE task_cost_configs 
ADD COLUMN base_cost_per_second decimal(10,6) NOT NULL DEFAULT 0.000278;

-- Update all existing records to use the new standardized cost
UPDATE task_cost_configs 
SET base_cost_per_second = 0.000278;

-- Drop the old integer column
ALTER TABLE task_cost_configs 
DROP COLUMN base_cost_cents_per_second; 