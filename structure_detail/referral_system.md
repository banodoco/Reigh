# Referral System

## Overview

The referral system tracks when users visit the site via referral links like `reigh.art?from={username}` and converts those visits into confirmed referrals when users sign up. The system is designed to be minimal but robust, focusing on accurate attribution while being easy to extend.

## Architecture

### Core Design Principles

1. **Use existing data**: Leverage `users.username` directly instead of separate referral codes
2. **Minimal tables**: Just 2 core tables for MVP functionality
3. **Accurate attribution**: Handle return visits and multiple referrers correctly
4. **Security first**: Proper RLS policies and secure functions
5. **Extensible**: Easy to add complexity (rewards, programs) when needed

### Database Schema

#### 1. `referral_sessions` Table
Tracks visits from referral links before signup.

```sql
CREATE TABLE referral_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_username text NOT NULL,           -- Direct reference to users.username
  referrer_user_id uuid REFERENCES users(id), -- For faster joins
  visitor_fingerprint text,                  -- Browser fingerprint for tracking
  session_id text,                          -- Frontend session ID
  visitor_ip inet,                          -- IP address for fallback tracking
  first_visit_at timestamptz DEFAULT now(), -- When they first arrived
  last_visit_at timestamptz DEFAULT now(),  -- Last activity from this visitor
  visit_count integer DEFAULT 1,            -- Number of return visits
  converted_at timestamptz,                 -- When they signed up (if they did)
  converted_user_id uuid REFERENCES users(id), -- Who they became after signup
  is_latest_referrer boolean DEFAULT true   -- Handle multiple referrers
);
```

**Key Features:**
- **Multi-identifier tracking**: Uses fingerprint > session_id > IP for visitor identification
- **Return visit handling**: Increments `visit_count` for same visitor + same referrer
- **Latest referrer logic**: If visitor comes back via different referrer, marks old sessions as `is_latest_referrer = false`
- **Conversion tracking**: Links to actual user after signup

#### 2. `referrals` Table
Confirmed referral relationships after successful signup.

```sql
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),  -- Who referred
  referred_id uuid NOT NULL REFERENCES users(id),  -- Who was referred
  referrer_username text NOT NULL,                 -- Cache for easy queries
  session_id uuid REFERENCES referral_sessions(id), -- Link back to session
  created_at timestamptz DEFAULT now(),
  UNIQUE(referrer_id, referred_id)                 -- Prevent duplicate referrals
);
```

**Key Features:**
- **One referral per pair**: Unique constraint prevents duplicate referrals
- **Session linkage**: Connects back to the original session for audit trail
- **Cached username**: Avoids joins for common queries

### Functions

#### 1. `track_referral_visit()`
Records a visit from a referral link.

```sql
track_referral_visit(
  p_referrer_username text,      -- From URL ?from={username}
  p_visitor_fingerprint text,    -- Browser fingerprint
  p_session_id text,            -- Frontend session ID
  p_visitor_ip inet             -- Visitor IP (set server-side)
) RETURNS uuid
```

**Logic:**
1. Validate referrer exists in `users.username`
2. Check for existing session from same visitor
3. If same referrer: increment `visit_count`
4. If different referrer: mark old sessions as not latest, create new
5. If new visitor: create new session

#### 2. `create_referral_from_session()`
Converts a session into a confirmed referral upon signup.

```sql
create_referral_from_session(
  p_user_id uuid,               -- New user's ID
  p_session_id text,           -- Frontend session ID
  p_fingerprint text           -- Browser fingerprint
) RETURNS uuid
```

**Logic:**
1. Find matching unconverted session with `is_latest_referrer = true`
2. Prevent self-referrals (`referrer_user_id != p_user_id`)
3. Mark session as converted
4. Create referral record
5. Return referral ID

### Analytics

#### Basic Stats View
```sql
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
```

## Frontend Integration

### 1. URL Parameter Tracking

The `useReferralTracking` hook automatically detects referral parameters:

```typescript
// Hook automatically runs on page load
useReferralTracking(); // In HomePage.tsx

// Detects URLs like: reigh.art?from=alice
// Stores: referrerUsername, referralSessionId, referralFingerprint
```

### 2. Browser Fingerprinting

Generates stable visitor ID across sessions:

```typescript
// Combines multiple browser characteristics
const fingerprint = hash([
  navigator.userAgent,
  navigator.language,
  screen.width + 'x' + screen.height,
  timezone,
  canvas.toDataURL(),
  webgl info
]);
```

### 3. Signup Conversion

During Discord OAuth flow:

```typescript
// In HomePage.tsx auth state handler
if (event === 'SIGNED_IN' && session) {
  const referralCode = localStorage.getItem('referralCode');
  const sessionId = localStorage.getItem('referralSessionId');
  const fingerprint = localStorage.getItem('referralFingerprint');
  
  if (referralCode) {
    await supabase.rpc('create_referral_from_session', {
      p_user_id: session.user.id,
      p_session_id: sessionId,
      p_fingerprint: fingerprint,
    });
    
    // Clean up localStorage
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referralSessionId');
    localStorage.removeItem('referralFingerprint');
  }
}
```

