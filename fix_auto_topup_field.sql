-- Add the missing auto_topup_setup_completed field
-- This should have been added by migration 20250131000000 but seems to be missing

-- Check if the column already exists before adding it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'auto_topup_setup_completed'
    ) THEN
        -- Add the column
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
          
        RAISE NOTICE 'Added auto_topup_setup_completed column and updated existing data';
    ELSE
        RAISE NOTICE 'Column auto_topup_setup_completed already exists';
    END IF;
END $$;
