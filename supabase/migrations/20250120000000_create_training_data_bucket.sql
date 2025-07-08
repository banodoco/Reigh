-- Create training-data storage bucket (private, using signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-data', 'training-data', false);

-- Create RLS policy for training-data bucket - users can only access their own files
CREATE POLICY "Users can upload their own training data files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'training-data' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own training data files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'training-data' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own training data files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'training-data' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own training data files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'training-data' AND auth.uid()::text = (storage.foldername(name))[1]); 