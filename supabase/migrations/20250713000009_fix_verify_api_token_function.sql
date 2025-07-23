-- Fix the verify_api_token function parameter name
BEGIN;

-- Drop the old function with the old parameter name
DROP FUNCTION IF EXISTS public.verify_api_token(text);

-- Create the new function with the correct implementation
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

COMMIT; 