-- Debug why this specific generation has NULL shot_data despite having shot_generations
SELECT jsonb_pretty(
  jsonb_build_object(
    '1_generation_info', (
      SELECT jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'shot_data', shot_data,
        'shot_data_is_null', shot_data IS NULL,
        'shot_data_is_empty_object', shot_data = '{}'::jsonb
      )
      FROM generations
      WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa'
    ),
    '2_shot_generations_info', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sg.id,
          'shot_id', sg.shot_id,
          'timeline_frame', sg.timeline_frame,
          'created_at', sg.created_at,
          'time_after_generation_ms', EXTRACT(EPOCH FROM (sg.created_at - g.created_at)) * 1000
        )
      )
      FROM shot_generations sg
      CROSS JOIN (SELECT created_at FROM generations WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa') g
      WHERE sg.generation_id = 'db048ea7-72f6-487b-af8a-f098edb964aa'
    ),
    '3_trigger_status', (
      SELECT jsonb_build_object(
        'trigger_enabled', (
          SELECT tgenabled = 'O'
          FROM pg_trigger 
          WHERE tgrelid = 'shot_generations'::regclass 
            AND tgname = 'sync_shot_generations_jsonb'
        ),
        'trigger_function_current_definition', (
          SELECT substring(pg_get_functiondef(p.oid), 1, 500)
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
            AND p.proname = 'sync_shot_to_generation_jsonb'
        )
      )
    ),
    '4_manual_test', (
      SELECT jsonb_build_object(
        'explanation', 'Testing if manually running the trigger logic works',
        'current_shot_data', (SELECT shot_data FROM generations WHERE id = 'db048ea7-72f6-487b-af8a-f098edb964aa'),
        'expected_shot_data', (
          SELECT jsonb_object_agg(shot_id::text, timeline_frame)
          FROM shot_generations
          WHERE generation_id = 'db048ea7-72f6-487b-af8a-f098edb964aa'
        )
      )
    ),
    '5_check_if_trigger_fired', (
      SELECT jsonb_build_object(
        'note', 'Check Postgres logs for trigger execution. The trigger may have fired but failed silently.',
        'possible_causes', jsonb_build_array(
          'Trigger function failed and error was suppressed',
          'Generation was not committed when trigger fired (transaction isolation)',
          'Trigger was disabled when shot_generations was created',
          'Database connection/permission issue',
          'Trigger fired but UPDATE found no rows (generation not visible yet)'
        )
      )
    ),
    '6_recent_trigger_activity', (
      SELECT jsonb_build_object(
        'other_recent_generations_with_shot_data', (
          SELECT COUNT(*)
          FROM generations
          WHERE created_at > NOW() - INTERVAL '1 hour'
            AND shot_data IS NOT NULL
            AND shot_data != '{}'::jsonb
        ),
        'other_recent_generations_missing_shot_data', (
          SELECT COUNT(*)
          FROM generations g
          WHERE g.created_at > NOW() - INTERVAL '1 hour'
            AND EXISTS (SELECT 1 FROM shot_generations sg WHERE sg.generation_id = g.id)
            AND (g.shot_data IS NULL OR g.shot_data = '{}'::jsonb)
        ),
        'trigger_working_for_others', (
          SELECT EXISTS (
            SELECT 1
            FROM generations
            WHERE created_at > NOW() - INTERVAL '1 hour'
              AND shot_data IS NOT NULL
              AND shot_data != '{}'::jsonb
          )
        )
      )
    ),
    'recommendation', CASE
      WHEN (
        SELECT COUNT(*)
        FROM generations g
        WHERE g.created_at > NOW() - INTERVAL '1 hour'
          AND EXISTS (SELECT 1 FROM shot_generations sg WHERE sg.generation_id = g.id)
          AND (g.shot_data IS NULL OR g.shot_data = '{}'::jsonb)
      ) > 1 THEN 'Multiple recent failures - trigger is still broken or not firing'
      ELSE 'Isolated failure - might be a race condition or one-off issue. Run manual backfill for this record.'
    END
  )
) as debug_result;

