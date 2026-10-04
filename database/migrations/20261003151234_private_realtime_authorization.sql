-- Keep Realtime RLS lookups callable by policies, but outside the exposed API schema.
create schema if not exists quiz_private;
revoke all on schema quiz_private from public, anon;
grant usage on schema quiz_private to authenticated, service_role;

-- Policies retain their function dependencies when the functions change schema.
alter function public.can_receive_quiz_topic(text) set schema quiz_private;
alter function public.can_track_quiz_topic(text) set schema quiz_private;
