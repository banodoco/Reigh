-- ============================================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================================
-- This migration addresses multiple security vulnerabilities:
-- 1. Remove anon access from storage policies
-- 2. Revoke anon permissions from sensitive database functions
-- 3. Tighten function permissions
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX STORAGE POLICIES - Remove anon access
-- ============================================================================
-- The buckets are public (for sharing), but RLS policies shouldn't grant anon.
-- Public bucket = files accessible via direct URL
-- RLS policy = controls who can query/list files

-- Make training-data bucket private (training uploads are sensitive)
-- (RLS on storage.objects still controls owner access; private bucket prevents direct-URL access.)
UPDATE storage.buckets
SET public = false
WHERE id = 'training-data';

-- Drop and recreate image_uploads_select without anon
DROP POLICY IF EXISTS "image_uploads_select" ON storage.objects;
CREATE POLICY "image_uploads_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'image_uploads');

-- Drop and recreate lora_files_select without anon
DROP POLICY IF EXISTS "lora_files_select" ON storage.objects;
CREATE POLICY "lora_files_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'lora_files');

-- ============================================================================
-- 2. REVOKE ANON PERMISSIONS FROM SENSITIVE FUNCTIONS
-- ============================================================================
-- These functions should only be callable by authenticated users or service role

-- Task-related functions - should not be callable by anon
REVOKE EXECUTE ON FUNCTION safe_update_task_status(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION safe_insert_task(UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM anon;

-- Text-based task functions (if they exist)
DO $$ 
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION func_update_task_status(TEXT, TEXT, TEXT, TEXT) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ 
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION complete_task_with_timing(TEXT, TEXT) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ 
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION func_mark_task_failed(TEXT, TEXT) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ 
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION func_initialize_tasks_table(TEXT) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ 
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION func_migrate_tasks_for_task_type(TEXT) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- System log functions - should not be callable by anon
-- Do this safely for ANY signature/overload.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('func_insert_logs_batch', 'func_cleanup_old_logs')
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      r.schema_name,
      r.function_name,
      r.args
    );
  END LOOP;
END $$;

-- User creation - keep for anon (needed for signup flow)
-- GRANT EXECUTE ON FUNCTION create_user_record_if_not_exists() TO anon;

-- ============================================================================
-- 3. KEEP NECESSARY ANON PERMISSIONS
-- ============================================================================
-- Some functions MUST remain accessible to anon:
-- - increment_share_view_count: For public share page view counting
-- - func_worker_heartbeat_with_logs: Workers may use anon key (review if needed)

-- Confirm share view count is accessible (public share pages need this)
GRANT EXECUTE ON FUNCTION increment_share_view_count(TEXT) TO anon;

-- ============================================================================
-- 4. SYSTEM LOGS TABLE - Remove anon access
-- ============================================================================
-- System logs should not be accessible to anon users
DO $$
BEGIN
  IF to_regclass('public.system_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT, INSERT ON public.system_logs FROM anon';
  END IF;

  IF to_regclass('public.v_recent_errors') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.v_recent_errors FROM anon';
  END IF;

  IF to_regclass('public.v_worker_log_activity') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.v_worker_log_activity FROM anon';
  END IF;
END $$;

-- ============================================================================
-- 4b. USERS TABLE - prevent exposing Stripe identifiers to client
-- ============================================================================
-- Create a boolean the frontend can read, and keep Stripe IDs server-side only.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auto_topup_setup_completed boolean NOT NULL DEFAULT false;

-- Backfill based on existing Stripe IDs (if present)
UPDATE public.users
SET auto_topup_setup_completed = true
WHERE auto_topup_setup_completed = false
  AND stripe_customer_id IS NOT NULL
  AND stripe_payment_method_id IS NOT NULL;

-- Revoke column-level access to Stripe IDs from client roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('stripe_customer_id', 'stripe_payment_method_id')
  ) THEN
    EXECUTE 'REVOKE SELECT (stripe_customer_id, stripe_payment_method_id) ON TABLE public.users FROM authenticated';
    EXECUTE 'REVOKE SELECT (stripe_customer_id, stripe_payment_method_id) ON TABLE public.users FROM anon';

    EXECUTE 'REVOKE UPDATE (stripe_customer_id, stripe_payment_method_id) ON TABLE public.users FROM authenticated';
    EXECUTE 'REVOKE UPDATE (stripe_customer_id, stripe_payment_method_id) ON TABLE public.users FROM anon';
  END IF;

  -- Prevent clients from toggling setup-completed themselves
  EXECUTE 'REVOKE UPDATE (auto_topup_setup_completed) ON TABLE public.users FROM authenticated';
  EXECUTE 'REVOKE UPDATE (auto_topup_setup_completed) ON TABLE public.users FROM anon';
END $$;

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SECURITY HARDENING COMPLETE';
  RAISE NOTICE '  - Storage policies updated (anon SELECT removed)';
  RAISE NOTICE '  - Sensitive function permissions revoked from anon';
  RAISE NOTICE '  - System logs access restricted';
END $$;

COMMIT;




