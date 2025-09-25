-- Remove timeline protection triggers that are blocking legitimate drag operations
-- This will allow user drag operations to work properly

-- Drop the triggers that are preventing timeline updates
DROP TRIGGER IF EXISTS prevent_user_positioned_modification_trigger ON shot_generations;
DROP TRIGGER IF EXISTS protect_user_positioned_timeline_frames_trigger ON shot_generations;

-- Drop the corresponding functions
DROP FUNCTION IF EXISTS prevent_user_positioned_modification();
DROP FUNCTION IF EXISTS protect_user_positioned_timeline_frames();

-- Update the settings to reflect that triggers are disabled
UPDATE settings
SET value = 'false'
WHERE key IN ('permanently_disable_timeline_standardization', 'timeline_standardization_permanently_disabled');

-- Add comment to document the change
COMMENT ON TABLE shot_generations IS 'Timeline positions: user-positioned protection triggers removed to allow legitimate drag operations.';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ REMOVED: Timeline protection triggers disabled';
    RAISE NOTICE 'Timeline drag operations should now work properly';
    RAISE NOTICE 'User can now move images without database reverts';
END $$;
