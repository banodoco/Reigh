-- Create dev_tasks table for tracking development work
CREATE TABLE dev_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' 
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    area TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_dev_tasks_status ON dev_tasks(status);
CREATE INDEX idx_dev_tasks_area ON dev_tasks(area) WHERE area IS NOT NULL;
CREATE INDEX idx_dev_tasks_created ON dev_tasks(created_at DESC);

-- Enable RLS
ALTER TABLE dev_tasks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can manage dev_tasks" ON dev_tasks
    FOR ALL USING (auth.role() = 'authenticated');

-- Allow service role full access
CREATE POLICY "Service role can manage dev_tasks" ON dev_tasks
    FOR ALL USING (auth.role() = 'service_role');
