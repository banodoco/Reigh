-- Add welcome bonus to new user creation
-- This updates the create_user_record_if_not_exists function to automatically grant $5 to new users

CREATE OR REPLACE FUNCTION create_user_record_if_not_exists()
RETURNS void AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  jwt_claims jsonb;
  user_metadata jsonb;
  user_inserted boolean := false;
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Exit if no authenticated user
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if user record already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = current_user_id) THEN
    RETURN;
  END IF;
  
  -- Get JWT claims with proper type casting
  jwt_claims := auth.jwt();
  
  -- Extract user metadata safely
  user_metadata := COALESCE((jwt_claims ->> 'user_metadata')::jsonb, '{}'::jsonb);
  
  -- Get user info from auth metadata with explicit type casting
  user_email := COALESCE(jwt_claims ->> 'email', '');
  user_name := COALESCE(
    user_metadata ->> 'full_name',
    user_metadata ->> 'name', 
    jwt_claims ->> 'email',
    'User'
  );
  
  -- Create user record with SECURITY DEFINER privileges
  INSERT INTO users (id, name, email, credits)
  VALUES (current_user_id, user_name, user_email, 0)
  ON CONFLICT (id) DO NOTHING;
  
  -- Check if the user was actually inserted (not a conflict)
  GET DIAGNOSTICS user_inserted = ROW_COUNT;
  
  -- If user was created, add welcome bonus to credits_ledger
  IF user_inserted OR NOT EXISTS (
    SELECT 1 FROM credits_ledger 
    WHERE user_id = current_user_id 
    AND type = 'manual' 
    AND metadata->>'description' = 'Welcome bonus'
  ) THEN
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
  END IF;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO anon; 