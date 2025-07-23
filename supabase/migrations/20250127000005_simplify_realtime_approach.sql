-- Enable real-time updates by calling an Edge Function to broadcast messages
-- This approach works around the limitation that SQL triggers can't directly send Supabase Realtime broadcasts

-- Enable the HTTP extension for making Edge Function calls
CREATE EXTENSION IF NOT EXISTS http;

-- Ensure tables are in the realtime publication for direct database listeners
DO $$
BEGIN
    -- Check and add generations table to realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'generations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE generations;
        RAISE NOTICE 'Added generations table to supabase_realtime publication';
    END IF;
    
    -- Check and add tasks table to realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
        RAISE NOTICE 'Added tasks table to supabase_realtime publication';
    END IF;
END $$;

-- Function to broadcast task status updates via Edge Function
CREATE OR REPLACE FUNCTION broadcast_task_status_update()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    response_status int;
    message_type text;
BEGIN
    -- Only broadcast for status changes
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) OR (TG_OP = 'INSERT') THEN
        
        -- Get Supabase configuration
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Skip if configuration is not available
        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for broadcast';
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Determine message type
        IF TG_OP = 'INSERT' THEN
            message_type := 'TASK_CREATED';
        ELSIF NEW.status = 'Complete' THEN
            message_type := 'TASK_COMPLETED';
        ELSE
            message_type := 'TASKS_STATUS_UPDATE';
        END IF;
        
        -- Call the Edge Function to broadcast
        BEGIN
            SELECT status INTO response_status
            FROM http_post(
                supabase_url || '/functions/v1/broadcast-realtime',
                jsonb_build_object(
                    'channel', 'task-updates:' || NEW.project_id,
                    'event', 'task-update',
                    'payload', jsonb_build_object(
                        'type', message_type,
                        'payload', jsonb_build_object(
                            'projectId', NEW.project_id,
                            'taskId', NEW.id,
                            'status', NEW.status,
                            'updated_at', NEW.updated_at
                        )
                    )
                )::text,
                'application/json',
                ARRAY[
                    http_header('Authorization', 'Bearer ' || service_role_key),
                    http_header('Content-Type', 'application/json')
                ]
            );
            
            IF response_status >= 200 AND response_status < 300 THEN
                RAISE LOG 'Broadcast % for task % (status: %)', message_type, NEW.id, response_status;
            ELSE
                RAISE LOG 'Failed to broadcast % for task % (status: %)', message_type, NEW.id, response_status;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the transaction if broadcast fails
            RAISE LOG 'Error broadcasting task update: %', SQLERRM;
        END;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to broadcast when generations are created
CREATE OR REPLACE FUNCTION broadcast_generation_created()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    response_status int;
    shot_id uuid;
BEGIN
    -- Get Supabase configuration
    supabase_url := current_setting('app.supabase_url', true);
    service_role_key := current_setting('app.service_role_key', true);
    
    -- Skip if configuration is not available
    IF supabase_url IS NULL OR service_role_key IS NULL THEN
        RAISE LOG 'Supabase configuration not available for generation broadcast';
        RETURN NEW;
    END IF;
    
    -- Extract shot_id if present
    shot_id := COALESCE(
        (NEW.params->>'shotId')::uuid,
        (NEW.params->>'shot_id')::uuid
    );
    
    -- Call the Edge Function to broadcast
    BEGIN
        SELECT status INTO response_status
        FROM http_post(
            supabase_url || '/functions/v1/broadcast-realtime',
            jsonb_build_object(
                'channel', 'task-updates:' || NEW.project_id,
                'event', 'task-update',
                'payload', jsonb_build_object(
                    'type', 'GENERATIONS_UPDATED',
                    'payload', jsonb_build_object(
                        'projectId', NEW.project_id,
                        'generationId', NEW.id,
                        'shotId', shot_id
                    )
                )
            )::text,
            'application/json',
            ARRAY[
                http_header('Authorization', 'Bearer ' || service_role_key),
                http_header('Content-Type', 'application/json')
            ]
        );
        
        IF response_status >= 200 AND response_status < 300 THEN
            RAISE LOG 'Broadcast GENERATIONS_UPDATED for generation % (status: %)', NEW.id, response_status;
        ELSE
            RAISE LOG 'Failed to broadcast generation update % (status: %)', NEW.id, response_status;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        -- Don't fail the transaction if broadcast fails
        RAISE LOG 'Error broadcasting generation update: %', SQLERRM;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers
DROP TRIGGER IF EXISTS trigger_broadcast_task_status ON tasks;
CREATE TRIGGER trigger_broadcast_task_status
    AFTER INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_task_status_update();

DROP TRIGGER IF EXISTS trigger_broadcast_generation_created ON generations;
CREATE TRIGGER trigger_broadcast_generation_created
    AFTER INSERT ON generations
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_generation_created();

-- Add comments
COMMENT ON FUNCTION broadcast_task_status_update() IS 
'Broadcasts task status changes via Edge Function call to Supabase Realtime';

COMMENT ON FUNCTION broadcast_generation_created() IS 
'Broadcasts new generation creation via Edge Function call to Supabase Realtime';

-- Note: You need to set these configuration values in your Supabase project:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key'; 