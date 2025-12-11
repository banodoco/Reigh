-- Fix: Variant deletion with proper foreign key handling
-- 
-- Problem 1: BEFORE DELETE trigger caused "tuple already modified" error
-- Problem 2: Foreign key constraint blocks delete if variant is primary_variant_id
--
-- Solution: Two-phase approach
-- 1. BEFORE DELETE: Clear the foreign key reference (generations.primary_variant_id)
-- 2. AFTER DELETE: Promote the next variant to primary

-- Drop old triggers
DROP TRIGGER IF EXISTS trg_handle_variant_deletion ON generation_variants;
DROP TRIGGER IF EXISTS trg_clear_primary_variant_ref ON generation_variants;

-- PHASE 1: BEFORE DELETE - Clear foreign key reference only
-- This allows the delete to proceed without FK violation
CREATE OR REPLACE FUNCTION clear_primary_variant_reference()
RETURNS TRIGGER AS $$
BEGIN
  -- If this variant is referenced as primary_variant_id, clear that reference
  UPDATE generations
  SET primary_variant_id = NULL
  WHERE primary_variant_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clear_primary_variant_ref
BEFORE DELETE ON generation_variants
FOR EACH ROW
EXECUTE FUNCTION clear_primary_variant_reference();

-- PHASE 2: AFTER DELETE - Promote next variant and sync generation
CREATE OR REPLACE FUNCTION handle_variant_deletion()
RETURNS TRIGGER AS $$
DECLARE
  next_variant_id UUID;
BEGIN
  -- Only act if we deleted a primary variant
  IF OLD.is_primary = true THEN
    -- Find the most recently created remaining variant for this generation
    SELECT id INTO next_variant_id
    FROM generation_variants
    WHERE generation_id = OLD.generation_id
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF next_variant_id IS NOT NULL THEN
      -- Promote the next variant to primary
      -- The sync trigger will update generations table automatically
      UPDATE generation_variants
      SET is_primary = true
      WHERE id = next_variant_id;
      
      RAISE NOTICE 'Variant % deleted, promoted variant % to primary', OLD.id, next_variant_id;
    ELSE
      -- No more variants - clear the generation's fields
      UPDATE generations
      SET 
        location = NULL,
        thumbnail_url = NULL,
        params = NULL,
        name = NULL,
        updated_at = NOW()
      WHERE id = OLD.generation_id;
      
      RAISE NOTICE 'Last variant % deleted for generation %, cleared generation fields', OLD.id, OLD.generation_id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_variant_deletion
AFTER DELETE ON generation_variants
FOR EACH ROW
EXECUTE FUNCTION handle_variant_deletion();

-- Also fix the primary switch trigger to be more defensive
CREATE OR REPLACE FUNCTION handle_variant_primary_switch()
RETURNS TRIGGER AS $$
BEGIN
  -- When setting a new primary, unset the old one first
  IF NEW.is_primary = true THEN
    UPDATE generation_variants 
    SET is_primary = false 
    WHERE generation_id = NEW.generation_id 
      AND id != NEW.id 
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SELECT 'Fixed variant deletion with two-phase trigger approach' as status;
