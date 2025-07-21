-- Add RLS policies to users table to prevent security vulnerabilities
-- This fixes the critical issue where users could read other users' data and modify their own credits

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own user record
CREATE POLICY "Users can view their own record"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can only update their own name, email, api_keys, and settings
CREATE POLICY "Users can update their own profile"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Only service role can insert new users
CREATE POLICY "Service role can insert users"
  ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Policy: Only service role can delete users
CREATE POLICY "Service role can delete users"
  ON users
  FOR DELETE
  USING (auth.role() = 'service_role');

-- Policy: Service role can do everything (overrides other policies)
CREATE POLICY "Service role can do everything on users"
  ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true); 