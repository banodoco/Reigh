-- Update training-data storage bucket to be public (for easier access)
UPDATE storage.buckets 
SET public = true 
WHERE id = 'training-data'; 