-- Restore timing-field compatibility and keep auto worker registration
-- This migration updates func_claim_task and func_claim_user_task to set the
-- application_name GUC so that timing field protections allow the update.

-- === func_claim_task ===
CREATE OR REPLACE FUNCTION func_claim_task(
    p_table_name text,
    p_worker_id text
) RETURNS TABLE (
    task_id_out uuid,
    params_out jsonb,
    task_type_out text,
    project_id_out uuid
) AS $$
DECLARE
    v_claimed_task_id UUID;
BEGIN
    -- Identify this call so timing-field trigger permits updates
    PERFORM set_config('application_name', 'claim_task', true);

    -- Auto-register worker if it doesn't exist
    INSERT INTO workers (id, instance_type, last_heartbeat, status, metadata)
    VALUES (p_worker_id, 'external', NOW(), 'active', '{"auto_registered": true}')
    ON CONFLICT (id) DO UPDATE SET
        last_heartbeat = NOW(),
        status         = 'active';

    -- Find the oldest, un-claimed, and ready-to-run task for users with credits
    SELECT t.id INTO v_claimed_task_id
    FROM tasks AS t
    LEFT JOIN tasks AS d ON d.id = t.dependant_on
    JOIN projects AS p ON t.project_id = p.id
    JOIN users AS u ON p.user_id = u.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR d.status = 'Complete')
      AND u.credits > 0
    ORDER BY t.created_at ASC
    LIMIT 1
    FOR UPDATE OF t SKIP LOCKED;

    IF v_claimed_task_id IS NOT NULL THEN
        UPDATE tasks
        SET status              = 'In Progress',
            generation_started_at = NOW(),
            worker_id           = p_worker_id
        WHERE id = v_claimed_task_id;

        RETURN QUERY
        SELECT t.id, t.params, t.task_type, t.project_id
        FROM tasks t
        WHERE t.id = v_claimed_task_id;
    END IF;

    -- Reset application name to avoid leaking the setting
    PERFORM set_config('application_name', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === func_claim_user_task ===
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
    -- Identify this call so timing-field trigger permits updates
    PERFORM set_config('application_name', 'claim_task', true);

    -- Auto-register worker if missing
    INSERT INTO workers (id, instance_type, last_heartbeat, status, metadata)
    VALUES (p_worker_id, 'external', NOW(), 'active', '{"auto_registered": true}')
    ON CONFLICT (id) DO UPDATE SET
        last_heartbeat = NOW(),
        status         = 'active';

    RETURN QUERY EXECUTE format('
        WITH selected_task AS (
            SELECT t.id
            FROM %I t
            INNER JOIN projects p ON t.project_id = p.id
            WHERE t.status = ''Queued''
              AND p.user_id = $2::uuid
              AND (t.dependant_on IS NULL OR EXISTS (
                    SELECT 1 FROM %I d WHERE d.id = t.dependant_on AND d.status = ''Complete''))
            ORDER BY t.created_at ASC
            LIMIT 1
            FOR UPDATE OF t SKIP LOCKED
        ),
        updated_task AS (
            UPDATE %I
            SET status              = ''In Progress'',
                updated_at          = CURRENT_TIMESTAMP,
                generation_started_at = NOW(),
                worker_id           = $1
            WHERE id = (SELECT st.id FROM selected_task st)
            RETURNING id, params, task_type, project_id
        )
        SELECT ut.id::text AS task_id_out,
               ut.params    AS params_out,
               ut.task_type AS task_type_out,
               ut.project_id::text AS project_id_out
        FROM updated_task ut
        LIMIT 1',
        p_table_name, p_table_name, p_table_name)
    USING p_worker_id, p_user_id;

    -- Reset application name
    PERFORM set_config('application_name', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 