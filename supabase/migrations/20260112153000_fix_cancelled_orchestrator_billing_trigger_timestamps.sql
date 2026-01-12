-- Migration: Fix cancelled orchestrator billing trigger timestamps
-- Ensure generation_processed_at is set even when generation_started_at is already present.
-- This prevents calculate-task-cost from failing with "Missing timestamps" on cancelled orchestrators.

CREATE OR REPLACE FUNCTION bill_cancelled_orchestrator()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    is_orchestrator boolean;
    has_completed_children boolean;
    orchestrator_ref text;
    response_status int;
    earliest_child_start timestamptz;
BEGIN
    -- Only process tasks that just became 'Cancelled'
    IF NEW.status = 'Cancelled' AND OLD.status != 'Cancelled' THEN

        -- Extract orchestrator reference from params
        orchestrator_ref := COALESCE(
            NEW.params->>'orchestrator_task_id_ref',
            NEW.params->'orchestrator_details'->>'orchestrator_task_id',
            NEW.params->'originalParams'->'orchestrator_details'->>'orchestrator_task_id',
            NEW.params->>'orchestrator_task_id'
        );

        -- Check if this task is an orchestrator (has orchestrator_details but isn't a child task)
        -- Child tasks have a UUID reference to their orchestrator; orchestrators have human-readable IDs or no ref
        is_orchestrator := (
            NEW.params->'orchestrator_details' IS NOT NULL
            AND (
                orchestrator_ref IS NULL
                OR orchestrator_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                OR orchestrator_ref = NEW.id::text
            )
        );

        IF NOT is_orchestrator THEN
            RETURN NEW;
        END IF;

        -- Check if there are any completed child segments
        SELECT EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.status = 'Complete'
              AND (
                t.params->>'orchestrator_task_id_ref' = NEW.id::text
                OR t.params->'orchestrator_details'->>'orchestrator_task_id' = NEW.id::text
                OR t.params->'originalParams'->'orchestrator_details'->>'orchestrator_task_id' = NEW.id::text
                OR t.params->>'orchestrator_task_id' = NEW.id::text
              )
        ) INTO has_completed_children;

        IF NOT has_completed_children THEN
            RAISE LOG 'Orchestrator % cancelled with no completed children, skipping billing', NEW.id;
            RETURN NEW;
        END IF;

        -- Get earliest child start time (if available)
        SELECT MIN(t.generation_started_at)
          INTO earliest_child_start
          FROM tasks t
         WHERE t.status = 'Complete'
           AND (
             t.params->>'orchestrator_task_id_ref' = NEW.id::text
             OR t.params->'orchestrator_details'->>'orchestrator_task_id' = NEW.id::text
             OR t.params->'originalParams'->'orchestrator_details'->>'orchestrator_task_id' = NEW.id::text
             OR t.params->>'orchestrator_task_id' = NEW.id::text
           );

        -- Ensure timestamps exist so calculate-task-cost can run:
        -- - Keep existing generation_started_at if already set; otherwise use earliest child start (or now())
        -- - Always set generation_processed_at if missing (use now())
        UPDATE tasks
           SET generation_started_at = COALESCE(tasks.generation_started_at, earliest_child_start, now()),
               generation_processed_at = COALESCE(tasks.generation_processed_at, now())
         WHERE id = NEW.id;

        -- Get Supabase configuration from environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);

        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for orchestrator billing trigger';
            RETURN NEW;
        END IF;

        -- Call calculate-task-cost Edge Function
        edge_function_url := supabase_url || '/functions/v1/calculate-task-cost';

        BEGIN
            SELECT status INTO response_status
              FROM http_post(
                edge_function_url,
                jsonb_build_object('task_id', NEW.id),
                'application/json',
                ARRAY[
                    http_header('Authorization', 'Bearer ' || service_role_key),
                    http_header('Content-Type', 'application/json')
                ]
              );

            RAISE LOG 'Orchestrator billing triggered for % with response status %', NEW.id, response_status;

        EXCEPTION WHEN OTHERS THEN
            RAISE LOG 'Failed to trigger billing for cancelled orchestrator %: %', NEW.id, SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


