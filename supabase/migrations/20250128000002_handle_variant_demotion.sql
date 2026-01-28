-- Migration: Handle variant demotion (is_primary changes from true to false)
--
-- Gap identified: Existing triggers handle:
-- - Variant becoming primary (syncs to generation)
-- - Variant deletion (promotes another or clears generation)
--
-- Missing: When is_primary changes from true to false WITHOUT deletion
-- This happens when orphaned videos are demoted due to source image changes.
--
-- This trigger: When a variant is demoted, check if there's another primary.
-- If not, clear the generation's display fields so UI shows empty slot.

CREATE OR REPLACE FUNCTION handle_variant_demotion()
RETURNS TRIGGER AS $$
DECLARE
  has_other_primary BOOLEAN;
BEGIN
  -- Only act if is_primary changed from true to false
  IF OLD.is_primary = true AND NEW.is_primary = false THEN
    -- Check if there's another primary variant for this generation
    SELECT EXISTS(
      SELECT 1 FROM generation_variants
      WHERE generation_id = NEW.generation_id
        AND id != NEW.id
        AND is_primary = true
    ) INTO has_other_primary;

    IF NOT has_other_primary THEN
      -- No other primary - clear the generation's display fields
      -- This makes the UI show the slot as empty/placeholder
      UPDATE generations
      SET
        location = NULL,
        thumbnail_url = NULL,
        primary_variant_id = NULL,
        updated_at = NOW()
      WHERE id = NEW.generation_id;

      RAISE NOTICE 'Variant % demoted for generation %, no other primary - cleared generation display fields',
        NEW.id, NEW.generation_id;
    ELSE
      RAISE NOTICE 'Variant % demoted for generation %, another primary exists',
        NEW.id, NEW.generation_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Use AFTER trigger since we need the update to complete first
CREATE TRIGGER trg_handle_variant_demotion
AFTER UPDATE OF is_primary ON generation_variants
FOR EACH ROW
WHEN (OLD.is_primary = true AND NEW.is_primary = false)
EXECUTE FUNCTION handle_variant_demotion();

COMMENT ON FUNCTION handle_variant_demotion() IS
  'When a variant is demoted (is_primary: true -> false), clears generation display fields if no other primary exists';
