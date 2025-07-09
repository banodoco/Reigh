-- Fix func_claim_user_task to set generation_started_at for cost calculation
-- The func_claim_task function already correctly sets generation_started_at, 
-- but func_claim_user_task is missing this crucial field for the cost system to work

CREATE OR REPLACE FUNCTION func_claim_user_task(
  p_table_name text,
  p_worker_id text,
  p_user_id uuid
) RETURNS TABLE (
  task_id_out text,
  params_out jsonb,
  task_type_out text,
  project_id_out text
) AS $$
BEGIN
    RETURN QUERY EXECUTE format('
        WITH selected_task AS (
            -- Find the oldest task for a project this user owns
            SELECT t.id
            FROM %I t
            -- Join to projects to check ownership
            INNER JOIN projects p ON t.project_id = p.id
            WHERE
                t.status = ''Queued''
                AND p.user_id = $2::uuid -- CRITICAL: Check the project''s user_id
                AND (t.dependant_on IS NULL OR EXISTS (
                    SELECT 1 FROM %I d WHERE d.id = t.dependant_on AND d.status = ''Complete''
                ))
            ORDER BY t.created_at ASC
            LIMIT 1
            FOR UPDATE OF t SKIP LOCKED
        ),
        updated_task AS (
            -- Atomically update the status AND set generation_started_at for cost calculation
            UPDATE %I
            SET status = ''In Progress'', 
                updated_at = CURRENT_TIMESTAMP,
                generation_started_at = NOW()  -- ADDED: This is needed for cost calculation
            WHERE id = (SELECT st.id FROM selected_task st)
            RETURNING id, params, task_type, project_id
        )
        -- Return the claimed task with correct column names and types
        SELECT 
            ut.id::text AS task_id_out,
            ut.params AS params_out, 
            ut.task_type AS task_type_out, 
            ut.project_id::text AS project_id_out
        FROM updated_task ut 
        LIMIT 1',
        p_table_name, p_table_name, p_table_name
    )
    USING p_worker_id, p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 