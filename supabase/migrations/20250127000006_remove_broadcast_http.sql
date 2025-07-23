-- Remove HTTP-based broadcast calls now that client listens directly to database changes

-- Drop triggers and functions that call Edge Function
DROP TRIGGER IF EXISTS trigger_broadcast_task_status ON tasks;
DROP FUNCTION IF EXISTS broadcast_task_status_update();

DROP TRIGGER IF EXISTS trigger_broadcast_generation_created ON generations;
DROP FUNCTION IF EXISTS broadcast_generation_created();

-- Replace with lightweight no-op triggers (just to keep structure; optional)
CREATE OR REPLACE FUNCTION noop_broadcast_task_status()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op: Realtime handled via postgres_changes publication
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_broadcast_task_status
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION noop_broadcast_task_status();

CREATE OR REPLACE FUNCTION noop_broadcast_generation_created()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_broadcast_generation_created
  AFTER INSERT ON generations
  FOR EACH ROW
  EXECUTE FUNCTION noop_broadcast_generation_created();

-- No further action needed; client now listens to database changes directly. 