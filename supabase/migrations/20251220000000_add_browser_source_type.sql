-- Add 'browser' as a valid source type for system_logs
-- This allows client-side logs to be persisted for debugging

ALTER TABLE system_logs
DROP CONSTRAINT IF EXISTS valid_source_type;

ALTER TABLE system_logs
ADD CONSTRAINT valid_source_type
CHECK (source_type IN ('orchestrator_gpu', 'orchestrator_api', 'worker', 'edge_function', 'browser'));

COMMENT ON COLUMN system_logs.source_type IS 'Type of source: orchestrator_gpu, orchestrator_api, worker, edge_function, or browser';
