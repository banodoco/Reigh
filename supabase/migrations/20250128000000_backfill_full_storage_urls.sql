-- Migration: Backfill full Supabase Storage public URLs for legacy rows
-- Any generation.location or tasks.output_location that does NOT start with http/https
-- will be converted to a full public URL of the form:
--   https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
--
-- This script assumes all legacy relative paths are already prefixed with the bucket name
-- (e.g. `image_uploads/abc.png` or `image_uploads//easy.png`).
--
-- Replace YOUR_PROJECT_REF below or set it via ALTER DATABASE GUC before running.

DO $$
DECLARE
  project_ref text := current_setting('app.supabase_project_ref', true);
BEGIN
  IF project_ref IS NULL THEN
    RAISE EXCEPTION 'GUC app.supabase_project_ref is not set.';
  END IF;
  
  -- Generations table
  UPDATE generations
  SET location = CONCAT('https://', project_ref, '.supabase.co/storage/v1/object/public/',
                        CASE WHEN location LIKE '/%' THEN substring(location FROM 2) ELSE location END)
  WHERE location NOT ILIKE 'http%';
  
  -- Tasks table (output_location)
  UPDATE tasks
  SET output_location = CONCAT('https://', project_ref, '.supabase.co/storage/v1/object/public/',
                               CASE WHEN output_location LIKE '/%' THEN substring(output_location FROM 2) ELSE output_location END)
  WHERE output_location IS NOT NULL
    AND output_location NOT ILIKE 'http%';
END $$; 