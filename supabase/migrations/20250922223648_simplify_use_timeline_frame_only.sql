-- Simplify approach: just use timeline_frame for ordering everywhere
-- Remove the computed column complexity and use timeline_frame directly

-- Drop the computed column approach we just created
DROP VIEW IF EXISTS shot_generations_with_computed_position;
DROP FUNCTION IF EXISTS get_computed_position(uuid, integer);
DROP FUNCTION IF EXISTS calculate_position_from_timeline_frame(uuid, integer);

-- Verify the simplification
SELECT 'Simplified to use timeline_frame only, removed computed column complexity' as status;
