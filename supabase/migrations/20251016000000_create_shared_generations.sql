-- Create shared_generations table for public sharing of generations
CREATE TABLE IF NOT EXISTS shared_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_slug TEXT UNIQUE NOT NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  
  -- Cached data for faster loading and persistence
  cached_generation_data JSONB,
  cached_task_data JSONB,
  
  -- Ensure one share per generation per user
  UNIQUE(generation_id, creator_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shared_generations_share_slug ON shared_generations(share_slug);
CREATE INDEX IF NOT EXISTS idx_shared_generations_task_id ON shared_generations(task_id);
CREATE INDEX IF NOT EXISTS idx_shared_generations_creator_id ON shared_generations(creator_id);
CREATE INDEX IF NOT EXISTS idx_shared_generations_generation_id ON shared_generations(generation_id);

-- Enable Row Level Security
ALTER TABLE shared_generations ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view shared generations (public shares)
CREATE POLICY "Shared generations are publicly viewable"
  ON shared_generations
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can create shares for their own generations
CREATE POLICY "Users can create shares for their generations"
  ON shared_generations
  FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
  );

-- Policy: Users can update their own shares (e.g., view count)
CREATE POLICY "Users can update their own shares"
  ON shared_generations
  FOR UPDATE
  USING (auth.uid() = creator_id);

-- Policy: Users can delete their own shares
CREATE POLICY "Users can delete their own shares"
  ON shared_generations
  FOR DELETE
  USING (auth.uid() = creator_id);

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_share_view_count(share_slug_param TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE shared_generations
  SET 
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE share_slug = share_slug_param;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION increment_share_view_count(TEXT) TO authenticated, anon;

-- Comment on table
COMMENT ON TABLE shared_generations IS 'Stores publicly shareable links to generations with cached data';
COMMENT ON COLUMN shared_generations.share_slug IS 'Short, URL-friendly unique identifier for the share';
COMMENT ON COLUMN shared_generations.cached_generation_data IS 'Cached generation data (video URL, thumbnail, etc.) for faster loading';
COMMENT ON COLUMN shared_generations.cached_task_data IS 'Cached task parameters for displaying settings without joins';

-- Add columns to tasks and generations to track copied shares
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS copied_from_share TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS copied_from_share TEXT;

COMMENT ON COLUMN tasks.copied_from_share IS 'Share slug if this task was copied from a shared generation';
COMMENT ON COLUMN generations.copied_from_share IS 'Share slug if this generation was copied from a shared generation';

