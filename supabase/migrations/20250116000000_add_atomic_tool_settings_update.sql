-- Migration: Add atomic JSONB update function for tool settings
-- This eliminates the read-modify-write pattern and provides atomic updates

-- Function to atomically update tool settings without fetching first
CREATE OR REPLACE FUNCTION update_tool_settings_atomic(
  p_table_name text,
  p_id uuid,
  p_tool_id text,
  p_settings jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate table name to prevent SQL injection
  IF p_table_name NOT IN ('users', 'projects', 'shots') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Atomically update the settings JSONB field
  -- Uses jsonb_set to update just the tool-specific settings
  -- If settings doesn't exist, creates it as empty object first
  EXECUTE format(
    'UPDATE %I 
     SET settings = jsonb_set(
       COALESCE(settings, ''{}''::jsonb), 
       ARRAY[%L], 
       %L::jsonb, 
       true
     ) 
     WHERE id = %L',
    p_table_name,
    p_tool_id,
    p_settings,
    p_id
  );
  
  -- Raise exception if no row was updated (ID not found)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % found with id %', p_table_name, p_id;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_tool_settings_atomic(text, uuid, text, jsonb) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION update_tool_settings_atomic IS 
  'Atomically updates tool-specific settings in users/projects/shots tables without read-modify-write pattern. Eliminates race conditions and improves performance.';

