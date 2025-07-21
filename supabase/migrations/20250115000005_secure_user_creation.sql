-- Replace the insecure user creation policy with a more secure approach
-- This removes direct INSERT permissions and uses secure functions instead

-- Remove the potentially insecure policy that allows direct user creation
DROP POLICY IF EXISTS "Authenticated users can create their own user record" ON users;

-- Create a secure function that handles user record creation
CREATE OR REPLACE FUNCTION create_user_record_if_not_exists()
RETURNS void AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
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
  
  -- Get user info from auth metadata
  user_email := COALESCE(auth.jwt() ->> 'email', '');
  user_name := COALESCE(
    auth.jwt() ->> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'user_metadata' ->> 'name', 
    auth.jwt() ->> 'email',
    'User'
  );
  
  -- Create user record with SECURITY DEFINER privileges
  INSERT INTO users (id, name, email, credits)
  VALUES (current_user_id, user_name, user_email, 0)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission only to authenticated users
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO authenticated;

-- Update the project creation trigger to use the secure function
CREATE OR REPLACE FUNCTION auto_create_user_before_project()
RETURNS TRIGGER AS $$
BEGIN
  -- Use the secure function to create user if needed
  PERFORM create_user_record_if_not_exists();
  
  -- Double-check that user exists (should always pass now)
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'User record could not be created for user_id: %', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 