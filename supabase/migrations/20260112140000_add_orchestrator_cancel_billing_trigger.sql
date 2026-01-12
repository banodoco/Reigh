-- Migration: Add trigger to bill orchestrators when cancelled
-- This ensures billing happens regardless of cancellation source (frontend, API, admin, scripts)

-- Function to handle billing for cancelled orchestrator tasks
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
BEGIN
    -- Only process tasks that just became 'Cancelled'
    IF NEW.status = 'Cancelled' AND OLD.status != 'Cancelled' THEN
        
        -- Check if this task is an orchestrator (has orchestrator_details but isn't a child task)
        -- Child tasks have a UUID reference to their orchestrator; orchestrators have human-readable IDs or no ref
        
        -- Extract orchestrator reference from params
        orchestrator_ref := COALESCE(
            NEW.params->>'orchestrator_task_id_ref',
            NEW.params->'orchestrator_details'->>'orchestrator_task_id',
            NEW.params->'originalParams'->'orchestrator_details'->>'orchestrator_task_id',
            NEW.params->>'orchestrator_task_id'
        );
        
        -- Check if it's a valid UUID (child task reference) - orchestrators don't have valid UUID refs to themselves
        -- UUID pattern: 8-4-4-4-12 hex chars
        is_orchestrator := (
            NEW.params->'orchestrator_details' IS NOT NULL
            AND (
                orchestrator_ref IS NULL 
                OR orchestrator_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                OR orchestrator_ref = NEW.id::text
            )
        );
        
        IF NOT is_orchestrator THEN
            -- Not an orchestrator, skip
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
            -- No completed work to bill for
            RAISE LOG 'Orchestrator % cancelled with no completed children, skipping billing', NEW.id;
            RETURN NEW;
        END IF;
        
        RAISE LOG 'Orchestrator % cancelled with completed children, triggering billing', NEW.id;
        
        -- Get Supabase configuration from environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Skip if configuration is not available
        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for orchestrator billing trigger';
            RETURN NEW;
        END IF;
        
        -- Set timestamps on the orchestrator so cost calculation can work
        -- Use earliest child start time
        UPDATE tasks 
        SET 
            generation_started_at = COALESCE(
                (
                    SELECT MIN(t.generation_started_at)
                    FROM tasks t
                    WHERE t.status = 'Complete'
                    AND (
                        t.params->>'orchestrator_task_id_ref' = NEW.id::text
                        OR t.params->'orchestrator_details'->>'orchestrator_task_id' = NEW.id::text
                    )
                ),
                now()
            ),
            generation_processed_at = now()
        WHERE id = NEW.id
        AND generation_started_at IS NULL;
        
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
            -- Don't fail the cancellation if billing fails
            RAISE LOG 'Failed to trigger billing for cancelled orchestrator %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on task status updates
-- Use AFTER trigger so the status change is already committed
DROP TRIGGER IF EXISTS trigger_bill_cancelled_orchestrator ON tasks;
CREATE TRIGGER trigger_bill_cancelled_orchestrator
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    WHEN (NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled')
    EXECUTE FUNCTION bill_cancelled_orchestrator();

COMMENT ON FUNCTION bill_cancelled_orchestrator() IS 
'Triggers billing for orchestrator tasks that are cancelled after some child segments completed.
Catches all cancellation sources: frontend Cancel All, individual cancel, API, admin scripts, etc.';

