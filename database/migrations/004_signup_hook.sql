-- Create the owner's Auth account before enabling this hook in the Supabase dashboard.
-- Allow anonymous identities; deny public permanent-account registration.
create function public.before_quiz_user_created(event jsonb) returns jsonb
language plpgsql set search_path=public as $$
begin
 if coalesce((event->'user'->>'is_anonymous')::boolean,false) then return '{}'::jsonb; end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Public account registration is disabled. Ask the quiz owner for an access code.'));
end $$;
revoke all on function public.before_quiz_user_created(jsonb) from public,anon,authenticated;
grant execute on function public.before_quiz_user_created(jsonb) to supabase_auth_admin;
