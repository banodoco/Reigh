-- =====================================================================
-- Add 'dev_agent' as a valid source type for system_logs
-- This allows developer tooling / agent-driven logs to be persisted.
-- =====================================================================

ALTER TABLE system_logs
DROP CONSTRAINT IF EXISTS valid_source_type;

ALTER TABLE system_logs
ADD CONSTRAINT valid_source_type
CHECK (source_type IN (
  'orchestrator_gpu',
  'orchestrator_api',
  'worker',
  'edge_function',
  'browser',
  'dev_agent'
));

COMMENT ON COLUMN system_logs.source_type IS 'Type of source: orchestrator_gpu, orchestrator_api, worker, edge_function, browser, or dev_agent';

