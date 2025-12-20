# Referral System

> **Purpose**: Track referral link visits (`?from={username}`) and convert to confirmed referrals on signup.
> **Source of Truth**: `src/shared/hooks/useReferralTracking.ts`, `src/pages/Home/HomePage.tsx` (conversion on SIGNED_IN)
>
> **Note**: The underlying DB tables/functions exist in Supabase, but are not currently defined in this repo’s `supabase/migrations/`. If you need to audit behavior, search the DB for `track_referral_visit`, `create_referral_from_session`, `referral_sessions`, `referrals`.

---

## Key Invariants

1. **Use username directly**: No separate referral codes — `users.username` is the referral code
2. **Latest referrer wins**: If visitor returns via different referrer, old sessions marked `is_latest_referrer=false`
3. **No self-referrals**: Function rejects `referrer_user_id = converted_user_id`
4. **One referral per pair**: UNIQUE constraint on `(referrer_id, referred_id)` prevents duplicates
5. **Multi-identifier tracking**: Frontend provides `fingerprint` + `session_id` (IP is currently passed as `null` client-side)
6. **Elevated conversion**: `create_referral_from_session()` is kept as `SECURITY DEFINER` (needs cross-user writes)

---

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `referral_sessions` | Pre-signup visit tracking | `referrer_username`, `visitor_fingerprint`, `session_id`, `is_latest_referrer`, `converted_at` |
| `referrals` | Confirmed referral relationships | `referrer_id`, `referred_id`, `session_id` (link to original session) |

### Functions

| Function | Purpose |
|----------|---------|
| `track_referral_visit(username, fingerprint, session_id, ip)` | Records/updates visit from referral link |
| `create_referral_from_session(session_id, fingerprint)` | Converts session to referral on signup (user inferred from auth) |

---

## Frontend Flow

### 1. Visit Tracking

```typescript
// useReferralTracking hook (runs on page load)
// Detects: reigh.art?from=alice
// Stores: referralCode, referralTimestamp, referralSessionId, referralFingerprint in localStorage
useReferralTracking();
```

### 2. Signup Conversion

```typescript
// In auth state handler (src/pages/Home/HomePage.tsx)
// Conversion is gated behind oauthInProgress, and always cleans up localStorage keys.
if (event === 'SIGNED_IN' && session && localStorage.getItem('oauthInProgress') === 'true') {
  const referralCode = localStorage.getItem('referralCode');
  const referralSessionId = localStorage.getItem('referralSessionId');
  const referralFingerprint = localStorage.getItem('referralFingerprint');

  if (referralCode) {
    await supabase.rpc('create_referral_from_session', {
      p_session_id: referralSessionId,
      p_fingerprint: referralFingerprint,
    });
  }
}
```

---

## RLS Policies

| Policy | Access |
|--------|--------|
| Anonymous | INSERT only to `referral_sessions` |
| Authenticated | SELECT own referrals (as referrer or referred) |
| Functions | SECURITY DEFINER for cross-table operations |

---

## Analytics View

```sql
-- Example query (may or may not exist as a persisted VIEW)
SELECT username, 
       COUNT(DISTINCT rs.id) as total_visits,
       COUNT(DISTINCT r.id) as successful_referrals
FROM users u
LEFT JOIN referral_sessions rs ON u.username = rs.referrer_username
LEFT JOIN referrals r ON u.id = r.referrer_id
GROUP BY u.id, u.username;
```

---

## Files

| Component | Location |
|-----------|----------|
| Frontend hook | `src/shared/hooks/useReferralTracking.ts` |
| Auth integration | `src/pages/Home/HomePage.tsx` |
| DB RPC signatures (generated) | `src/integrations/supabase/types.ts` (search `track_referral_visit`) |

---

## Related

[Database & Storage](db_and_storage.md) • [Back to Structure](../../structure.md)
