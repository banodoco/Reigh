-- ============================================================================
-- CRITICAL SECURITY FIX: Enable RLS on projects and shots tables
-- ============================================================================
-- These tables were created WITHOUT RLS in the base schema, allowing any
-- authenticated user to read/modify ALL projects and shots from ALL users.
-- This migration enables RLS and creates proper ownership-based policies.
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS TABLE - Enable RLS and create policies
-- ============================================================================

-- Enable RLS (will fail gracefully if already enabled)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;
DROP POLICY IF EXISTS "Service role can manage all projects" ON projects;

-- Policy: Users can only view their own projects
CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert projects for themselves
CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own projects
CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can only delete their own projects
CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all projects (for edge functions)
CREATE POLICY "Service role can manage all projects" ON projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. SHOTS TABLE - Enable RLS and create policies
-- ============================================================================

-- Enable RLS
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own shots" ON shots;
DROP POLICY IF EXISTS "Users can insert their own shots" ON shots;
DROP POLICY IF EXISTS "Users can update their own shots" ON shots;
DROP POLICY IF EXISTS "Users can delete their own shots" ON shots;
DROP POLICY IF EXISTS "Service role can manage all shots" ON shots;

-- Policy: Users can view shots that belong to their projects
CREATE POLICY "Users can view their own shots" ON shots
  FOR SELECT
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Policy: Users can insert shots into their own projects
CREATE POLICY "Users can insert their own shots" ON shots
  FOR INSERT
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Policy: Users can update shots in their own projects
CREATE POLICY "Users can update their own shots" ON shots
  FOR UPDATE
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Policy: Users can delete shots from their own projects
CREATE POLICY "Users can delete their own shots" ON shots
  FOR DELETE
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Policy: Service role can manage all shots
CREATE POLICY "Service role can manage all shots" ON shots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. FIX shot_generations POLICY - The existing policy is broken (no user check)
-- ============================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "Users can manage their shot generations" ON shot_generations;

-- Create proper policy that checks ownership through shot -> project -> user
CREATE POLICY "Users can manage their shot generations" ON shot_generations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM shots s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = shot_generations.shot_id
      AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shots s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = shot_generations.shot_id
      AND p.user_id = auth.uid()
    )
  );

-- Policy: Service role can manage all shot_generations
DROP POLICY IF EXISTS "Service role can manage all shot_generations" ON shot_generations;
CREATE POLICY "Service role can manage all shot_generations" ON shot_generations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can view their own projects" ON projects IS 
  'Critical security fix: Users can only access their own projects. Prevents cross-user data leakage.';

COMMENT ON POLICY "Users can view their own shots" ON shots IS 
  'Critical security fix: Users can only access shots within their projects.';

COMMENT ON POLICY "Users can manage their shot generations" ON shot_generations IS 
  'Fixes broken policy: Now properly checks user ownership through shot -> project -> user chain.';

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

DO $$
DECLARE
  projects_rls boolean;
  shots_rls boolean;
  shot_gens_rls boolean;
BEGIN
  -- Check RLS is enabled
  SELECT relrowsecurity INTO projects_rls FROM pg_class WHERE relname = 'projects';
  SELECT relrowsecurity INTO shots_rls FROM pg_class WHERE relname = 'shots';
  SELECT relrowsecurity INTO shot_gens_rls FROM pg_class WHERE relname = 'shot_generations';
  
  IF NOT projects_rls THEN
    RAISE EXCEPTION 'CRITICAL: RLS not enabled on projects table';
  END IF;
  
  IF NOT shots_rls THEN
    RAISE EXCEPTION 'CRITICAL: RLS not enabled on shots table';
  END IF;
  
  IF NOT shot_gens_rls THEN
    RAISE EXCEPTION 'CRITICAL: RLS not enabled on shot_generations table';
  END IF;
  
  RAISE NOTICE '✅ SECURITY FIX APPLIED: RLS enabled on projects, shots, and shot_generations';
  RAISE NOTICE '✅ All ownership policies created successfully';
END $$;