## Security

### Row Level Security (RLS)

All tables have RLS enabled with minimal permissions:

```sql
-- Anonymous can only insert visit sessions
CREATE POLICY "anon_insert_sessions" ON referral_sessions
  FOR INSERT TO anon WITH CHECK (true);

-- Users can view their own referral data
CREATE POLICY "users_view_own_referrals" ON referrals
  FOR SELECT TO authenticated 
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "users_view_own_sessions" ON referral_sessions
  FOR SELECT TO authenticated 
  USING (referrer_user_id = auth.uid() OR converted_user_id = auth.uid());
```

### Function Security

Both functions use `SECURITY DEFINER` to run with elevated privileges:

```sql
CREATE OR REPLACE FUNCTION track_referral_visit(...)
RETURNS uuid AS $$
-- Function body
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This allows:
- Anonymous users to insert session records
- Secure validation of referrer usernames
- Prevention of unauthorized data access

## Usage Examples

### Query Referral Stats
```sql
-- Top referrers
SELECT username, successful_referrals 
FROM referral_stats 
WHERE successful_referrals > 0
ORDER BY successful_referrals DESC;

-- Recent referral activity
SELECT 
  rs.referrer_username,
  rs.visit_count,
  rs.converted_at,
  u.name as converted_user
FROM referral_sessions rs
LEFT JOIN users u ON rs.converted_user_id = u.id
ORDER BY rs.last_visit_at DESC
LIMIT 20;

-- Conversion rates
SELECT 
  referrer_username,
  COUNT(*) as total_sessions,
  COUNT(converted_at) as conversions,
  ROUND(COUNT(converted_at)::numeric / COUNT(*) * 100, 1) as conversion_rate
FROM referral_sessions
GROUP BY referrer_username
HAVING COUNT(*) >= 5
ORDER BY conversion_rate DESC;
```

### Test the System
```sql
-- Simulate a visit
SELECT track_referral_visit('alice', 'test_fingerprint_123', 'session_456', '192.168.1.1'::inet);

-- Simulate signup (requires actual user_id)
SELECT create_referral_from_session(
  'user-uuid-here'::uuid, 
  'session_456', 
  'test_fingerprint_123'
);
```

## Migration from Complex System

The original system had 6 tables (referral_codes, referral_sessions, referrals, referral_rewards, referral_programs, referral_analytics). We simplified by:

1. **Eliminating referral_codes**: Use `users.username` directly
2. **Removing referral_rewards**: Can use existing `credits_ledger` system
3. **Removing referral_programs**: Keep it simple, add complexity later
4. **Dropping complex analytics**: Basic view covers MVP needs

The migration script `minimal_referral_system.sql` safely drops all old tables and recreates the minimal system.

## Future Extensions

When needed, the system can easily be extended with:

### Reward System
- Add referral rewards to existing `credits_ledger` table
- Create trigger on `referrals` INSERT to grant credits
- Track reward status in `credits_ledger.metadata`

### Program Management
- Add `referral_programs` table for different campaign types
- Add `program_id` to sessions/referrals
- Support different reward structures per program

### Advanced Analytics
- Create materialized views for performance
- Add conversion funnel tracking
- Implement cohort analysis

### A/B Testing
- Add `variant` field to sessions
- Track different landing pages/flows
- Measure conversion differences

## Troubleshooting

### Common Issues

**1. Session not found during conversion**
- Check fingerprint/session_id consistency
- Verify localStorage isn't cleared between visit and signup
- Check `is_latest_referrer = true` (might be overridden by later referrer)

**2. Self-referrals being created**
- Function prevents `referrer_user_id = converted_user_id`
- Check referrer username resolution

**3. Duplicate referrals**
- UNIQUE constraint on `(referrer_id, referred_id)` prevents this
- Old sessions won't create new referrals for same user pair

### Debug Queries
```sql
-- Check session tracking for a user
SELECT * FROM referral_sessions 
WHERE visitor_fingerprint = 'fingerprint_here'
ORDER BY last_visit_at DESC;

-- Verify referral creation
SELECT 
  r.*,
  referrer.username as referrer_name,
  referred.username as referred_name
FROM referrals r
JOIN users referrer ON r.referrer_id = referrer.id
JOIN users referred ON r.referred_id = referred.id
ORDER BY r.created_at DESC;
```

## Files

- **Database**: `/supabase/migrations/` (applied via `minimal_referral_system.sql`)
- **Frontend Hooks**: 
  - `/src/shared/hooks/useReferralTracking.ts` (URL parameter tracking and conversion)
  - `/src/shared/hooks/useReferralStats.ts` (stats display and session management)
- **Integration**: `/src/pages/HomePage.tsx` (Discord OAuth handler)
- **UI Components**: 
  - `/src/shared/components/ReferralModal.tsx` (referral stats and link sharing)
  - `/src/shared/components/GlobalHeader.tsx` (referral button with dynamic stats)
- **Documentation**: `/structure_detail/referral_system.md` (this file)
