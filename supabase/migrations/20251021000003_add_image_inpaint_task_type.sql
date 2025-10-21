-- Add 'image_inpaint' task type to the task_type enum
-- This enables inpainting tasks where users can paint masks on images
-- and generate new content in the masked areas

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    WHERE t.typname = 'task_type' 
    AND e.enumlabel = 'image_inpaint'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'image_inpaint';
  END IF;
END $$;

