-- Monitor exactly what happens to shot_data for a generation
-- This will create an audit log to tell us WHO is updating the record and WHEN

-- 1. Create audit table
CREATE TABLE IF NOT EXISTS shot_data_audit (
  id SERIAL PRIMARY KEY,
  generation_id UUID,
  old_shot_data JSONB,
  new_shot_data JSONB,
  operation TEXT,
  changed_by TEXT, -- Will be 'postgres' for trigger, or authenticated user for API
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create audit trigger
CREATE OR REPLACE FUNCTION audit_shot_data_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (OLD.shot_data IS DISTINCT FROM NEW.shot_data)) OR 
     (TG_OP = 'INSERT' AND NEW.shot_data IS NOT NULL) THEN
    
    INSERT INTO shot_data_audit (
      generation_id, 
      old_shot_data, 
      new_shot_data, 
      operation, 
      changed_by
    ) VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.shot_data ELSE NULL END,
      NEW.shot_data,
      TG_OP,
      current_user
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to generations table
DROP TRIGGER IF EXISTS audit_shot_data_trigger ON generations;
CREATE TRIGGER audit_shot_data_trigger
  AFTER INSERT OR UPDATE ON generations
  FOR EACH ROW
  EXECUTE FUNCTION audit_shot_data_changes();

-- 4. Instructions
SELECT 'Audit monitoring enabled. Please create a new generation + shot in the app now. Then run the next query to see the log.' as status;

