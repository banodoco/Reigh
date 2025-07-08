-- Update training-data storage bucket to be private (works better with signed URLs and RLS)
UPDATE storage.buckets 
SET public = false 
WHERE id = 'training-data'; 