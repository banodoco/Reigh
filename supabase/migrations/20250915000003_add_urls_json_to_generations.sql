-- Add optional JSON field to store both main and thumbnail URLs
-- This provides an alternative to using separate columns

ALTER TABLE generations 
ADD COLUMN urls jsonb;

-- Add a comment to document the purpose
COMMENT ON COLUMN generations.urls IS 'JSON object containing mainUrl and thumbnailUrl for easy access: {"mainUrl": "...", "thumbnailUrl": "..."}';

-- Create an index for faster queries when filtering by URL presence
CREATE INDEX idx_generations_urls ON generations USING GIN(urls) 
WHERE urls IS NOT NULL;

-- Create a helper function to extract URLs from the JSON with proper fallbacks
CREATE OR REPLACE FUNCTION get_generation_urls(generation_row generations)
RETURNS TABLE(main_url text, thumbnail_url text) AS $$
BEGIN
  RETURN QUERY SELECT 
    -- Main URL: Use JSON mainUrl if available, otherwise fall back to location column
    COALESCE(generation_row.urls->>'mainUrl', generation_row.location) as main_url,
    -- Thumbnail URL: Use JSON thumbnailUrl if available, then separate thumbnail_url column, then location as final fallback
    COALESCE(generation_row.urls->>'thumbnailUrl', generation_row.thumbnail_url, generation_row.location) as thumbnail_url;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the thumbnail generation function to also populate the urls field
CREATE OR REPLACE FUNCTION update_generation_urls(
  p_generation_id uuid,
  p_main_url text,
  p_thumbnail_url text
)
RETURNS void AS $$
BEGIN
  UPDATE generations 
  SET 
    thumbnail_url = p_thumbnail_url,
    urls = jsonb_build_object(
      'mainUrl', p_main_url,
      'thumbnailUrl', p_thumbnail_url
    )
  WHERE id = p_generation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the column was added
SELECT 'urls JSON column added to generations table with helper functions' as status;
