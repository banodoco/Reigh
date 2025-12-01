-- Migration: Remove upscaled_url column from generations table
-- This column is now obsolete - upscaled versions are stored as variants with variant_type='upscaled'
-- The data has already been migrated to generation_variants in the previous migration

-- Drop the column
ALTER TABLE generations DROP COLUMN IF EXISTS upscaled_url;

-- Add a comment explaining the change
COMMENT ON TABLE generations IS 'Parent container for generations. Actual output data (location, thumbnail_url, params, name) is synced from the primary variant in generation_variants table.';

