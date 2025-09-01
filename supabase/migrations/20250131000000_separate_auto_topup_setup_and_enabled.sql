-- Separate auto-top-up setup completion from enabled preference
-- Add new field to track setup completion vs user preference

-- Add setup completion tracking
ALTER TABLE users ADD COLUMN auto_topup_setup_completed boolean NOT NULL DEFAULT false;

-- Create index for performance
CREATE INDEX idx_users_auto_topup_setup ON users(auto_topup_setup_completed) WHERE auto_topup_setup_completed = true;

-- Update existing users who have Stripe data to mark as setup completed
UPDATE users 
SET auto_topup_setup_completed = true 
WHERE stripe_customer_id IS NOT NULL 
  AND stripe_payment_method_id IS NOT NULL 
  AND auto_topup_enabled = true
  AND auto_topup_amount IS NOT NULL
  AND auto_topup_threshold IS NOT NULL;

-- Update the trigger function to check both setup AND enabled
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
    auto_topup_setup_completed,
    auto_topup_threshold,
    auto_topup_amount,
    auto_topup_last_triggered,
    stripe_customer_id,
    stripe_payment_method_id
  INTO user_record
  FROM users 
  WHERE id = NEW.id;

  -- Exit if auto-top-up not both setup AND enabled
  IF NOT user_record.auto_topup_enabled 
     OR NOT user_record.auto_topup_setup_completed
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

-- Update RLS policies to include the new field
CREATE POLICY "Users can view their own auto-top-up setup status"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own auto-top-up setup status"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);
