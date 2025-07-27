-- Add default settings to user creation function
-- This ensures new users have proper paneLocks settings with tasks set to true

CREATE OR REPLACE FUNCTION create_user_record_if_not_exists()
RETURNS void AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  jwt_claims jsonb;
  user_metadata jsonb;
  default_settings jsonb;
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
  
  -- Set default settings with paneLocks
  default_settings := jsonb_build_object(
    'ui', jsonb_build_object(
      'paneLocks', jsonb_build_object(
        'gens', false,
        'shots', false,
        'tasks', true
      )
    ),
    'user-preferences', jsonb_build_object()
  );
  
  -- Create user record with SECURITY DEFINER privileges
  -- No automatic credits - will be handled by grant-credits function
  INSERT INTO users (id, name, email, credits, given_credits, settings)
  VALUES (current_user_id, user_name, user_email, 0, false, default_settings)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO anon;

-- Update existing users who don't have proper UI settings
-- This ensures all existing users get the default paneLocks structure
UPDATE users 
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'ui', 
  COALESCE(settings->'ui', '{}'::jsonb) || jsonb_build_object(
    'paneLocks', 
    COALESCE(settings->'ui'->'paneLocks', '{}'::jsonb) || jsonb_build_object(
      'gens', COALESCE((settings->'ui'->'paneLocks'->>'gens')::boolean, false),
      'shots', COALESCE((settings->'ui'->'paneLocks'->>'shots')::boolean, false),
      'tasks', COALESCE((settings->'ui'->'paneLocks'->>'tasks')::boolean, true)
    )
  )
)
WHERE settings->'ui'->'paneLocks' IS NULL 
   OR settings->'ui'->'paneLocks'->>'tasks' IS NULL; 