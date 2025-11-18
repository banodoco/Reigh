-- Check if RLS is blocking the trigger's UPDATE
SELECT jsonb_pretty(
  jsonb_build_object(
    'generations_table_rls', (
      SELECT jsonb_build_object(
        'rls_enabled', relrowsecurity,
        'rls_forced', relforcerowsecurity,
        'table_owner', pg_get_userbyid(relowner)
      )
      FROM pg_class
      WHERE relname = 'generations'
        AND relnamespace = 'public'::regnamespace
    ),
    'rls_policies_on_generations', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'policy_name', polname,
          'command', polcmd,
          'permissive', polpermissive,
          'roles', (
            SELECT array_agg(pg_get_userbyid(r))
            FROM unnest(polroles) r
          ),
          'using_expression', pg_get_expr(polqual, polrelid),
          'with_check_expression', pg_get_expr(polwithcheck, polrelid)
        )
      )
      FROM pg_policy
      WHERE polrelid = 'generations'::regclass
    ),
    'trigger_function_owner', (
      SELECT pg_get_userbyid(proowner)
      FROM pg_proc
      WHERE proname = 'sync_shot_to_generation_jsonb'
    ),
    'recommendation', CASE
      WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'generations') THEN
        'RLS is ENABLED on generations table. The SECURITY DEFINER function might be blocked by RLS policies. ' ||
        'Solution: Either disable RLS on generations, or add USING (true) policy for the function owner, or change function to SECURITY INVOKER.'
      ELSE
        'RLS is NOT enabled. Issue must be something else (permissions, transaction isolation, etc).'
    END
  )
) as rls_check;

