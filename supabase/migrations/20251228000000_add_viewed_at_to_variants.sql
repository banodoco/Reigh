-- Add viewed_at column to track when variant was first viewed in lightbox
-- NULL = not viewed yet (shows NEW badge)

-- 1. Add the column
ALTER TABLE generation_variants
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create partial index for efficient "unviewed" queries
CREATE INDEX IF NOT EXISTS idx_generation_variants_viewed_at_null
ON generation_variants(viewed_at)
WHERE viewed_at IS NULL;

-- 3. Backfill: Mark ALL existing variants as viewed (so they don't all show as NEW)
-- Use created_at as the viewed_at timestamp for existing records
UPDATE generation_variants
SET viewed_at = created_at
WHERE viewed_at IS NULL;

-- 4. Add column comment
COMMENT ON COLUMN generation_variants.viewed_at IS
  'When the variant was first viewed in lightbox. NULL = not viewed yet (shows NEW badge).';
