-- Create temporary bucket for staging files before upload to external services
-- Files in this bucket should be cleaned up after processing

BEGIN;

-- Create the bucket if it does not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('temporary', 'temporary', false, 524288000)  -- 500MB limit
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload/download/delete their own files
-- Files are stored with user_id prefix: {user_id}/{filename}

CREATE POLICY "Users can upload to temporary bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'temporary' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read from temporary bucket"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'temporary' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete from temporary bucket"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'temporary' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can access all files (for Edge Functions)
CREATE POLICY "Service role can access all temporary files"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'temporary')
  WITH CHECK (bucket_id = 'temporary');

COMMIT;
