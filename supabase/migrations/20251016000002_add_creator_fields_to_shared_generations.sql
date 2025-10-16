-- Add denormalized creator display fields to shared_generations for public rendering
-- Safe to run multiple times

ALTER TABLE shared_generations
  ADD COLUMN IF NOT EXISTS creator_username TEXT,
  ADD COLUMN IF NOT EXISTS creator_name TEXT,
  ADD COLUMN IF NOT EXISTS creator_avatar_url TEXT;

-- Optional: simple index to speed up lookups by share_slug (if not already present)
-- CREATE INDEX IF NOT EXISTS idx_shared_generations_share_slug ON shared_generations(share_slug);


