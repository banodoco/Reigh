-- Optimize welcome bonus flow with single atomic database function
-- This replaces the multi-step client-side flow with a single database call
-- Significantly improves performance, especially on mobile

CREATE OR REPLACE FUNCTION check_and_grant_welcome_bonus()
RETURNS TABLE(
  granted boolean,
  already_had_bonus boolean,
  credits_balance numeric(10,3),
  message text
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  user_record record;
  new_balance numeric(10,3);
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Exit if no authenticated user
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0, 'No authenticated user'::text;
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
  
  -- Grant welcome bonus atomically
  BEGIN
    -- Add credits to ledger
    INSERT INTO credits_ledger (user_id, amount, type, metadata)
    VALUES (
      current_user_id,
      500, -- $5.00 in credits (500 cents)
      'manual',
      jsonb_build_object(
        'description', 'Welcome bonus',
        'granted_by', 'system',
        'granted_at', now()
      )
    );
    
    -- Update user credits balance and mark as having received welcome bonus
    UPDATE users 
    SET 
      credits = credits + 500,
      given_credits = true
    WHERE id = current_user_id
    RETURNING credits INTO new_balance;
    
    -- Return success
    RETURN QUERY SELECT true, false, new_balance, 'Welcome bonus granted successfully'::text;
    
  EXCEPTION WHEN OTHERS THEN
    -- If anything fails, return error
    RETURN QUERY SELECT false, false, user_record.credits, 'Error granting welcome bonus: ' || SQLERRM;
  END;
  
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_and_grant_welcome_bonus() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION check_and_grant_welcome_bonus() IS 'Atomically checks and grants welcome bonus to new users. Returns status and updated credits balance.';
