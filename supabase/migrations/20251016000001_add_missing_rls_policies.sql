-- Add missing RLS policies for generations table and fix shared_generations policy
-- Critical security fixes for share feature

-- ============================================================================
-- 1. Enable RLS on generations table if not already enabled
-- ============================================================================
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Add RLS policies for generations table
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own generations" ON generations;
DROP POLICY IF EXISTS "Users can insert generations for their projects" ON generations;
DROP POLICY IF EXISTS "Users can insert generations for their tasks" ON generations;
DROP POLICY IF EXISTS "Users can update their own generations" ON generations;
DROP POLICY IF EXISTS "Users can delete their own generations" ON generations;
DROP POLICY IF EXISTS "Service role can manage all generations" ON generations;

-- Users can view their own generations (through tasks -> projects)
CREATE POLICY "Users can view their own generations" ON generations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can insert generations ONLY for their own projects
CREATE POLICY "Users can insert generations for their projects" ON generations
  FOR INSERT
  WITH CHECK (
    -- Verify project_id belongs to user
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can update their own generations
CREATE POLICY "Users can update their own generations" ON generations
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own generations
CREATE POLICY "Users can delete their own generations" ON generations
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "Service role can manage all generations" ON generations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. Fix shared_generations INSERT policy to verify ownership
-- ============================================================================

-- Drop the weak policy
DROP POLICY IF EXISTS "Users can create shares for their generations" ON shared_generations;

-- Create secure policy that verifies user owns the generation
CREATE POLICY "Users can create shares for their generations" ON shared_generations
  FOR INSERT
  WITH CHECK (
    -- User must set creator_id to their own ID
    auth.uid() = creator_id
    -- AND the generation must belong to them (through project)
    AND EXISTS (
      SELECT 1 
      FROM generations g
      JOIN projects p ON p.id = g.project_id
      WHERE g.id = generation_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Comments
-- ============================================================================

COMMENT ON POLICY "Users can insert generations for their projects" ON generations IS 
  'Ensures users can only create generations in their own projects. Critical for copy-to-account security.';

COMMENT ON POLICY "Users can create shares for their generations" ON shared_generations IS 
  'Verifies user owns the generation before allowing them to create a share. Prevents sharing other users'' content.';

