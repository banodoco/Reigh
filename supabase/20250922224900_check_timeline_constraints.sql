-- Check what constraints exist on the shot_generations table
SELECT 
  constraint_name,
  constraint_type,
  constraint_def
FROM information_schema.table_constraints 
WHERE table_name = 'shot_generations' 
  AND constraint_type = 'CHECK';

-- Also check the column constraints
SELECT 
  column_name,
  column_default,
  is_nullable,
  data_type
FROM information_schema.columns 
WHERE table_name = 'shot_generations' 
  AND column_name = 'timeline_frame';
