-- Add token column to user_api_tokens table to store actual JWT token
-- This allows users to retrieve their tokens later for convenience

begin;

-- Add token column to store the actual JWT token
alter table public.user_api_tokens 
add column token text;

-- Add comment explaining the column
comment on column public.user_api_tokens.token is 'The actual JWT token for user convenience';

commit; 