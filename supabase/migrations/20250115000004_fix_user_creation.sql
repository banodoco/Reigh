-- Fix user creation issues by allowing authenticated users to create their own records
-- This resolves the foreign key constraint violations and 406 errors

-- Temporarily allow authenticated users to insert their own user records
CREATE POLICY "Authenticated users can create their own user record"
  ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create a function to ensure user record exists
CREATE OR REPLACE FUNCTION ensure_user_exists()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user record exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) THEN
    -- Get user info from auth
    INSERT INTO users (id, name, email, credits)
    VALUES (
      auth.uid(),
      COALESCE(auth.jwt() ->> 'user_metadata' ->> 'full_name', auth.jwt() ->> 'email', 'User'),
      auth.jwt() ->> 'email',
      0
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create user records when needed
-- This will run before any insert on projects table
CREATE OR REPLACE FUNCTION auto_create_user_before_project()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure the user record exists before creating a project
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    INSERT INTO users (id, name, email, credits)
    VALUES (
      NEW.user_id,
      'User',
      '',
      0
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_create_user_trigger
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_user_before_project(); 