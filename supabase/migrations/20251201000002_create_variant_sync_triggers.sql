-- Migration: Create triggers for generation_variants synchronization
-- These triggers ensure backward compatibility by:
-- 1. Syncing generations table when primary variant changes
-- 2. Handling primary switching (only one primary per generation)
-- 3. Auto-creating variants when legacy code inserts directly into generations

-- ============================================================================
-- TRIGGER 1: Handle primary switching
-- When a variant is set as primary, unset the old primary first
-- ============================================================================
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

-- Use BEFORE trigger so we can modify the row before insert/update
CREATE TRIGGER trg_handle_variant_primary_switch
BEFORE INSERT OR UPDATE OF is_primary ON generation_variants
FOR EACH ROW 
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION handle_variant_primary_switch();

-- ============================================================================
-- TRIGGER 2: Sync generations table from primary variant
-- When a variant becomes primary (or primary is updated), sync to generations
-- Syncs: location, thumbnail_url, params, name (all UI-visible fields from variant)
-- Variant data is the source of truth - full replacement, not merge
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_generation_from_primary_variant()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if this is the primary variant
  IF NEW.is_primary = true THEN
    -- Optimization: Only update if values actually changed
    UPDATE generations 
    SET 
      location = NEW.location,
      thumbnail_url = NEW.thumbnail_url,
      params = NEW.params, -- Full sync - variant is source of truth
      name = NEW.name, -- Full sync - variant is source of truth
      primary_variant_id = NEW.id,
      updated_at = NOW()
    WHERE id = NEW.generation_id
      AND (
        location IS DISTINCT FROM NEW.location OR 
        thumbnail_url IS DISTINCT FROM NEW.thumbnail_url OR
        params IS DISTINCT FROM NEW.params OR
        name IS DISTINCT FROM NEW.name OR
        primary_variant_id IS DISTINCT FROM NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_generation_from_variant
AFTER INSERT OR UPDATE ON generation_variants
FOR EACH ROW 
EXECUTE FUNCTION sync_generation_from_primary_variant();

-- ============================================================================
-- TRIGGER 3: Legacy support - auto-create variant when generation inserted
-- For backward compatibility: if something inserts directly into generations
-- with a location but no primary_variant_id, create a variant automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_create_variant_from_generation_insert()
RETURNS TRIGGER AS $$
DECLARE
  new_variant_id UUID;
BEGIN
  -- Only if location is set and no primary_variant_id exists
  IF NEW.location IS NOT NULL AND NEW.primary_variant_id IS NULL THEN
    new_variant_id := gen_random_uuid();
    
    -- Insert the variant (this will trigger sync back, but that's OK - it's idempotent)
    INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, is_primary, variant_type, created_at)
    VALUES (new_variant_id, NEW.id, NEW.location, NEW.thumbnail_url, NEW.params, true, 'original', COALESCE(NEW.created_at, NOW()));
    
    -- Update the generation with the new variant id
    -- Note: We return NEW with modified primary_variant_id
    NEW.primary_variant_id := new_variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Use AFTER trigger because generation must exist before we can reference it
-- But we need BEFORE to modify NEW.primary_variant_id... 
-- Solution: Split into two triggers

-- First, create the variant after insert
CREATE OR REPLACE FUNCTION auto_create_variant_after_generation_insert()
RETURNS TRIGGER AS $$
DECLARE
  new_variant_id UUID;
BEGIN
  -- Only if location is set and no primary_variant_id exists
  IF NEW.location IS NOT NULL AND NEW.primary_variant_id IS NULL THEN
    new_variant_id := gen_random_uuid();
    
    -- Insert the variant with all display-relevant fields
    INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, name, is_primary, variant_type, created_at)
    VALUES (new_variant_id, NEW.id, NEW.location, NEW.thumbnail_url, NEW.params, NEW.name, true, 'original', COALESCE(NEW.created_at, NOW()))
    ON CONFLICT DO NOTHING; -- Idempotency
    
    -- The sync trigger will update generations.primary_variant_id
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_create_variant_after_generation
AFTER INSERT ON generations
FOR EACH ROW 
WHEN (NEW.location IS NOT NULL AND NEW.primary_variant_id IS NULL)
EXECUTE FUNCTION auto_create_variant_after_generation_insert();

-- ============================================================================
-- TRIGGER 4: Handle location/thumbnail/name updates on generations table
-- If legacy code updates generations directly, sync to primary variant
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_variant_from_generation_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If location, thumbnail, or name changed and we have a primary variant, update it
  IF NEW.primary_variant_id IS NOT NULL AND 
     (NEW.location IS DISTINCT FROM OLD.location OR 
      NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url OR
      NEW.name IS DISTINCT FROM OLD.name) THEN
    UPDATE generation_variants
    SET 
      location = COALESCE(NEW.location, location),
      thumbnail_url = COALESCE(NEW.thumbnail_url, thumbnail_url),
      name = COALESCE(NEW.name, name)
    WHERE id = NEW.primary_variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_variant_from_generation
AFTER UPDATE OF location, thumbnail_url, name ON generations
FOR EACH ROW 
WHEN (NEW.primary_variant_id IS NOT NULL)
EXECUTE FUNCTION sync_variant_from_generation_update();

-- ============================================================================
-- TRIGGER 5: Handle variant deletion - fallback to last created variant
-- When primary variant is deleted, promote the most recently created remaining variant
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_variant_deletion()
RETURNS TRIGGER AS $$
DECLARE
  next_variant_id UUID;
  next_variant_location TEXT;
  next_variant_thumbnail TEXT;
  next_variant_params JSONB;
  next_variant_name TEXT;
BEGIN
  -- Only act if we're deleting the primary variant
  IF OLD.is_primary = true THEN
    -- Find the most recently created remaining variant for this generation
    SELECT id, location, thumbnail_url, params, name
    INTO next_variant_id, next_variant_location, next_variant_thumbnail, next_variant_params, next_variant_name
    FROM generation_variants
    WHERE generation_id = OLD.generation_id
      AND id != OLD.id
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF next_variant_id IS NOT NULL THEN
      -- Promote the next variant to primary
      UPDATE generation_variants
      SET is_primary = true
      WHERE id = next_variant_id;
      
      -- Note: The sync trigger will update generations table automatically
      
      RAISE NOTICE 'Variant % deleted, promoted variant % to primary', OLD.id, next_variant_id;
    ELSE
      -- No more variants - clear the generation's variant reference
      UPDATE generations
      SET 
        primary_variant_id = NULL,
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
BEFORE DELETE ON generation_variants
FOR EACH ROW
EXECUTE FUNCTION handle_variant_deletion();

-- ============================================================================
-- Add generation_variants to realtime
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE generation_variants;

COMMENT ON FUNCTION handle_variant_primary_switch() IS 'Ensures only one primary variant per generation by unsetting old primary when new one is set';
COMMENT ON FUNCTION sync_generation_from_primary_variant() IS 'Syncs generations table from primary variant for backward compatibility';
COMMENT ON FUNCTION auto_create_variant_after_generation_insert() IS 'Auto-creates primary variant when legacy code inserts directly into generations';
COMMENT ON FUNCTION sync_variant_from_generation_update() IS 'Syncs primary variant when legacy code updates generations.location directly';
COMMENT ON FUNCTION handle_variant_deletion() IS 'When primary variant is deleted, promotes most recent remaining variant to primary';

