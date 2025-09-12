-- Check what versions of count_eligible_tasks_service_role exist
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  prosrc as source_code_snippet
FROM pg_proc 
WHERE proname = 'count_eligible_tasks_service_role'
ORDER BY oid;
