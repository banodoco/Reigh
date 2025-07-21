-- Protect timing fields from manual manipulation
-- Only service role and system functions should be able to set generation_started_at and generation_processed_at

-- Enable RLS on tasks table if not already enabled
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Users can view their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
DROP POLICY IF EXISTS "Service role can manage all tasks" ON tasks;

-- Users can view their own tasks (through projects)
CREATE POLICY "Users can view their own tasks" ON tasks
  FOR SELECT
  USING (
    auth.uid() = (
      SELECT p.user_id 
      FROM projects p 
      WHERE p.id = tasks.project_id
    )
  );

-- Users can create tasks for their own projects
CREATE POLICY "Users can create tasks" ON tasks
  FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT p.user_id 
      FROM projects p 
      WHERE p.id = tasks.project_id
    )
  );

-- Users can update their own tasks but NOT timing fields
CREATE POLICY "Users can update their own tasks (no timing)" ON tasks
  FOR UPDATE
  USING (
    auth.uid() = (
      SELECT p.user_id 
      FROM projects p 
      WHERE p.id = tasks.project_id
    )
  );

-- Service role can do everything
CREATE POLICY "Service role can manage all tasks" ON tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create a trigger to prevent direct timing manipulation via SQL
CREATE OR REPLACE FUNCTION prevent_timing_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if this is from a system function (claim/complete)
  IF current_setting('application_name', true) IN ('claim_task', 'complete_task') THEN
    RETURN NEW;
  END IF;
  
  -- Block direct timing changes by users
  IF TG_OP = 'UPDATE' AND (
    OLD.generation_started_at IS DISTINCT FROM NEW.generation_started_at OR
    OLD.generation_processed_at IS DISTINCT FROM NEW.generation_processed_at
  ) THEN
    RAISE EXCEPTION 'Timing fields can only be modified by system functions';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply the trigger
DROP TRIGGER IF EXISTS prevent_timing_manipulation_trigger ON tasks;
CREATE TRIGGER prevent_timing_manipulation_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_timing_manipulation(); 