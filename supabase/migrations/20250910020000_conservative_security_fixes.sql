-- Conservative security fixes for Supabase linter issues
-- Only addresses user-facing views and tables, preserves admin monitoring functionality

-- =============================
-- 1) Fix user-facing views to use security_invoker
-- =============================
-- These views are accessed by authenticated users and should respect RLS

-- shot_statistics: used in useProjectVideoCountsCache
ALTER VIEW IF EXISTS public.shot_statistics SET (security_invoker=true);

-- referral_stats: used in GlobalHeader and ReferralModal  
ALTER VIEW IF EXISTS public.referral_stats SET (security_invoker=true);

-- user_credit_balance: likely used for credit display
ALTER VIEW IF EXISTS public.user_credit_balance SET (security_invoker=true);

-- task_types_with_billing: if it exists and is user-facing
ALTER VIEW IF EXISTS public.task_types_with_billing SET (security_invoker=true);

-- Preserve existing grants (idempotent)
DO $$ BEGIN
  -- shot_statistics already has authenticated access
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'shot_statistics') THEN
    GRANT SELECT ON public.shot_statistics TO authenticated;
  END IF;
END $$;

-- =============================
-- 2) Enable RLS on user-accessible tables ONLY
-- =============================
-- Conservative approach: only enable where we're confident it won't break functions

-- Projects table: users access their own projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects: users access own projects"
  ON public.projects
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Critical: service role must bypass RLS for functions to work
CREATE POLICY "Projects: service role bypass"
  ON public.projects
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Task types: read-only reference data
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TaskTypes: authenticated read access"
  ON public.task_types
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "TaskTypes: service role full access"
  ON public.task_types
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================
-- 3) Note about remaining tables
-- =============================
-- shots, generations, shot_generations are NOT enabled yet because:
-- 1. They have complex SECURITY DEFINER functions that need testing
-- 2. They have intricate relationships that need careful policy design
-- 3. Breaking these would severely impact core functionality
--
-- These should be addressed in a separate migration after thorough testing
-- of functions like add_generation_to_shot, create_shot_with_image, etc.

-- =============================
-- 4) Leave monitoring views as SECURITY DEFINER
-- =============================
-- orchestrator_status, active_workers_health, etc. are intentionally SECURITY DEFINER
-- because they're for admin/monitoring use and need elevated privileges to access
-- system tables and worker information. They're not exposed to regular users.
