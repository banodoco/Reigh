begin;

-- Enable Discord OAuth provider (idempotent)
-- Supabase stores provider configs in auth.providers table. The default row usually exists, but we ensure it's enabled.

insert into auth.providers (provider, status)
values ('discord', 'ENABLED')
on conflict (provider) do update set status = 'ENABLED';

commit; 