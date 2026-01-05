-- Migrate external_api_keys to use Supabase Vault for encryption
-- Secrets are stored encrypted in vault.secrets and referenced by ID

BEGIN;

-- Add column to store vault secret ID (the actual key_value will be in vault)
ALTER TABLE public.external_api_keys
ADD COLUMN IF NOT EXISTS vault_secret_id UUID;

-- Create function to save an external API key using Vault
-- This stores the secret encrypted in vault.secrets and saves a reference
CREATE OR REPLACE FUNCTION public.save_external_api_key(
  p_service TEXT,
  p_key_value TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id UUID;
  v_secret_name TEXT;
  v_secret_id UUID;
  v_existing_secret_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create unique name for this user+service combo
  v_secret_name := 'ext_api_' || v_user_id || '_' || p_service;

  -- Check if there's an existing secret to delete
  SELECT vault_secret_id INTO v_existing_secret_id
  FROM public.external_api_keys
  WHERE user_id = v_user_id AND service = p_service;

  -- Delete existing vault secret if any
  IF v_existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_existing_secret_id;
  END IF;

  -- Also delete by name in case of orphaned secrets
  DELETE FROM vault.secrets WHERE name = v_secret_name;

  -- Create new vault secret
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (v_secret_name, p_key_value, p_metadata::TEXT)
  RETURNING id INTO v_secret_id;

  -- Upsert the reference in external_api_keys
  INSERT INTO public.external_api_keys (user_id, service, key_value, metadata, vault_secret_id)
  VALUES (v_user_id, p_service, '', p_metadata, v_secret_id)
  ON CONFLICT (user_id, service)
  DO UPDATE SET
    key_value = '',  -- Clear plaintext (legacy)
    metadata = p_metadata,
    vault_secret_id = v_secret_id,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'secret_id', v_secret_id
  );
END;
$$;

-- Create function to delete an external API key
CREATE OR REPLACE FUNCTION public.delete_external_api_key(
  p_service TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id UUID;
  v_secret_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the vault secret ID
  SELECT vault_secret_id INTO v_secret_id
  FROM public.external_api_keys
  WHERE user_id = v_user_id AND service = p_service;

  -- Delete from vault if exists
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  -- Delete from external_api_keys
  DELETE FROM public.external_api_keys
  WHERE user_id = v_user_id AND service = p_service;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Create function to get decrypted key (for Edge Functions via service role)
-- This is used by Edge Functions that need to read the actual secret
CREATE OR REPLACE FUNCTION public.get_external_api_key_decrypted(
  p_user_id UUID,
  p_service TEXT
)
RETURNS TABLE (
  id UUID,
  service VARCHAR(50),
  key_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.service,
    COALESCE(d.decrypted_secret, e.key_value)::TEXT as key_value,  -- Fallback to legacy key_value
    e.metadata,
    e.created_at,
    e.updated_at
  FROM public.external_api_keys e
  LEFT JOIN vault.decrypted_secrets d ON d.id = e.vault_secret_id
  WHERE e.user_id = p_user_id AND e.service = p_service;
END;
$$;

-- Migrate existing plaintext keys to vault (if any exist)
DO $$
DECLARE
  r RECORD;
  v_secret_name TEXT;
  v_secret_id UUID;
BEGIN
  FOR r IN
    SELECT id, user_id, service, key_value, metadata
    FROM public.external_api_keys
    WHERE key_value IS NOT NULL
      AND key_value != ''
      AND vault_secret_id IS NULL
  LOOP
    -- Create unique name
    v_secret_name := 'ext_api_' || r.user_id || '_' || r.service;

    -- Insert into vault
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (v_secret_name, r.key_value, COALESCE(r.metadata::TEXT, '{}'))
    RETURNING id INTO v_secret_id;

    -- Update the reference and clear plaintext
    UPDATE public.external_api_keys
    SET vault_secret_id = v_secret_id, key_value = ''
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.save_external_api_key(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_external_api_key(TEXT) TO authenticated;
-- get_external_api_key_decrypted is for service role only (Edge Functions)

COMMIT;
