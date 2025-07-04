-- Create user_api_tokens table
create table public.user_api_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  jti_hash    text not null,
  label       text,
  created_at  timestamptz default now() not null,
  expires_at  timestamptz not null,
  last_used   timestamptz
);

-- Create indexes for better performance
create index idx_user_api_tokens_user_id on public.user_api_tokens(user_id);
create index idx_user_api_tokens_jti_hash on public.user_api_tokens(jti_hash);
create index idx_user_api_tokens_expires_at on public.user_api_tokens(expires_at);

-- Enable RLS
alter table public.user_api_tokens enable row level security;

-- RLS Policies: Only owner can read their tokens
create policy "Users can view their own API tokens"
  on public.user_api_tokens
  for select
  using (auth.uid() = user_id);

-- No direct insert/update/delete allowed from client
-- All token management goes through Edge Functions 