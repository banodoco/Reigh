-- Create external_api_keys table for storing third-party service API keys (e.g., HuggingFace)
-- These are separate from user_api_tokens which are PATs for our own API

BEGIN;

CREATE TABLE IF NOT EXISTS public.external_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service VARCHAR(50) NOT NULL,  -- 'huggingface', 'replicate', etc.
  key_value TEXT NOT NULL,       -- The actual API token
  metadata JSONB DEFAULT '{}',   -- Optional metadata (e.g., HF username, verified status)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, service)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_external_api_keys_user_id ON public.external_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_external_api_keys_service ON public.external_api_keys(service);

-- Enable RLS
ALTER TABLE public.external_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own keys
CREATE POLICY "Users can view own external API keys"
  ON public.external_api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own external API keys"
  ON public.external_api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own external API keys"
  ON public.external_api_keys
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own external API keys"
  ON public.external_api_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_external_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_external_api_keys_updated_at
  BEFORE UPDATE ON public.external_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_external_api_keys_updated_at();

COMMIT;
