-- Add thumbnail_url column to generations table
-- This will store thumbnail URLs extracted from task parameters

-- Add the thumbnail_url column
ALTER TABLE generations 
ADD COLUMN thumbnail_url text;

-- Add a comment to document the purpose
COMMENT ON COLUMN generations.thumbnail_url IS 'URL to thumbnail image for the generation, extracted from task parameters';

-- Create an index for faster queries when filtering by thumbnail presence
CREATE INDEX idx_generations_thumbnail_url ON generations(thumbnail_url) 
WHERE thumbnail_url IS NOT NULL;

-- Verify the column was added
SELECT 'thumbnail_url column added to generations table' as status;
