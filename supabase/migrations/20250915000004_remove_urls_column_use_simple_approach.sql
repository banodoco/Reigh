-- Remove the urls JSON column and helper functions - use simple approach instead
-- Main URL: generations.location
-- Thumbnail URL: generations.thumbnail_url (fallback to location)

-- Drop the helper functions
DROP FUNCTION IF EXISTS get_generation_urls(generations);
DROP FUNCTION IF EXISTS update_generation_urls(uuid, text, text);

-- Drop the index on urls column
DROP INDEX IF EXISTS idx_generations_urls;

-- Remove the urls column
ALTER TABLE generations DROP COLUMN IF EXISTS urls;

-- Verify the column was removed
SELECT 'Removed urls column - using simple approach: location for main, thumbnail_url for thumbnail' as status;
