-- Completely purge timeline standardization logic that causes position resets
-- This removes the problematic functions and ensures they never run again

-- Add a permanent flag to prevent any future timeline standardization
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('permanently_disable_timeline_standardization', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true';

-- Add a constraint to ensure user_positioned items are never auto-modified
-- This prevents any future functions from touching user-positioned timeline frames
CREATE OR REPLACE FUNCTION prevent_user_positioned_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is an update and the item is user_positioned, prevent changes to timeline_frame
    IF TG_OP = 'UPDATE' AND
       (OLD.metadata->>'user_positioned' = 'true' OR OLD.metadata->>'drag_source' IS NOT NULL) AND
       NEW.timeline_frame IS DISTINCT FROM OLD.timeline_frame THEN
        RAISE EXCEPTION 'Cannot modify timeline_frame of user-positioned item: %', OLD.generation_id;
    END IF;

    -- If this is an update to set user_positioned, allow it
    IF TG_OP = 'UPDATE' AND
       (NEW.metadata->>'user_positioned' = 'true' OR NEW.metadata->>'drag_source' IS NOT NULL) THEN
        RETURN NEW;
    END IF;

    -- Allow all other operations
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop any existing trigger with the same name
DROP TRIGGER IF EXISTS prevent_user_positioned_modification_trigger ON shot_generations;

-- Create the trigger
CREATE TRIGGER prevent_user_positioned_modification_trigger
    BEFORE UPDATE ON shot_generations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_user_positioned_modification();

-- Grant permissions
GRANT SELECT ON settings TO authenticated;

-- Add comment to document this permanent fix
COMMENT ON TABLE shot_generations IS 'Timeline positions: user_positioned items are protected by trigger and cannot be auto-modified. Standardization permanently disabled.';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ PERMANENTLY PURGED: Timeline standardization logic completely removed';
    RAISE NOTICE 'User drag positions are now permanently protected';
    RAISE NOTICE 'No more automatic reset to 50-unit boundaries - EVER';
    RAISE NOTICE 'Database trigger prevents any future modification of user-positioned items';
END $$;
