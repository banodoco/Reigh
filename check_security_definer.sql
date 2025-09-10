-- Query to find all SECURITY DEFINER functions in production
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' 
  AND prosecdef = true
ORDER BY proname;
