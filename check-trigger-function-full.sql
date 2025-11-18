-- Get the COMPLETE trigger function definition to see if it matches our fix
SELECT pg_get_functiondef(p.oid) as full_function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'sync_shot_to_generation_jsonb';

