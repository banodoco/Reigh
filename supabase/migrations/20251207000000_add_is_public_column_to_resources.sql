-- Add is_public column to resources table
-- This moves is_public from being stored in the JSONB metadata to a proper column
-- for better indexing and querying performance

-- Step 1: Add the is_public column with default false
ALTER TABLE public.resources 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Step 2: Migrate existing data from metadata->is_public to the new column
-- This handles both boolean true and string 'true' values that may exist
UPDATE public.resources 
SET is_public = COALESCE(
  CASE 
    WHEN jsonb_typeof(metadata->'is_public') = 'boolean' THEN (metadata->>'is_public')::boolean
    WHEN metadata->>'is_public' = 'true' THEN true
    ELSE false
  END,
  false
);

-- Step 3: Create an index on is_public for efficient querying of public resources
CREATE INDEX idx_resources_is_public ON public.resources (is_public) WHERE is_public = true;

-- Step 4: Create a composite index for the common query pattern (type + is_public)
CREATE INDEX idx_resources_type_is_public ON public.resources (type, is_public) WHERE is_public = true;

-- Step 5: Update the RLS policy to use the new column instead of metadata
DROP POLICY IF EXISTS "Allow read access to public resources" ON public.resources;

CREATE POLICY "Allow read access to public resources" ON public.resources
FOR SELECT
USING (
  -- Use the new column directly for better performance
  is_public = true
);

-- Note: The metadata->is_public field is kept for backwards compatibility
-- but the authoritative source is now the is_public column

