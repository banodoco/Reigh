-- Add performance indexes for VideoGallery video filtering queries
-- These indexes optimize the shot_generations + generations JOIN with video type filtering

-- Composite index for shot_generations table (covers the main query pattern)
CREATE INDEX IF NOT EXISTS idx_shot_generations_video_lookup 
ON shot_generations (shot_id, position, created_at) 
WHERE generation_id IS NOT NULL;

-- Index on generations.type for video filtering performance
CREATE INDEX IF NOT EXISTS idx_generations_type 
ON generations (type) 
WHERE type IS NOT NULL;

-- Optional: Composite index that might help with the JOIN
CREATE INDEX IF NOT EXISTS idx_shot_generations_join_optimized
ON shot_generations (shot_id, generation_id, position)
WHERE generation_id IS NOT NULL;

-- Add comment explaining the performance improvement
COMMENT ON INDEX idx_shot_generations_video_lookup IS 
'Optimizes VideoGallery queries that filter by shot_id and order by position/created_at';

COMMENT ON INDEX idx_generations_type IS 
'Optimizes video/image filtering in VideoGallery using generation.type LIKE %video%';
