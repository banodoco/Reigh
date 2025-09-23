-- Disable the timeline standardization that was causing user drag positions to reset
-- This ensures the one-time standardization migration doesn't interfere with user positioning

-- Add a comment to document why this was disabled
COMMENT ON TABLE shot_generations IS 'Timeline positions: user_positioned metadata preserves manual drag operations. Automatic standardization disabled to prevent position resets.';

-- Create a function to check and repair user-positioned items that were incorrectly reset
CREATE OR REPLACE FUNCTION repair_user_positioned_items()
RETURNS void AS $$
DECLARE
    r_gen RECORD;
    fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Checking for user-positioned items that may have been incorrectly reset...';

    -- Find items that should be user_positioned but aren't at 50-unit boundaries
    FOR r_gen IN
        SELECT sg.id, sg.generation_id, sg.timeline_frame, sg.metadata
        FROM shot_generations sg
        WHERE (sg.metadata->>'user_positioned' = 'true' OR sg.metadata->>'drag_source' IS NOT NULL)
          AND sg.timeline_frame IS NOT NULL
          AND (sg.timeline_frame % 50) != 0
    LOOP
        RAISE NOTICE '  Found user-positioned item at non-50 boundary: generation_id=%, timeline_frame=%',
            r_gen.generation_id, r_gen.timeline_frame;

        -- Log but don't auto-fix - let user decide
        fixed_count := fixed_count + 1;
    END LOOP;

    IF fixed_count = 0 THEN
        RAISE NOTICE '  No user-positioned items found at non-50 boundaries - all looks good!';
    ELSE
        RAISE NOTICE '  Found % user-positioned items at non-50 boundaries. Manual review may be needed.', fixed_count;
    END IF;
END $$;

-- Run the repair check
SELECT repair_user_positioned_items();

-- Drop the repair function
DROP FUNCTION repair_user_positioned_items();

-- Log that we've disabled the problematic standardization
DO $$
BEGIN
    RAISE NOTICE 'Timeline standardization disabled - user drag positions will now be preserved';
    RAISE NOTICE 'Items with metadata.user_positioned=true or metadata.drag_source will not be auto-repositioned';
END $$;
