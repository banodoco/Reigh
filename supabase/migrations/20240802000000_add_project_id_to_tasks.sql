-- Add `project_id` column to `tasks` if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns 
    WHERE table_name = 'tasks'
      AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.tasks
      ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

    -- Optional index for faster queries by project & status
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON public.tasks(project_id, status);
  END IF;
END $$; 