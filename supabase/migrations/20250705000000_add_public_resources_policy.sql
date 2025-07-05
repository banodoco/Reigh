-- Enable RLS on resources table if not already enabled
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read public resources
CREATE POLICY "Allow read access to public resources" ON public.resources
FOR SELECT
USING (
  type = 'lora' AND 
  metadata->>'is_public' = 'true'
);

-- Keep existing policy for users to access their own resources
-- (This should already exist, but adding it here for completeness)
CREATE POLICY "Enable all access for resource owners" ON public.resources
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id); 