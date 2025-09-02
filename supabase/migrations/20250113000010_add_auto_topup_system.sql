-- Add auto-top-up system to database
-- Add auto-top-up fields to users table
ALTER TABLE users ADD COLUMN stripe_customer_id text;
ALTER TABLE users ADD COLUMN stripe_payment_method_id text;
ALTER TABLE users ADD COLUMN auto_topup_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN auto_topup_amount integer; -- in cents
ALTER TABLE users ADD COLUMN auto_topup_threshold integer; -- in cents
ALTER TABLE users ADD COLUMN auto_topup_last_triggered timestamptz;

-- Add auto_topup to credit ledger enum
ALTER TYPE credit_ledger_type ADD VALUE 'auto_topup';

-- Create indexes for better performance
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_users_auto_topup_enabled ON users(auto_topup_enabled) WHERE auto_topup_enabled = true;
CREATE INDEX idx_users_auto_topup_threshold ON users(auto_topup_threshold) WHERE auto_topup_enabled = true;

-- RLS Policy: Users can only read/update their own auto-top-up settings
CREATE POLICY "Users can view their own auto-top-up settings"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own auto-top-up settings"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Create function to check if auto-top-up should trigger
CREATE OR REPLACE FUNCTION check_auto_topup_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  time_since_last_trigger interval;
BEGIN
  -- Only check when credits decrease (not increase)
  IF NEW.credits >= OLD.credits THEN
    RETURN NEW;
  END IF;

  -- Get user auto-top-up settings
  SELECT 
    auto_topup_enabled,
    auto_topup_threshold,
    auto_topup_amount,
    auto_topup_last_triggered,
    stripe_customer_id,
    stripe_payment_method_id
  INTO user_record
  FROM users 
  WHERE id = NEW.id;

  -- Exit if auto-top-up not enabled or not configured
  IF NOT user_record.auto_topup_enabled 
     OR user_record.auto_topup_threshold IS NULL 
     OR user_record.auto_topup_amount IS NULL
     OR user_record.stripe_customer_id IS NULL
     OR user_record.stripe_payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Exit if balance is still above threshold
  IF NEW.credits > user_record.auto_topup_threshold THEN
    RETURN NEW;
  END IF;

  -- Rate limiting: prevent triggering more than once per hour
  IF user_record.auto_topup_last_triggered IS NOT NULL THEN
    time_since_last_trigger := NOW() - user_record.auto_topup_last_triggered;
    IF time_since_last_trigger < interval '1 hour' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Update last triggered timestamp to prevent duplicate triggers
  UPDATE users 
  SET auto_topup_last_triggered = NOW()
  WHERE id = NEW.id;

  -- Call the trigger-auto-topup edge function
  -- Note: This uses pg_net extension to make HTTP requests
  PERFORM 
    net.http_post(
      url := 'https://wczysqzxlwdndgxitrvc.supabase.co/functions/v1/trigger-auto-topup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
      ),
      body := jsonb_build_object(
        'userId', NEW.id
      )
    );

  RETURN NEW;
END;
$$;

-- Create trigger to monitor credit balance changes
CREATE TRIGGER auto_topup_trigger
  AFTER UPDATE OF credits ON users
  FOR EACH ROW
  WHEN (OLD.credits IS DISTINCT FROM NEW.credits)
  EXECUTE FUNCTION check_auto_topup_trigger();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_auto_topup_trigger() TO service_role;
