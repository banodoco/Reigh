-- Update func_claim_task to only claim tasks for users with positive credits
-- This prevents processing tasks for users who can't pay for them (service role only)
-- User API tokens (func_claim_user_task) are not affected by this change

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
    -- Find the oldest, un-claimed, and ready-to-run task
    -- BUT ONLY for users with positive credits
    SELECT t.id INTO v_claimed_task_id
    FROM tasks AS t
    LEFT JOIN tasks AS d ON d.id = t.dependant_on
    JOIN projects AS p ON t.project_id = p.id
    JOIN users AS u ON p.user_id = u.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR d.status = 'Complete')
      AND u.credits > 0  -- NEW: Only claim tasks for users with positive credits
    ORDER BY t.created_at ASC
    LIMIT 1
    FOR UPDATE of t SKIP LOCKED;

    -- If a task was found, update it to 'In Progress' and set the start time
    IF v_claimed_task_id IS NOT NULL THEN
        UPDATE tasks
        SET
            status = 'In Progress',
            generation_started_at = NOW() -- Set the generation start time
        WHERE id = v_claimed_task_id;

        -- Return the claimed task's details
        RETURN QUERY
        SELECT t.id, t.params, t.task_type, t.project_id
        FROM tasks t
        WHERE t.id = v_claimed_task_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 