-- ============================================================================
-- RATE LIMITING INFRASTRUCTURE
-- ============================================================================
-- Provides database-backed rate limiting for edge functions.
-- Uses a sliding window counter pattern for accurate rate limiting.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE RATE LIMITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup of old entries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- ============================================================================
-- 2. CREATE ATOMIC RATE LIMIT CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ := v_now - (p_window_seconds || ' seconds')::INTERVAL;
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_allowed BOOLEAN;
BEGIN
  -- Upsert: increment if within window, reset if outside window
  INSERT INTO rate_limits (key, count, window_start, updated_at)
  VALUES (p_key, 1, v_now, v_now)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE 
      WHEN rate_limits.window_start < v_window_start THEN 1  -- Reset counter
      ELSE rate_limits.count + 1  -- Increment
    END,
    window_start = CASE 
      WHEN rate_limits.window_start < v_window_start THEN v_now  -- Reset window
      ELSE rate_limits.window_start  -- Keep existing window
    END,
    updated_at = v_now
  RETURNING count, window_start + (p_window_seconds || ' seconds')::INTERVAL
  INTO v_count, v_reset_at;
  
  v_allowed := v_count <= p_max_requests;
  
  RETURN json_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'reset_at', v_reset_at
  );
END;
$$;

-- Grant execute to authenticated and anon (edge functions use service role anyway)
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO anon;

-- ============================================================================
-- 3. CLEANUP FUNCTION FOR OLD RATE LIMIT ENTRIES
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete entries older than 24 hours (well beyond any rate limit window)
  DELETE FROM rate_limits
  WHERE updated_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Only service role should run cleanup
REVOKE EXECUTE ON FUNCTION cleanup_old_rate_limits() FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_old_rate_limits() FROM authenticated;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate_limits table directly
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. SCHEDULE CLEANUP (Optional - can also be done via pg_cron if available)
-- ============================================================================

-- Note: If pg_cron is enabled, uncomment this:
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_old_rate_limits()');

COMMIT;








