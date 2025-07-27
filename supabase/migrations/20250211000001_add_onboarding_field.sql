-- Add onboarding field to users table
-- This field will track user onboarding progress and state

ALTER TABLE users ADD COLUMN onboarding jsonb DEFAULT '{}'::jsonb NOT NULL; 