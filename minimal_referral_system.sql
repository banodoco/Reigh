-- Minimal referral system - just 2 core tables
-- Use users.username directly as referral codes

-- 1. Drop all existing referral tables and start fresh
DROP VIEW IF EXISTS referral_analytics CASCADE;
DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS referral_programs CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS referral_sessions CASCADE;
DROP TABLE IF EXISTS referral_codes CASCADE;
DROP TRIGGER IF EXISTS create_referral_code_trigger ON users;
DROP FUNCTION IF EXISTS create_default_referral_code() CASCADE;
DROP FUNCTION IF EXISTS track_referral_visit(text, inet, text, text, text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS create_referral_from_session(uuid, text, text) CASCADE;

-- 2. Create minimal referral_sessions table - just track visits
CREATE TABLE referral_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_username text NOT NULL, -- Direct reference to users.username
  referrer_user_id uuid REFERENCES users(id),
  visitor_fingerprint text, -- Browser fingerprint for tracking
  session_id text, -- Frontend session ID
  visitor_ip inet,
  first_visit_at timestamptz DEFAULT now(),
  last_visit_at timestamptz DEFAULT now(),
  visit_count integer DEFAULT 1,
  converted_at timestamptz, -- When they signed up
  converted_user_id uuid REFERENCES users(id), -- Who they became
  is_latest_referrer boolean DEFAULT true -- Handle multiple referrers
);

-- 3. Create minimal referrals table - confirmed relationships
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),
  referred_id uuid NOT NULL REFERENCES users(id),
  referrer_username text NOT NULL, -- Cache for easy queries
  session_id uuid REFERENCES referral_sessions(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(referrer_id, referred_id) -- Prevent duplicate referrals
);

-- 4. Simple tracking function
CREATE OR REPLACE FUNCTION track_referral_visit(
  p_referrer_username text,
  p_visitor_fingerprint text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_visitor_ip inet DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  referrer_user_id uuid;
  existing_session RECORD;
  session_uuid uuid;
BEGIN
  -- Find referrer by username
  SELECT id INTO referrer_user_id
  FROM users 
  WHERE username = p_referrer_username;
  
  IF referrer_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check for existing session
  SELECT * INTO existing_session
  FROM referral_sessions
  WHERE (
    (p_visitor_fingerprint IS NOT NULL AND visitor_fingerprint = p_visitor_fingerprint)
    OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    OR (p_visitor_ip IS NOT NULL AND visitor_ip = p_visitor_ip)
  )
  AND converted_at IS NULL
  ORDER BY last_visit_at DESC
  LIMIT 1;
  
  -- Update existing or create new
  IF existing_session.id IS NOT NULL THEN
    -- Mark old sessions as not latest if different referrer
    IF existing_session.referrer_username != p_referrer_username THEN
      UPDATE referral_sessions 
      SET is_latest_referrer = false
      WHERE (
        (p_visitor_fingerprint IS NOT NULL AND visitor_fingerprint = p_visitor_fingerprint)
        OR (p_session_id IS NOT NULL AND session_id = p_session_id)
        OR (p_visitor_ip IS NOT NULL AND visitor_ip = p_visitor_ip)
      )
      AND converted_at IS NULL;
    ELSE
      -- Same referrer, just update visit count
      UPDATE referral_sessions 
      SET 
        visit_count = visit_count + 1,
        last_visit_at = now()
      WHERE id = existing_session.id;
      
      RETURN existing_session.id;
    END IF;
  END IF;
  
  -- Create new session
  INSERT INTO referral_sessions (
    referrer_username,
    referrer_user_id,
    visitor_fingerprint,
    session_id,
    visitor_ip,
    visit_count,
    first_visit_at,
    last_visit_at,
    is_latest_referrer
  ) VALUES (
    p_referrer_username,
    referrer_user_id,
    p_visitor_fingerprint,
    p_session_id,
    p_visitor_ip,
    COALESCE(existing_session.visit_count, 0) + 1,
    COALESCE(existing_session.first_visit_at, now()),
    now(),
    true
  ) RETURNING id INTO session_uuid;
  
  RETURN session_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Simple conversion function
CREATE OR REPLACE FUNCTION create_referral_from_session(
  p_user_id uuid,
  p_session_id text,
  p_fingerprint text
)
RETURNS uuid AS $$
DECLARE
  session_record RECORD;
  referral_uuid uuid;
BEGIN
  -- Find the session that should get credit
  SELECT * INTO session_record
  FROM referral_sessions
  WHERE (
    (p_fingerprint IS NOT NULL AND visitor_fingerprint = p_fingerprint)
    OR (p_session_id IS NOT NULL AND session_id = p_session_id)
  )
  AND converted_at IS NULL
  AND is_latest_referrer = true
  AND referrer_user_id != p_user_id -- No self-referrals
  ORDER BY last_visit_at DESC
  LIMIT 1;
  
  IF session_record.id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Mark session as converted
  UPDATE referral_sessions 
  SET 
    converted_at = now(),
    converted_user_id = p_user_id
  WHERE id = session_record.id;
  
  -- Create referral record
  INSERT INTO referrals (
    referrer_id,
    referred_id,
    referrer_username,
    session_id
  ) VALUES (
    session_record.referrer_user_id,
    p_user_id,
    session_record.referrer_username,
    session_record.id
  ) RETURNING id INTO referral_uuid;
  
  RETURN referral_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Basic indexes
CREATE INDEX idx_referral_sessions_fingerprint ON referral_sessions(visitor_fingerprint);
CREATE INDEX idx_referral_sessions_session_id ON referral_sessions(session_id);
CREATE INDEX idx_referral_sessions_referrer ON referral_sessions(referrer_username);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);

-- 7. Enable RLS
ALTER TABLE referral_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 8. Basic RLS policies
-- Anonymous can only insert sessions
CREATE POLICY "anon_insert_sessions" ON referral_sessions
  FOR INSERT TO anon WITH CHECK (true);

-- Users can view their own data
CREATE POLICY "users_view_own_referrals" ON referrals
  FOR SELECT TO authenticated 
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "users_view_own_sessions" ON referral_sessions
  FOR SELECT TO authenticated 
  USING (referrer_user_id = auth.uid() OR converted_user_id = auth.uid());

-- 9. Grant permissions
GRANT INSERT ON referral_sessions TO anon;
GRANT SELECT ON referral_sessions TO authenticated;
GRANT SELECT ON referrals TO authenticated;
GRANT EXECUTE ON FUNCTION track_referral_visit(text, text, text, inet) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_referral_from_session(uuid, text, text) TO authenticated;

-- 10. Simple analytics view
CREATE VIEW referral_stats AS
SELECT 
  u.id,
  u.username,
  u.name,
  COUNT(DISTINCT rs.id) as total_visits,
  COUNT(DISTINCT r.id) as successful_referrals
FROM users u
LEFT JOIN referral_sessions rs ON u.username = rs.referrer_username
LEFT JOIN referrals r ON u.id = r.referrer_id
WHERE u.username IS NOT NULL
GROUP BY u.id, u.username, u.name;

GRANT SELECT ON referral_stats TO authenticated;
