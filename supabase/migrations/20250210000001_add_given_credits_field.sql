-- Add given_credits field to users table for tracking welcome bonus
-- This replaces the previous welcome bonus approach with a cleaner method

-- Add given_credits boolean field to users table
ALTER TABLE users ADD COLUMN given_credits boolean NOT NULL DEFAULT false;

-- Revert the user creation function to not automatically grant credits
CREATE OR REPLACE FUNCTION create_user_record_if_not_exists()
RETURNS void AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  jwt_claims jsonb;
  user_metadata jsonb;
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
  -- No automatic credits - will be handled by grant-credits function
  INSERT INTO users (id, name, email, credits, given_credits)
  VALUES (current_user_id, user_name, user_email, 0, false)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO anon; 