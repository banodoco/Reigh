-- =====================================================================
-- Restrict system_logs to service_role only
-- Created: 2026-01-21
-- Purpose: Prevent regular users from viewing system logs
-- =====================================================================

-- Enable RLS on system_logs (service_role bypasses RLS by default)
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Revoke permissions from authenticated and anon users
REVOKE SELECT, INSERT ON system_logs FROM authenticated, anon;

-- Revoke access to views that expose system_logs data
REVOKE SELECT ON v_recent_errors FROM authenticated, anon;
REVOKE SELECT ON v_worker_log_activity FROM authenticated, anon;

-- Revoke execute on RPC functions that insert logs
-- (Keep for service_role only - workers/orchestrators use service key)
REVOKE EXECUTE ON FUNCTION func_insert_logs_batch FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION func_cleanup_old_logs FROM authenticated, anon;

-- Note: func_worker_heartbeat_with_logs is used by workers with service key
-- so we revoke from authenticated/anon too (specify full signature due to overloads)
REVOKE EXECUTE ON FUNCTION func_worker_heartbeat_with_logs(text, int, int, jsonb, uuid, text) FROM authenticated, anon;

-- Verify service_role still has access
GRANT SELECT, INSERT ON system_logs TO service_role;
GRANT SELECT ON v_recent_errors TO service_role;
GRANT SELECT ON v_worker_log_activity TO service_role;
GRANT EXECUTE ON FUNCTION func_insert_logs_batch TO service_role;
GRANT EXECUTE ON FUNCTION func_worker_heartbeat_with_logs(text, int, int, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION func_cleanup_old_logs TO service_role;

-- Log confirmation
SELECT 'Restricted system_logs access to service_role only' as status;
