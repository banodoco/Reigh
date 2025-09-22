-- Remove unused database function atomic_timeline_update  
DROP FUNCTION IF EXISTS atomic_timeline_update(uuid, jsonb, boolean);
