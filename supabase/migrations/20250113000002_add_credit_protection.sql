-- Create function to prevent direct credit manipulation
-- This ensures credits can only be changed through the credits_ledger system

-- Create a function that blocks direct credit updates from users
CREATE OR REPLACE FUNCTION prevent_direct_credit_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if called by the refresh_user_balance trigger (system function)
  IF TG_OP = 'UPDATE' AND OLD.credits != NEW.credits THEN
    -- Check if this update is coming from the refresh_user_balance function
    -- by verifying the call stack (this is a simplified check)
    IF current_setting('application_name', true) = 'refresh_user_balance' THEN
      RETURN NEW;
    END IF;
    
    -- Block all other direct credit changes
    RAISE EXCEPTION 'Credits cannot be modified directly. Use the credits system.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to prevent direct credit manipulation
DROP TRIGGER IF EXISTS prevent_credit_manipulation ON users;
CREATE TRIGGER prevent_credit_manipulation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_credit_updates();

-- Update the refresh_user_balance function to set application_name
CREATE OR REPLACE FUNCTION refresh_user_balance() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  -- Set application name to identify this as a system update
  PERFORM set_config('application_name', 'refresh_user_balance', true);
  
  UPDATE users SET credits = (
    SELECT COALESCE(SUM(amount), 0) 
    FROM credits_ledger 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  ) WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  
  -- Reset application name
  PERFORM set_config('application_name', '', true);
  
  RETURN COALESCE(NEW, OLD);
END;
$$; 