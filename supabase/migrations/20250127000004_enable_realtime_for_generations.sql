-- Fix the broadcast trigger to include completed tasks for real-time updates

-- Update the broadcast function to NOT skip completed tasks
CREATE OR REPLACE FUNCTION broadcast_task_status_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Broadcast for all status changes including completed tasks
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
       OR (TG_OP = 'INSERT') THEN
        
        -- Create a simple broadcast that matches what the client expects
        -- The client listens for these messages and invalidates queries accordingly
        PERFORM pg_notify(
            'task_status_update',
            json_build_object(
                'channel', 'task-updates:' || NEW.project_id,
                'event', 'task-update',
                'payload', json_build_object(
                    'type', CASE 
                        WHEN NEW.status = 'Complete' THEN 'TASK_COMPLETED'
                        WHEN TG_OP = 'INSERT' THEN 'TASK_CREATED'
                        ELSE 'TASKS_STATUS_UPDATE'
                    END,
                    'payload', json_build_object(
                        'projectId', NEW.project_id,
                        'taskId', NEW.id,
                        'status', NEW.status,
                        'updated_at', NEW.updated_at
                    )
                )
            )::text
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a trigger to broadcast when generations are created
CREATE OR REPLACE FUNCTION broadcast_generation_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Broadcast when a new generation is created
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify(
            'generation_created',
            json_build_object(
                'channel', 'task-updates:' || NEW.project_id,
                'event', 'task-update',
                'payload', json_build_object(
                    'type', 'GENERATIONS_UPDATED',
                    'payload', json_build_object(
                        'projectId', NEW.project_id,
                        'generationId', NEW.id,
                        'shotId', COALESCE(
                            (NEW.params->>'shotId')::text,
                            (NEW.params->>'shot_id')::text
                        )
                    )
                )
            )::text
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for generation broadcasts
CREATE TRIGGER trigger_broadcast_generation_created
    AFTER INSERT ON generations
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_generation_created();

-- Enable Supabase Realtime for the generations table
-- This allows clients to subscribe to INSERT, UPDATE, and DELETE events
-- Note: The publication should already exist, we're just adding tables to it

-- Add tables to the publication if not already added
DO $$
BEGIN
    -- Check if generations table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'generations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE generations;
    END IF;
    
    -- Check if tasks table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
    END IF;
END $$;

COMMENT ON FUNCTION broadcast_task_status_update() IS 
'Broadcasts all task status changes including completed tasks for real-time UI updates';

COMMENT ON FUNCTION broadcast_generation_created() IS 
'Broadcasts when new generations are created for real-time UI updates'; 