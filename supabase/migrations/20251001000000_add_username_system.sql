-- Add username system to users table
-- This migration adds username support and sanitization for Discord handles

-- Add username column to users table
ALTER TABLE users ADD COLUMN username text UNIQUE;

-- Create function to sanitize Discord handles into domain-safe usernames
CREATE OR REPLACE FUNCTION sanitize_discord_handle(handle text)
RETURNS text AS $$
DECLARE
  sanitized text;
  counter integer := 0;
  base_username text;
  final_username text;
BEGIN
  -- Handle null or empty input
  IF handle IS NULL OR trim(handle) = '' THEN
    RETURN 'user';
  END IF;
  
  -- Start with the input handle
  sanitized := trim(handle);
  
  -- Remove Discord discriminator (everything after and including #)
  sanitized := split_part(sanitized, '#', 1);
  
  -- Convert to lowercase
  sanitized := lower(sanitized);
  
  -- Replace problematic characters with underscores
  -- Remove: @, #, :, `, spaces, and other special chars not allowed in domains
  sanitized := regexp_replace(sanitized, '[^a-z0-9_-]', '_', 'g');
  
  -- Remove multiple consecutive underscores
  sanitized := regexp_replace(sanitized, '_+', '_', 'g');
  
  -- Remove leading/trailing underscores and hyphens
  sanitized := trim(sanitized, '_-');
  
  -- Ensure minimum length (pad with random suffix if too short)
  IF length(sanitized) < 2 THEN
    sanitized := sanitized || '_user';
  END IF;
  
  -- Ensure maximum length (truncate if too long)
  IF length(sanitized) > 30 THEN
    sanitized := substring(sanitized, 1, 30);
  END IF;
  
  -- Remove trailing underscores after truncation
  sanitized := rtrim(sanitized, '_-');
  
  -- Store base username for collision handling
  base_username := sanitized;
  final_username := base_username;
  
  -- Handle collisions by appending numbers
  WHILE EXISTS (SELECT 1 FROM users WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || '_' || counter::text;
    
    -- Ensure we don't exceed length limit with counter
    IF length(final_username) > 32 THEN
      base_username := substring(base_username, 1, 32 - length('_' || counter::text));
      final_username := base_username || '_' || counter::text;
    END IF;
    
    -- Safety check to prevent infinite loops
    IF counter > 9999 THEN
      final_username := 'user_' || extract(epoch from now())::integer::text;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Create function to extract Discord username from auth metadata
CREATE OR REPLACE FUNCTION extract_discord_username(jwt_claims jsonb, user_metadata jsonb)
RETURNS text AS $$
DECLARE
  discord_username text;
  provider_data jsonb;
BEGIN
  -- Try to get Discord username from various possible locations in JWT
  -- Check user_metadata first (most reliable for Discord)
  discord_username := user_metadata ->> 'preferred_username';
  
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := user_metadata ->> 'username';
  END IF;
  
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := user_metadata ->> 'user_name';
  END IF;
  
  -- Check app_metadata for provider-specific data
  IF discord_username IS NULL OR discord_username = '' THEN
    provider_data := (jwt_claims -> 'app_metadata' -> 'provider_data');
    IF provider_data IS NOT NULL THEN
      discord_username := provider_data ->> 'username';
    END IF;
  END IF;
  
  -- Fallback to name or email if no Discord username found
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := COALESCE(
      user_metadata ->> 'full_name',
      user_metadata ->> 'name',
      jwt_claims ->> 'email'
    );
  END IF;
  
  -- Final fallback
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := 'user';
  END IF;
  
  RETURN discord_username;
END;
$$ LANGUAGE plpgsql;

-- Update the user creation function to include username generation
CREATE OR REPLACE FUNCTION create_user_record_if_not_exists()
RETURNS void AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  user_username text;
  discord_handle text;
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
  
  -- Extract Discord username and sanitize it
  discord_handle := extract_discord_username(jwt_claims, user_metadata);
  user_username := sanitize_discord_handle(discord_handle);
  
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
  INSERT INTO users (id, name, email, username, credits, given_credits, settings, onboarding)
  VALUES (current_user_id, user_name, user_email, user_username, 0, false, default_settings, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to generate usernames for existing users
CREATE OR REPLACE FUNCTION generate_usernames_for_existing_users()
RETURNS void AS $$
DECLARE
  user_record record;
  generated_username text;
BEGIN
  -- Loop through all users without usernames
  FOR user_record IN 
    SELECT id, name, email 
    FROM users 
    WHERE username IS NULL
  LOOP
    -- Generate username based on existing name or email
    generated_username := sanitize_discord_handle(
      COALESCE(user_record.name, user_record.email, 'user')
    );
    
    -- Update the user with the generated username
    UPDATE users 
    SET username = generated_username 
    WHERE id = user_record.id;
    
    -- Log the update (optional, for debugging)
    RAISE NOTICE 'Generated username % for user %', generated_username, user_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to populate usernames for existing users
SELECT generate_usernames_for_existing_users();

-- Create index on username for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Grant permissions
GRANT EXECUTE ON FUNCTION sanitize_discord_handle(text) TO authenticated;
GRANT EXECUTE ON FUNCTION extract_discord_username(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO anon;
