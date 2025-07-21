-- Fix any existing task_cost_configs that may have wrong values
-- This ensures all records use the correct 0.0278 cents per second

UPDATE task_cost_configs 
SET base_cost_per_second = 0.0278
WHERE base_cost_per_second != 0.0278; 