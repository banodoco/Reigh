-- Create workers table and add worker_id to tasks table
-- This supports the task claiming system that tracks which worker is processing a task

-- Create workers table to track worker instances
CREATE TABLE IF NOT EXISTS public.workers (
    id TEXT PRIMARY KEY,
    instance_type TEXT NOT NULL, -- 'edge', 'server', 'manual', etc.
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive', 'terminated')),
    metadata JSONB DEFAULT '{}'
);

-- Add worker_id column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS worker_id TEXT REFERENCES public.workers(id) ON DELETE SET NULL;

-- Create index for better query performance on worker_id
CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON public.tasks(worker_id);

-- Create index for worker status queries
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON public.workers(last_heartbeat);

-- Enable RLS for workers table (if RLS is enabled globally)
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Create policy for workers - service role can manage all workers
CREATE POLICY "Service role can manage workers" ON public.workers
    FOR ALL USING (auth.role() = 'service_role');

-- Create policy for authenticated users to view workers (read-only)
CREATE POLICY "Authenticated users can view workers" ON public.workers
    FOR SELECT USING (auth.role() = 'authenticated'); 