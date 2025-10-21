-- Fix generations UPDATE policy to include WITH CHECK clause
-- Without WITH CHECK, updates might silently fail due to RLS

-- Drop and recreate the UPDATE policy with WITH CHECK
DROP POLICY IF EXISTS "Users can update their own generations" ON generations;

CREATE POLICY "Users can update their own generations" ON generations
  FOR UPDATE
  USING (
    -- User can see/select the row if it belongs to their project
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- User can update the row if it still belongs to their project after update
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can update their own generations" ON generations IS 
  'Allows users to update generations in their own projects. WITH CHECK ensures the row still belongs to them after update.';

