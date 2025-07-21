-- Simplify user_api_tokens table by removing JWT-related fields
-- Drop JWT-related columns and update the token column to store simple 24-character tokens

BEGIN;

-- Remove JWT-related columns and last_used (as requested) - only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_api_tokens') THEN
    ALTER TABLE public.user_api_tokens 
    DROP COLUMN IF EXISTS jti_hash,
    DROP COLUMN IF EXISTS expires_at,
    DROP COLUMN IF EXISTS last_used;
    
    -- Update the token column to be NOT NULL since we'll store the actual token there
    ALTER TABLE public.user_api_tokens 
    ALTER COLUMN token SET NOT NULL;
  END IF;
END $$;

-- Drop the old index on jti_hash
DROP INDEX IF EXISTS idx_user_api_tokens_jti_hash;
DROP INDEX IF EXISTS idx_user_api_tokens_expires_at;

-- Add a unique index on the token column for fast lookups - only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_api_tokens') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_tokens_token ON public.user_api_tokens(token);
  END IF;
END $$;

-- Drop the old function first
DROP FUNCTION IF EXISTS public.verify_api_token(text);

-- Create the new verify_api_token function to work with simple tokens - only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_api_tokens') THEN
    CREATE OR REPLACE FUNCTION public.verify_api_token(p_token text)
    RETURNS boolean AS $FUNC$
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
    $FUNC$ LANGUAGE plpgsql SECURITY DEFINER;
  END IF;
END $$;

-- Grant execute permission to authenticated users - only if function exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.routines WHERE routine_name = 'verify_api_token') THEN
    GRANT EXECUTE ON FUNCTION public.verify_api_token(text) TO authenticated;
  END IF;
END $$;

COMMIT; 