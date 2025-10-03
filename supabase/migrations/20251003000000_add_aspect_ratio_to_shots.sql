-- Add aspect_ratio column to shots table
-- This allows shots to have their own aspect ratio independent of project settings

ALTER TABLE shots ADD COLUMN IF NOT EXISTS aspect_ratio TEXT;

-- Comment describing the column
COMMENT ON COLUMN shots.aspect_ratio IS 'Aspect ratio for shot video generation (e.g., 16:9, 3:2). If null, inherits from project.';

