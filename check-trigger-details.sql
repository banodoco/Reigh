-- Check complete trigger details
SELECT jsonb_pretty(
  jsonb_build_object(
    'trigger_info', (
      SELECT jsonb_build_object(
        'trigger_name', t.tgname,
        'table_name', c.relname,
        'function_name', p.proname,
        'trigger_enabled', t.tgenabled = 'O',
        'trigger_type', CASE
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END,
        'trigger_events', ARRAY[
          CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
          CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END,
          CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END
        ],
        'function_is_security_definer', p.prosecdef,
        'function_owner', pg_get_userbyid(p.proowner)
      )
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE t.tgname = 'sync_shot_generations_jsonb'
        AND c.relname = 'shot_generations'
    ),
    'test_function_directly', (
      SELECT jsonb_build_object(
        'explanation', 'Call the trigger function directly with test data',
        'note', 'This will show if the function itself works outside of trigger context'
      )
    ),
    'possible_issues', jsonb_build_array(
      'Function has SECURITY DEFINER but owner lacks UPDATE permission on generations',
      'Trigger is using old version of function (needs ALTER TRIGGER to reattach)',
      'Function is failing silently and not raising the WARNING we added',
      'Row-level security (RLS) is blocking the UPDATE inside the trigger',
      'There are multiple versions of the function and trigger is using wrong one'
    )
  )
) as diagnosis;

