-- Update existing tasks that already have generation records to set generation_created = true
-- This prevents them from being reprocessed after adding the new column

-- For single_image tasks that have existing generation records
UPDATE tasks 
SET generation_created = true 
WHERE task_type = 'single_image' 
  AND status = 'Complete' 
  AND generation_processed_at IS NOT NULL
  AND generation_created = false
  AND EXISTS (
    SELECT 1 FROM generations 
    WHERE generations.tasks @> jsonb_build_array(tasks.id::text)
  );

-- For travel_stitch tasks that have existing generation records  
UPDATE tasks 
SET generation_created = true 
WHERE task_type = 'travel_stitch' 
  AND status = 'Complete' 
  AND generation_processed_at IS NOT NULL
  AND generation_created = false
  AND EXISTS (
    SELECT 1 FROM generations 
    WHERE generations.tasks @> jsonb_build_array(tasks.id::text)
  ); 