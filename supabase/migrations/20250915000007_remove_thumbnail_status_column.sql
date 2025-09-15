-- Remove thumbnail_status column as we now handle thumbnails client-side
-- This column was added in migration 20250915000005 but is no longer needed

-- Drop the index first
DROP INDEX IF EXISTS idx_generations_thumbnail_status;

-- Remove the thumbnail_status column
ALTER TABLE generations DROP COLUMN IF EXISTS thumbnail_status;
