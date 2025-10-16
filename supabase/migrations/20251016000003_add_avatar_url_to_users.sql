-- Add avatar_url to users for profile pictures
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;


