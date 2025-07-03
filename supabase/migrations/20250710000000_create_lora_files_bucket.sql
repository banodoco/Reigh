-- Create public bucket for storing LoRA model files in Supabase Storage
-- This migration is idempotent: it will do nothing if the bucket already exists.

begin;

-- Create the bucket if it does not exist
insert into storage.buckets (id, name, public) values ('lora_files', 'lora_files', true)
  on conflict (id) do nothing;

commit; 