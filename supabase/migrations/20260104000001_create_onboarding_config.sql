-- Config table for onboarding template references
-- This allows us to configure which project/shot/video to use as template content
-- for new user onboarding without code changes

CREATE TABLE IF NOT EXISTS onboarding_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies
ALTER TABLE onboarding_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read config (needed for client-side template copying)
CREATE POLICY "Allow public read access to onboarding_config"
  ON onboarding_config
  FOR SELECT
  USING (true);

-- Only authenticated users with admin role can modify (for now, restrict to service role)
-- In production, you'd likely manage this through a migration or admin API
CREATE POLICY "Allow service role to modify onboarding_config"
  ON onboarding_config
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_onboarding_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER onboarding_config_updated_at
  BEFORE UPDATE ON onboarding_config
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_config_updated_at();

-- Add comment explaining the table
COMMENT ON TABLE onboarding_config IS 'Configuration for dynamic onboarding content. Template key stores project_id, shot_id, and featured_video_id.';
