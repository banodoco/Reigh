-- Add critical performance indexes for generations table queries
-- These indexes will dramatically improve the 20+ second query times

-- Enable required extensions first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Composite index for the most common query pattern (project_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_generations_project_created_desc 
ON generations (project_id, created_at DESC)
WHERE project_id IS NOT NULL;

-- 2. JSONB index for tool_type filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_generations_params_tool_type 
ON generations USING GIN ((params->'tool_type'))
WHERE params IS NOT NULL;

-- 3. JSONB index for prompt searching (expensive text search)
CREATE INDEX IF NOT EXISTS idx_generations_prompt_search 
ON generations USING GIN ((params->'originalParams'->'orchestrator_details'->>'prompt') gin_trgm_ops)
WHERE params->'originalParams'->'orchestrator_details'->>'prompt' IS NOT NULL;

-- 4. Index for type filtering (video vs image)
CREATE INDEX IF NOT EXISTS idx_generations_type_filter 
ON generations (type)
WHERE type IS NOT NULL;

-- 5. Composite index for starred filtering with project
CREATE INDEX IF NOT EXISTS idx_generations_project_starred_created 
ON generations (project_id, starred, created_at DESC)
WHERE project_id IS NOT NULL AND starred IS NOT NULL;

-- 6. Composite index for project + type filtering
CREATE INDEX IF NOT EXISTS idx_generations_project_type_created 
ON generations (project_id, type, created_at DESC)
WHERE project_id IS NOT NULL AND type IS NOT NULL;

-- Add comments explaining the performance benefits
COMMENT ON INDEX idx_generations_project_created_desc IS 
'Primary index for pagination queries - covers project_id filtering and created_at ordering';

COMMENT ON INDEX idx_generations_params_tool_type IS 
'GIN index for fast tool_type filtering in JSONB params column';

COMMENT ON INDEX idx_generations_prompt_search IS 
'Trigram GIN index for fast prompt text search using ILIKE queries';

COMMENT ON INDEX idx_generations_type_filter IS 
'Index for video/image type filtering - dramatically speeds up media type filters';

COMMENT ON INDEX idx_generations_project_starred_created IS 
'Composite index for starred-only filtering with proper ordering';

COMMENT ON INDEX idx_generations_project_type_created IS 
'Composite index combining project, type, and ordering for complex filters';
