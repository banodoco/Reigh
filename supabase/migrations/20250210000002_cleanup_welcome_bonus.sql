-- Cleanup migration for welcome bonus implementation
-- The previous migration (20250210000000) automatically granted credits in user creation
-- This migration updates existing users who received the old-style welcome bonus

-- Update existing users who received the old automatic welcome bonus
-- to have their given_credits field set to true
UPDATE users 
SET given_credits = true 
WHERE id IN (
  SELECT DISTINCT user_id 
  FROM credits_ledger 
  WHERE type = 'manual' 
  AND metadata->>'description' = 'Welcome bonus'
  AND metadata->>'granted_by' = 'system'
);

-- Add comment explaining the migration history
COMMENT ON COLUMN users.given_credits IS 'Tracks whether user has received welcome bonus. Replaces automatic credit granting in user creation function (see migration 20250210000000 for old approach).'; 