-- =====================================================================
-- Add Cron Job for System Logs Cleanup
-- Created: 2025-01-15
-- Purpose: Schedule daily cleanup of system_logs older than 48 hours
-- =====================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 3 AM
-- This will delete logs older than 48 hours from system_logs table only
SELECT cron.schedule(
    'cleanup_system_logs_daily',
    '0 3 * * *',
    $$SELECT func_cleanup_old_logs(48);$$
);

-- Add comment
COMMENT ON EXTENSION pg_cron IS 'Cron job for cleaning up system_logs table daily at 3 AM UTC';

