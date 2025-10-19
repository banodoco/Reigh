-- Fix the RLS policy for public resources to work with both LoRAs and phase-configs
-- and to properly check boolean is_public field instead of string comparison

-- Drop the old policy that had two bugs:
-- 1. Only allowed type = 'lora', not 'phase-config'
-- 2. Checked for string 'true' instead of boolean true
DROP POLICY IF EXISTS "Allow read access to public resources" ON public.resources;

-- Create new policy that fixes both issues
CREATE POLICY "Allow read access to public resources" ON public.resources
FOR SELECT
USING (
  -- Allow any type (lora, phase-config, etc.) if is_public is true
  (metadata->>'is_public')::boolean = true
);

