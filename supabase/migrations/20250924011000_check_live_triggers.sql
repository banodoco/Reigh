-- Create a function to check what triggers exist on shot_generations table
CREATE OR REPLACE FUNCTION check_shot_generations_triggers()
RETURNS TABLE(
    trigger_name text,
    trigger_type text,
    trigger_enabled boolean,
    trigger_definition text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tgname::text as trigger_name,
        CASE 
            WHEN t.tgtype & 2 = 0 THEN 'AFTER'
            ELSE 'BEFORE'
        END ||
        CASE 
            WHEN t.tgtype & 4 != 0 THEN ' INSERT'
            ELSE ''
        END ||
        CASE 
            WHEN t.tgtype & 8 != 0 THEN ' DELETE'
            ELSE ''
        END ||
        CASE 
            WHEN t.tgtype & 16 != 0 THEN ' UPDATE'
            ELSE ''
        END as trigger_type,
        t.tgenabled = 'O' as trigger_enabled,
        pg_get_triggerdef(t.oid) as trigger_definition
    FROM pg_trigger t
    WHERE t.tgrelid = 'shot_generations'::regclass 
      AND NOT t.tgisinternal
    ORDER BY t.tgname;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_shot_generations_triggers() TO authenticated;

-- Create a function to check what functions might be modifying shot_generations
CREATE OR REPLACE FUNCTION check_shot_generations_functions()
RETURNS TABLE(
    function_name text,
    function_definition text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.proname::text as function_name,
        pg_get_functiondef(p.oid) as function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ILIKE '%shot_generations%'
      AND pg_get_functiondef(p.oid) ILIKE '%UPDATE%'
    ORDER BY p.proname;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_shot_generations_functions() TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ CREATED: Functions to check live triggers and functions';
    RAISE NOTICE 'Use: SELECT * FROM check_shot_generations_triggers();';
    RAISE NOTICE 'Use: SELECT * FROM check_shot_generations_functions();';
END $$;
