-- Remove unused database function timeline_position_sync
DROP FUNCTION IF EXISTS timeline_position_sync(uuid, jsonb, boolean);
