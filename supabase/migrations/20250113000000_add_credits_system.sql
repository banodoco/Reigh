-- Add credits system to database
-- Add credits column to users table
ALTER TABLE users ADD COLUMN credits integer NOT NULL DEFAULT 0;

-- Create credit ledger type enum
CREATE TYPE credit_ledger_type AS ENUM ('stripe', 'manual', 'spend', 'refund');

-- Create credits_ledger table
CREATE TABLE credits_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  type credit_ledger_type NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_credits_ledger_user_id ON credits_ledger(user_id);
CREATE INDEX idx_credits_ledger_type ON credits_ledger(type);
CREATE INDEX idx_credits_ledger_created_at ON credits_ledger(created_at);

-- Create function to refresh user balance
CREATE OR REPLACE FUNCTION refresh_user_balance() 
RETURNS trigger 
LANGUAGE plpgsql 
AS $$
BEGIN
  UPDATE users SET credits = (
    SELECT COALESCE(SUM(amount), 0) 
    FROM credits_ledger 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  ) WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers to update user balance
CREATE TRIGGER credits_ledger_after_insert
  AFTER INSERT ON credits_ledger
  FOR EACH ROW EXECUTE FUNCTION refresh_user_balance();

CREATE TRIGGER credits_ledger_after_update
  AFTER UPDATE ON credits_ledger
  FOR EACH ROW EXECUTE FUNCTION refresh_user_balance();

CREATE TRIGGER credits_ledger_after_delete
  AFTER DELETE ON credits_ledger
  FOR EACH ROW EXECUTE FUNCTION refresh_user_balance();

-- Enable RLS on credits_ledger table
ALTER TABLE credits_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own credit ledger entries
CREATE POLICY "Users can view their own credit ledger"
  ON credits_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Only service role can insert credit ledger entries
CREATE POLICY "Service role can insert credit ledger entries"
  ON credits_ledger
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policy: Only service role can update credit ledger entries
CREATE POLICY "Service role can update credit ledger entries"
  ON credits_ledger
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- RLS Policy: Only service role can delete credit ledger entries
CREATE POLICY "Service role can delete credit ledger entries"
  ON credits_ledger
  FOR DELETE
  USING (auth.role() = 'service_role');

-- Create view for user credit balance (for easier querying)
CREATE VIEW user_credit_balance AS
SELECT 
  u.id as user_id,
  u.credits as current_balance,
  COALESCE(SUM(CASE WHEN cl.type IN ('stripe', 'manual') THEN cl.amount ELSE 0 END), 0) as total_purchased,
  COALESCE(SUM(CASE WHEN cl.type = 'spend' THEN ABS(cl.amount) ELSE 0 END), 0) as total_spent,
  COALESCE(SUM(CASE WHEN cl.type = 'refund' THEN cl.amount ELSE 0 END), 0) as total_refunded
FROM users u
LEFT JOIN credits_ledger cl ON u.id = cl.user_id
GROUP BY u.id, u.credits;

-- Note: RLS cannot be enabled on views, only on tables
-- The view will inherit access control from the underlying tables 