-- Migration: Add task processing triggers to replace Express polling
-- This replaces the 10-second polling with instant database-driven processing

-- Enable the http extension for making API calls
CREATE EXTENSION IF NOT EXISTS http;

-- Function to process completed tasks via Edge Function
CREATE OR REPLACE FUNCTION process_completed_task_trigger()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    response_status int;
BEGIN
    -- Only process tasks that just became 'Complete' and need generation processing
    IF NEW.status = 'Complete' 
       AND OLD.status != 'Complete' 
       AND NEW.generation_created = FALSE
       AND NEW.generation_processed_at IS NOT NULL
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        -- Get Supabase configuration from environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Skip if configuration is not available (prevents errors in development)
        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for task processing trigger';
            RETURN NEW;
        END IF;
        
        -- Construct Edge Function URL
        edge_function_url := supabase_url || '/functions/v1/process-completed-task';
        
        -- Call the Edge Function asynchronously
        -- Note: Using http extension for non-blocking call
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
            
            -- Log the response for debugging
            RAISE LOG 'Task processing trigger called for task % with status %', NEW.id, response_status;
            
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the original transaction if the Edge Function call fails
            RAISE LOG 'Failed to call task processing Edge Function for task %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on task status updates
CREATE TRIGGER trigger_process_completed_tasks
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION process_completed_task_trigger();

-- Function to broadcast task status updates for real-time UI
CREATE OR REPLACE FUNCTION broadcast_task_status_update()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    broadcast_channel text;
BEGIN
    -- Only broadcast for status changes on non-completed tasks
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
       OR (TG_OP = 'INSERT') THEN
        
        -- Skip completed tasks as they're handled by the processing trigger
        IF NEW.status IN ('Complete', 'Failed', 'Cancelled') THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Get Supabase configuration
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
            -- Create broadcast channel name
            broadcast_channel := 'task-updates:' || NEW.project_id;
            
            -- Use Supabase Realtime broadcast for real-time updates
            -- This matches the existing useWebSocket hook expectations
            PERFORM supabase_realtime.broadcast(
                broadcast_channel,
                'task-update',
                json_build_object(
                    'type', 'TASKS_STATUS_UPDATE',
                    'payload', json_build_object(
                        'projectId', NEW.project_id,
                        'taskId', NEW.id,
                        'status', NEW.status,
                        'updated_at', NEW.updated_at
                    )
                )
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for real-time status broadcasts
CREATE TRIGGER trigger_broadcast_task_status
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_task_status_update();

-- Set up configuration settings (these should be set via environment variables)
-- Note: These will need to be configured in your Supabase project settings
COMMENT ON FUNCTION process_completed_task_trigger() IS 
'Requires app.supabase_url and app.service_role_key to be set via ALTER DATABASE SET commands';

COMMENT ON FUNCTION broadcast_task_status_update() IS 
'Automatically broadcasts task status changes for real-time UI updates'; 