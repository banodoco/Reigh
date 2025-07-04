-- Create a function to verify if a JWT's jti is not revoked
create or replace function public.verify_api_token(p_jti text)
returns boolean as $$
declare
  v_jti_hash text;
  v_exists boolean;
begin
  -- Hash the JTI to match what's stored
  v_jti_hash := encode(digest(p_jti, 'sha256'), 'hex');
  
  -- Check if token exists and is not expired
  select exists(
    select 1 
    from public.user_api_tokens
    where jti_hash = v_jti_hash
    and expires_at > now()
  ) into v_exists;
  
  -- If token exists and is valid, update last_used
  if v_exists then
    update public.user_api_tokens
    set last_used = now()
    where jti_hash = v_jti_hash;
  end if;
  
  return v_exists;
end;
$$ language plpgsql security definer;

-- Grant execute permission to authenticated users
grant execute on function public.verify_api_token(text) to authenticated; 