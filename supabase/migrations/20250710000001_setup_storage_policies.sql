-- Setup storage policies for image_uploads and lora_files buckets
-- This migration sets up Row Level Security policies to allow authenticated users to upload and access files

begin;

-- Enable RLS on storage.objects if not already enabled
-- alter table storage.objects enable row level security;

-- Policies for image_uploads bucket

create policy "image_uploads_select" on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'image_uploads');

create policy "image_uploads_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'image_uploads' and auth.uid() is not null);

create policy "image_uploads_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'image_uploads' and auth.uid() = owner)
  with check (bucket_id = 'image_uploads' and auth.uid() = owner);

create policy "image_uploads_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'image_uploads' and auth.uid() = owner);

-- Policy for lora_files bucket - allow authenticated users to insert/select/update/delete their own files

create policy "lora_files_select" on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'lora_files');

create policy "lora_files_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'lora_files' and auth.uid() is not null);

create policy "lora_files_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'lora_files' and auth.uid() = owner)
  with check (bucket_id = 'lora_files' and auth.uid() = owner);

create policy "lora_files_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'lora_files' and auth.uid() = owner);

commit; 