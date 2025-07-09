-- Simplify user_api_tokens table by removing JWT-related fields
-- Drop JWT-related columns and update the token column to store simple 24-character tokens

BEGIN;

-- Remove JWT-related columns and last_used (as requested)
ALTER TABLE public.user_api_tokens 
DROP COLUMN IF EXISTS jti_hash,
DROP COLUMN IF EXISTS expires_at,
DROP COLUMN IF EXISTS last_used;

-- Update the token column to be NOT NULL since we'll store the actual token there
ALTER TABLE public.user_api_tokens 
ALTER COLUMN token SET NOT NULL;

-- Drop the old index on jti_hash
DROP INDEX IF EXISTS idx_user_api_tokens_jti_hash;
DROP INDEX IF EXISTS idx_user_api_tokens_expires_at;

-- Add a unique index on the token column for fast lookups
CREATE UNIQUE INDEX idx_user_api_tokens_token ON public.user_api_tokens(token);

-- Drop the old function first
DROP FUNCTION IF EXISTS public.verify_api_token(text);

-- Create the new verify_api_token function to work with simple tokens
CREATE OR REPLACE FUNCTION public.verify_api_token(p_token text)
RETURNS boolean AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Check if token exists
  SELECT EXISTS(
    SELECT 1 
    FROM public.user_api_tokens
    WHERE token = p_token
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_api_token(text) TO authenticated;

COMMIT; 