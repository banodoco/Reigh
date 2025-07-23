-- Fix user_api_tokens table structure
-- This migration ensures the table has the simplified structure expected by the edge function

BEGIN;

-- First, let's check if we need to fix the table
DO $$
BEGIN
  -- Check if the old columns still exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_api_tokens' 
    AND column_name IN ('jti_hash', 'expires_at', 'last_used')
  ) THEN
    -- Drop the old columns
    ALTER TABLE public.user_api_tokens 
    DROP COLUMN IF EXISTS jti_hash CASCADE,
    DROP COLUMN IF EXISTS expires_at CASCADE,
    DROP COLUMN IF EXISTS last_used CASCADE;
    
    RAISE NOTICE 'Dropped old JWT-related columns from user_api_tokens table';
  END IF;
  
  -- Ensure token column exists and is NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_api_tokens' 
    AND column_name = 'token'
  ) THEN
    -- Make sure token is NOT NULL
    ALTER TABLE public.user_api_tokens 
    ALTER COLUMN token SET NOT NULL;
    
    RAISE NOTICE 'Updated token column to be NOT NULL';
  ELSE
    -- Add token column if it doesn't exist
    ALTER TABLE public.user_api_tokens 
    ADD COLUMN token text NOT NULL;
    
    RAISE NOTICE 'Added token column to user_api_tokens table';
  END IF;
END $$;

-- Recreate indexes
DROP INDEX IF EXISTS idx_user_api_tokens_jti_hash;
DROP INDEX IF EXISTS idx_user_api_tokens_expires_at;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_tokens_token ON public.user_api_tokens(token);

-- Drop the old function first
DROP FUNCTION IF EXISTS public.verify_api_token(text);

-- Create the new verify_api_token function to work with simple tokens
CREATE FUNCTION public.verify_api_token(p_token text)
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

-- Add comment to clarify the new structure
COMMENT ON TABLE public.user_api_tokens IS 'Simplified API tokens table storing user-generated tokens without JWT complexity';

COMMIT; 