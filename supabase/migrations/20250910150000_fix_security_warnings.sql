-- Fix Supabase security linter warnings
-- This migration addresses:
-- - function_search_path_mutable: Set explicit search_path on functions
-- - extension_in_public: Move extensions to dedicated schema

BEGIN;

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move http extension to extensions schema
DO $$
BEGIN
  -- Check if http extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e 
    JOIN pg_namespace n ON e.extnamespace = n.oid 
    WHERE e.extname = 'http' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION http SET SCHEMA extensions;
  END IF;
END $$;

-- Move pg_trgm extension to extensions schema  
DO $$
BEGIN
  -- Check if pg_trgm extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e 
    JOIN pg_namespace n ON e.extnamespace = n.oid 
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;

-- Set search_path = 'public, extensions, auth' on all public functions
-- Includes auth schema for auth.role(), auth.uid() functions
-- This provides security while maintaining functionality
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Loop through all functions in the public schema
  FOR func_record IN 
    SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f' -- only functions, not procedures/aggregates
  LOOP
    BEGIN
      -- Set explicit search_path that includes public, extensions, and auth
      -- This ensures functions can still access:
      -- - Tables in public schema
      -- - Extension functions in extensions schema  
      -- - Auth functions like auth.role(), auth.uid()
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = ''public, extensions, auth''', 
        func_record.schema_name, 
        func_record.function_name, 
        func_record.args
      );
      
      RAISE NOTICE 'Set search_path on function: %.%(%)', 
        func_record.schema_name, 
        func_record.function_name, 
        func_record.args;
        
    EXCEPTION WHEN OTHERS THEN
      -- Log any functions we couldn't update but don't fail the migration
      RAISE WARNING 'Could not set search_path on function %.%(%): %', 
        func_record.schema_name, 
        func_record.function_name, 
        func_record.args,
        SQLERRM;
    END;
  END LOOP;
END $$;

-- Update API extra_search_path to include extensions schema
-- Note: This requires manual update of supabase/config.toml

-- IMPORTANT: This migration handles the 'http' and 'pg_trgm' extensions.
-- However, some functions may also use 'net.http_post' from the pg_net extension.
-- pg_net is typically in the 'net' schema, not public, so it should be unaffected.
-- If you see errors about net.http_post, you may need to add 'net' to search_path as well.

COMMIT;
