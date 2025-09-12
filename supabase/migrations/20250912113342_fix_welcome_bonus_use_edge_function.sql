-- Fix welcome bonus function to only check eligibility, not grant credits
-- Credit granting should be handled by the existing grant-credits edge function

DROP FUNCTION IF EXISTS check_and_grant_welcome_bonus();

CREATE FUNCTION check_welcome_bonus_eligibility()
RETURNS TABLE(
  eligible boolean,
  already_had_bonus boolean,
  current_credits_balance numeric(10,3),
  message text
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  user_record record;
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Exit if no authenticated user
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0::numeric(10,3), 'No authenticated user'::text;
    RETURN;
  END IF;
  
  -- Get user record with current credits and welcome bonus status
  SELECT u.given_credits, u.credits INTO user_record
  FROM users u 
  WHERE u.id = current_user_id;
  
  -- If user doesn't exist, create them first (should not happen with proper auth flow)
  IF NOT FOUND THEN
    PERFORM create_user_record_if_not_exists();
    SELECT u.given_credits, u.credits INTO user_record
    FROM users u 
    WHERE u.id = current_user_id;
  END IF;
  
  -- Check if user already has welcome bonus
  IF user_record.given_credits = true THEN
    RETURN QUERY SELECT false, true, user_record.credits, 'Welcome bonus already granted'::text;
    RETURN;
  END IF;
  
  -- User is eligible for welcome bonus
  RETURN QUERY SELECT true, false, user_record.credits, 'User eligible for welcome bonus'::text;
  
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_welcome_bonus_eligibility() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION check_welcome_bonus_eligibility() IS 'Checks if user is eligible for welcome bonus. Does not grant credits - that should be done via the grant-credits edge function.';
