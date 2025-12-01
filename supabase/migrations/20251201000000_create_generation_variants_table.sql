-- Migration: Create generation_variants table
-- This table stores individual variants of each generation (original, upscaled, edited, etc.)
-- The generations table becomes a parent container, with variants holding the actual output data

-- 1. Create the generation_variants table
CREATE TABLE IF NOT EXISTS generation_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  
  -- Output data (core variant content)
  location TEXT NOT NULL,              -- URL to the variant content
  thumbnail_url TEXT,                  -- Thumbnail for this variant
  
  -- Variant-specific metadata
  params JSONB,                        -- Generation parameters for this specific variant
  
  -- Variant classification
  is_primary BOOLEAN DEFAULT false NOT NULL,
  variant_type TEXT,                   -- Flexible: 'original', 'upscaled', 'edit', etc.
  name TEXT,                           -- Human-readable name
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Add partial unique index to ensure only one primary variant per generation
CREATE UNIQUE INDEX idx_unique_primary_variant 
ON generation_variants(generation_id) 
WHERE is_primary = true;

-- 3. Add indexes for common queries
CREATE INDEX idx_generation_variants_generation_id ON generation_variants(generation_id);
CREATE INDEX idx_generation_variants_variant_type ON generation_variants(variant_type) WHERE variant_type IS NOT NULL;

-- 4. Add primary_variant_id column to generations for fast lookup
ALTER TABLE generations ADD COLUMN IF NOT EXISTS primary_variant_id UUID REFERENCES generation_variants(id);
CREATE INDEX idx_generations_primary_variant ON generations(primary_variant_id) WHERE primary_variant_id IS NOT NULL;

-- 5. Enable RLS on generation_variants
ALTER TABLE generation_variants ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for generation_variants (inherit from generations)
-- Users can view variants of generations they can view
CREATE POLICY "Users can view variants of their generations"
ON generation_variants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM generations g
    JOIN projects p ON g.project_id = p.id
    WHERE g.id = generation_variants.generation_id
    AND p.user_id = auth.uid()
  )
);

-- Users can insert variants for their generations
CREATE POLICY "Users can create variants for their generations"
ON generation_variants
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM generations g
    JOIN projects p ON g.project_id = p.id
    WHERE g.id = generation_variants.generation_id
    AND p.user_id = auth.uid()
  )
);

-- Users can update variants of their generations
CREATE POLICY "Users can update variants of their generations"
ON generation_variants
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM generations g
    JOIN projects p ON g.project_id = p.id
    WHERE g.id = generation_variants.generation_id
    AND p.user_id = auth.uid()
  )
);

-- Users can delete variants of their generations
CREATE POLICY "Users can delete variants of their generations"
ON generation_variants
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM generations g
    JOIN projects p ON g.project_id = p.id
    WHERE g.id = generation_variants.generation_id
    AND p.user_id = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to generation_variants"
ON generation_variants
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE generation_variants IS 'Stores individual variants of generations (original, upscaled, edited, etc.)';
COMMENT ON COLUMN generation_variants.is_primary IS 'Only one variant per generation can be primary - this is what shows in galleries';
COMMENT ON COLUMN generation_variants.variant_type IS 'Flexible type field: original, upscaled, edit, etc.';
COMMENT ON COLUMN generation_variants.params IS 'Generation parameters specific to this variant';

