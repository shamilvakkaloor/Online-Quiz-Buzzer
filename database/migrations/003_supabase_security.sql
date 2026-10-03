-- Apply ONLY to Supabase after 001 and 002. Do not add these tables to public realtime replication.
do $$ declare t text; f record; begin
 foreach t in array array['admin_users','quizzes','quiz_settings','quiz_access','rounds','subrounds','questions','participants','quiz_members','buzzer_sessions','quiz_live_state','buzzes','scores','score_revisions','audit_logs','takeover_requests','leaderboard_rules','auth_attempts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('new_code','rate_limit','resolve_scoring','leaderboard','active_member','audit','bump','record_buzz','run_command','upsert_score','join_quiz','setup_quiz','snapshot_data','get_snapshot','admin_action','lookup_quiz','membership_status','rotate_realtime_epoch') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- RLS is evaluated when a socket joins, not for every delivered message. Epoch rotation
-- ensures revoked sockets never receive new broadcasts; active screens resubscribe.
create function public.can_receive_quiz_topic(topic text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from quiz_members m join quiz_live_state ls on ls.quiz_id=m.quiz_id
 where m.auth_uid=auth.uid() and m.revoked_at is null and (
 topic='quiz:'||m.quiz_id||':'||ls.realtime_epoch||':display' or
 (m.role in ('QUIZMASTER','SCOREKEEPER') and topic='quiz:'||m.quiz_id||':'||ls.realtime_epoch||':staff') or
 topic='quiz:'||m.quiz_id||':'||ls.realtime_epoch||':presence:'||m.id or
 (m.role in ('QUIZMASTER','SCOREKEEPER') and exists(select 1 from quiz_members other where other.quiz_id=m.quiz_id and other.revoked_at is null and topic='quiz:'||m.quiz_id||':'||ls.realtime_epoch||':presence:'||other.id))))
$$;
create function public.can_track_quiz_topic(topic text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from quiz_members m join quiz_live_state ls on ls.quiz_id=m.quiz_id where m.auth_uid=auth.uid() and m.revoked_at is null and topic='quiz:'||m.quiz_id||':'||ls.realtime_epoch||':presence:'||m.id)
$$;
revoke all on function public.can_receive_quiz_topic(text),public.can_track_quiz_topic(text) from public,anon;
grant execute on function public.can_receive_quiz_topic(text),public.can_track_quiz_topic(text) to authenticated;
create policy "quiz members receive role topics" on realtime.messages for select to authenticated using(public.can_receive_quiz_topic(realtime.topic()));
create policy "members track only their own presence topic" on realtime.messages for insert to authenticated with check(extension='presence' and public.can_track_quiz_topic(realtime.topic()));
