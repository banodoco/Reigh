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
  IF p_table_name NOT IN ('users', 'projects', 'shots') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  EXECUTE format(
    'UPDATE %I SET settings = jsonb_set(COALESCE(settings, ''{}''::jsonb), ARRAY[%L], %L::jsonb, true) WHERE id = %L',
    p_table_name, p_tool_id, p_settings, p_id
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % found with id %', p_table_name, p_id;
  END IF;
END;
$$;

