-- Raise capacity without removing existing quiz data or access controls.
alter table quiz_settings drop constraint quiz_settings_max_participants_check;
alter table quiz_settings add constraint quiz_settings_max_participants_check check (max_participants between 1 and 100);
alter table quiz_settings drop constraint quiz_settings_max_buzzes_per_question_check;
alter table quiz_settings add constraint quiz_settings_max_buzzes_per_question_check check (max_buzzes_per_question between 1 and 100);
alter table quiz_settings drop constraint quiz_settings_default_display_limit_check;
alter table quiz_settings add constraint quiz_settings_default_display_limit_check check (default_display_limit between 0 and 100);
alter table quiz_settings drop constraint quiz_settings_auto_lock_after_check;
alter table quiz_settings add constraint quiz_settings_auto_lock_after_check check (auto_lock_after between 1 and 100);
alter table buzzer_sessions drop constraint buzzer_sessions_record_limit_check;
alter table buzzer_sessions add constraint buzzer_sessions_record_limit_check check (record_limit between 1 and 100);
alter table buzzer_sessions drop constraint buzzer_sessions_auto_lock_after_check;
alter table buzzer_sessions add constraint buzzer_sessions_auto_lock_after_check check (auto_lock_after between 1 and 100);
alter table quiz_live_state drop constraint quiz_live_state_display_limit_check;
alter table quiz_live_state add constraint quiz_live_state_display_limit_check check (display_limit between 0 and 100);
alter table buzzes drop constraint buzzes_official_rank_check;
alter table buzzes add constraint buzzes_official_rank_check check (official_rank between 1 and 100);
alter table quiz_settings alter column max_participants set default 100;
alter table quiz_settings alter column max_buzzes_per_question set default 100;
update quiz_settings set max_participants=100 where max_participants=50;
alter table quiz_settings add column auto_start_timer boolean not null default false;
create or replace function run_command(p_auth uuid,p_quiz uuid,p_type text,p_version bigint,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; ls quiz_live_state; cfg quiz_settings; q questions; sid uuid; remaining int; running boolean;
begin
 select * into ls from quiz_live_state where quiz_id=p_quiz for update;
 m:=active_member(p_auth,p_quiz);
 if m.role<>'QUIZMASTER' then raise exception 'FORBIDDEN'; end if;
 if ls.version<>p_version then raise exception 'STALE_VERSION'; end if;
 select * into cfg from quiz_settings where quiz_id=p_quiz;
 if ls.status='COMPLETED' and p_type not in ('REVEAL_LEADERBOARD','HIDE_LEADERBOARD','SET_DISPLAY_LIMIT','SET_SHOW_OWN_POSITION') then raise exception 'QUIZ_COMPLETED'; end if;
 case p_type
 when 'START_QUIZ' then
  if ls.status not in ('SETUP','READY') or not exists(select 1 from questions where quiz_id=p_quiz) then raise exception 'INVALID_STATE'; end if;
  update quiz_live_state set status='LIVE' where quiz_id=p_quiz;
 when 'FINISH_QUIZ' then
  if ls.status<>'LIVE' or exists(select 1 from questions where quiz_id=p_quiz and status='ACTIVE') then raise exception 'COMPLETE_CURRENT_QUESTION'; end if;
  update quiz_live_state set status='COMPLETED',is_paused=false,timer_started_at=null,leaderboard_visible=case when p_payload ? 'value' then (p_payload->>'value')::boolean else leaderboard_visible or exists(select 1 from leaderboard_rules where quiz_id=p_quiz and trigger='EVENT') end where quiz_id=p_quiz;
  update quizzes set completed_at=clock_timestamp() where id=p_quiz;
 when 'START_QUESTION' then
  if ls.status<>'LIVE' or ls.is_paused or exists(select 1 from questions where quiz_id=p_quiz and status='ACTIVE') then raise exception 'INVALID_STATE'; end if;
  select * into q from questions where quiz_id=p_quiz and status='PENDING' order by sequence limit 1;
  if not found or (p_payload ? 'question_id' and q.id<>(p_payload->>'question_id')::uuid) then raise exception 'NEXT_QUESTION_REQUIRED'; end if;
  insert into buzzer_sessions(quiz_id,question_id,record_limit,auto_lock_after) values(p_quiz,q.id,cfg.max_buzzes_per_question,cfg.auto_lock_after) returning id into sid;
  update questions set status='ACTIVE' where id=q.id;
  update quiz_live_state set current_question_id=q.id,current_buzzer_session_id=sid,timer_started_at=case when cfg.auto_start_timer and cfg.default_timer_ms is not null then clock_timestamp() else null end,timer_duration_ms=cfg.default_timer_ms,timer_remaining_ms=cfg.default_timer_ms,timer_resume_on_quiz=false where quiz_id=p_quiz;
 when 'COMPLETE_QUESTION' then
  select * into q from questions where id=ls.current_question_id and status='ACTIVE';
  if not found then raise exception 'NO_ACTIVE_QUESTION'; end if;
  update questions set status='COMPLETED' where id=q.id;
  update buzzer_sessions set status='COMPLETED' where id=ls.current_buzzer_session_id;
  update quiz_live_state set timer_started_at=null,timer_remaining_ms=null,leaderboard_visible=leaderboard_visible or exists(
   select 1 from leaderboard_rules r where r.quiz_id=p_quiz and ((r.trigger='QUESTION' and r.target_id=q.id) or (r.trigger='ROUND' and r.target_id=q.round_id and not exists(select 1 from questions where round_id=q.round_id and status in ('PENDING','ACTIVE'))))) where quiz_id=p_quiz;
 when 'SKIP_QUESTION' then
  select * into q from questions where quiz_id=p_quiz and id=(p_payload->>'question_id')::uuid and status='PENDING';
  if not found or ls.is_paused then raise exception 'INVALID_STATE'; end if;
  update questions set status='SKIPPED' where id=q.id;
  update quiz_live_state set leaderboard_visible=leaderboard_visible or exists(select 1 from leaderboard_rules r where r.quiz_id=p_quiz and r.trigger='ROUND' and r.target_id=q.round_id and not exists(select 1 from questions where round_id=q.round_id and status in ('PENDING','ACTIVE'))) where quiz_id=p_quiz;
 when 'LOCK_BUZZER' then
  update buzzer_sessions set status='LOCKED',lock_reason=coalesce(nullif(p_payload->>'reason',''),'MANUAL') where id=ls.current_buzzer_session_id and status='OPEN';
  if not found then raise exception 'INVALID_STATE'; end if;
 when 'REOPEN_BUZZER' then
  if ls.is_paused or (ls.timer_started_at is not null and clock_timestamp()>=ls.timer_started_at+ls.timer_duration_ms*interval '1 millisecond' and cfg.lock_on_timer_end) then raise exception 'RESET_TIMER_FIRST'; end if;
  update buzzer_sessions set status='OPEN',lock_reason=null where id=ls.current_buzzer_session_id and status='LOCKED' and next_rank<=record_limit;
  if not found then raise exception 'INVALID_STATE'; end if;
 when 'PAUSE' then
  if ls.status<>'LIVE' or ls.is_paused then raise exception 'INVALID_STATE'; end if;
  remaining:=case when ls.timer_started_at is null then ls.timer_remaining_ms else greatest(0,ls.timer_duration_ms-floor(extract(epoch from (clock_timestamp()-ls.timer_started_at))*1000)::int) end;
  update quiz_live_state set is_paused=true,timer_resume_on_quiz=timer_started_at is not null,timer_remaining_ms=remaining,timer_started_at=null where quiz_id=p_quiz;
 when 'RESUME' then
  if ls.status<>'LIVE' or not ls.is_paused then raise exception 'INVALID_STATE'; end if;
  update quiz_live_state set is_paused=false,timer_started_at=case when timer_resume_on_quiz then clock_timestamp() else null end,timer_duration_ms=case when timer_resume_on_quiz then timer_remaining_ms else timer_duration_ms end,timer_resume_on_quiz=false where quiz_id=p_quiz;
 when 'SET_DISPLAY_LIMIT' then
  update quiz_live_state set display_limit=(p_payload->>'value')::int where quiz_id=p_quiz;
 when 'SET_SHOW_OWN_POSITION' then
  update quiz_live_state set show_own_position=(p_payload->>'value')::boolean where quiz_id=p_quiz;
 when 'TIMER_START' then
  if ls.is_paused or not exists(select 1 from questions where id=ls.current_question_id and status='ACTIVE') then raise exception 'NO_ACTIVE_QUESTION'; end if;
  remaining:=coalesce((p_payload->>'duration_ms')::int,ls.timer_remaining_ms,cfg.default_timer_ms);
  if remaining is null or remaining<1 or remaining>3600000 then raise exception 'INVALID_TIMER'; end if;
  update quiz_live_state set timer_started_at=clock_timestamp(),timer_duration_ms=remaining,timer_remaining_ms=null where quiz_id=p_quiz;
 when 'TIMER_PAUSE' then
  if ls.timer_started_at is null then raise exception 'INVALID_STATE'; end if;
  update quiz_live_state set timer_remaining_ms=greatest(0,ls.timer_duration_ms-floor(extract(epoch from(clock_timestamp()-ls.timer_started_at))*1000)::int),timer_started_at=null where quiz_id=p_quiz;
 when 'TIMER_RESET' then
  update quiz_live_state set timer_started_at=null,timer_duration_ms=cfg.default_timer_ms,timer_remaining_ms=cfg.default_timer_ms,timer_resume_on_quiz=false where quiz_id=p_quiz;
 when 'REVEAL_LEADERBOARD' then update quiz_live_state set leaderboard_visible=true where quiz_id=p_quiz;
 when 'HIDE_LEADERBOARD' then update quiz_live_state set leaderboard_visible=false where quiz_id=p_quiz;
 else raise exception 'UNKNOWN_COMMAND';
 end case;
 perform bump(p_quiz); perform audit(p_quiz,m.id,p_type,p_payload);
 return jsonb_build_object('ok',true,'version',ls.version+1);
end $$;
create or replace function setup_quiz(p_auth uuid,p_quiz uuid,p_entity text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; idv uuid; rid uuid; srid uuid; item jsonb; n int; req takeover_requests; entity_id uuid:=(p_payload->>'id')::uuid; op text:=coalesce(p_payload->>'operation','save');
begin
 perform 1 from quiz_live_state where quiz_id=p_quiz for update;
 m:=active_member(p_auth,p_quiz);
 if m.role<>'QUIZMASTER' then raise exception 'FORBIDDEN'; end if;
 case p_entity
 when 'rounds' then
  if op='delete' then delete from rounds where id=entity_id and quiz_id=p_quiz;
  elsif entity_id is null then
   insert into rounds(quiz_id,name,sequence,uses_subrounds,positive_score,negative_score,zero_score) values(p_quiz,p_payload->>'name',coalesce((select max(sequence)+1 from rounds where quiz_id=p_quiz),1),coalesce((p_payload->>'uses_subrounds')::boolean,false),(p_payload->>'positive_score')::numeric,(p_payload->>'negative_score')::numeric,(p_payload->>'zero_score')::numeric) returning id into idv;
  else
   update rounds set name=p_payload->>'name',positive_score=(p_payload->>'positive_score')::numeric,negative_score=(p_payload->>'negative_score')::numeric,zero_score=(p_payload->>'zero_score')::numeric where id=entity_id and quiz_id=p_quiz;
  end if;
 when 'subrounds' then
  rid:=(p_payload->>'round_id')::uuid;
  if op='delete' then delete from subrounds where id=entity_id and quiz_id=p_quiz;
  else
   if not exists(select 1 from rounds where id=rid and quiz_id=p_quiz and uses_subrounds) then raise exception 'INVALID_ROUND'; end if;
   if entity_id is null then
    insert into subrounds(quiz_id,round_id,name,sequence,positive_score,negative_score,zero_score) values(p_quiz,rid,p_payload->>'name',coalesce((select max(sequence)+1 from subrounds where round_id=rid),1),(p_payload->>'positive_score')::numeric,(p_payload->>'negative_score')::numeric,(p_payload->>'zero_score')::numeric) returning id into idv;
   else update subrounds set name=p_payload->>'name',positive_score=(p_payload->>'positive_score')::numeric,negative_score=(p_payload->>'negative_score')::numeric,zero_score=(p_payload->>'zero_score')::numeric where id=entity_id and quiz_id=p_quiz; end if;
  end if;
 when 'questions' then
  if op='delete' then
   delete from questions where id=entity_id and quiz_id=p_quiz and status='PENDING';
   if not found then raise exception 'ONLY_PENDING_QUESTIONS_CAN_BE_DELETED'; end if;
  elsif entity_id is not null then
   update questions set positive_score=(p_payload->>'positive_score')::numeric,negative_score=(p_payload->>'negative_score')::numeric,zero_score=(p_payload->>'zero_score')::numeric where id=entity_id and quiz_id=p_quiz;
  else
   rid:=(p_payload->>'round_id')::uuid; srid:=(p_payload->>'subround_id')::uuid;
   if not exists(select 1 from rounds where id=rid and quiz_id=p_quiz and uses_subrounds=(srid is not null)) or (srid is not null and not exists(select 1 from subrounds where id=srid and round_id=rid and quiz_id=p_quiz)) then raise exception 'INVALID_ROUND'; end if;
   n:=coalesce((p_payload->>'count')::int,1);
   if n not between 1 and 100 then raise exception 'INVALID_COUNT'; end if;
   for i in 1..n loop
    insert into questions(quiz_id,round_id,subround_id,question_number,sequence) select p_quiz,rid,srid,coalesce(max(question_number),0)+1,coalesce(max(sequence),0)+1 from questions where quiz_id=p_quiz returning id into idv;
   end loop;
  end if;
 when 'participants' then
  if op='delete' then delete from participants where id=entity_id and quiz_id=p_quiz;
  elsif op='rotate' then update participants set join_code=new_code() where id=entity_id and quiz_id=p_quiz;
  elsif op='revoke_code' then update participants set join_code=null where id=entity_id and quiz_id=p_quiz;
  elsif entity_id is not null then update participants set display_name=p_payload->>'display_name',type=p_payload->>'type' where id=entity_id and quiz_id=p_quiz;
  else
   for item in select value from jsonb_array_elements(coalesce(p_payload->'items',jsonb_build_array(p_payload))) loop
    if (select count(*) from participants where quiz_id=p_quiz)>=(select max_participants from quiz_settings where quiz_id=p_quiz) then raise exception 'PARTICIPANT_LIMIT'; end if;
    insert into participants(quiz_id,display_name,identifier,type,join_code) values(p_quiz,item->>'display_name',lower(trim(coalesce(item->>'identifier',item->>'display_name'))),coalesce(item->>'type','TEAM'),new_code()) returning id into idv;
   end loop;
  end if;
 when 'settings' then
  if (p_payload->>'max_participants')::int<(select count(*) from participants where quiz_id=p_quiz) then raise exception 'PARTICIPANT_LIMIT'; end if;
  update quiz_settings set max_participants=(p_payload->>'max_participants')::int,max_buzzes_per_question=(p_payload->>'max_buzzes_per_question')::int,
  default_display_limit=(p_payload->>'default_display_limit')::int,show_own_position=(p_payload->>'show_own_position')::boolean,
  default_positive_score=(p_payload->>'default_positive_score')::numeric,default_negative_score=(p_payload->>'default_negative_score')::numeric,default_zero_score=(p_payload->>'default_zero_score')::numeric,
  participant_mode=p_payload->>'participant_mode',identifier_style=p_payload->>'identifier_style',auto_lock_after=(p_payload->>'auto_lock_after')::int,lock_on_timer_end=(p_payload->>'lock_on_timer_end')::boolean,default_timer_ms=(p_payload->>'default_timer_ms')::int,audience_enabled=(p_payload->>'audience_enabled')::boolean,auto_start_timer=coalesce((p_payload->>'auto_start_timer')::boolean,false) where quiz_id=p_quiz;
  update quiz_live_state set display_limit=(p_payload->>'default_display_limit')::int,show_own_position=(p_payload->>'show_own_position')::boolean where quiz_id=p_quiz;
  if not (p_payload->>'audience_enabled')::boolean then update quiz_members set revoked_at=clock_timestamp() where quiz_id=p_quiz and role='AUDIENCE' and revoked_at is null; end if;
 when 'access' then
  update quiz_access set code=case when op='rotate' then new_code() else code end,active=coalesce((p_payload->>'active')::boolean,active) where quiz_id=p_quiz and kind=p_payload->>'kind';
  if (p_payload->>'active')::boolean=false then update quiz_members set revoked_at=clock_timestamp() where quiz_id=p_quiz and role=p_payload->>'kind' and revoked_at is null; end if;
 when 'members' then
  if entity_id=m.id then raise exception 'CANNOT_REVOKE_SELF'; end if;
  update quiz_members set revoked_at=clock_timestamp() where id=entity_id and quiz_id=p_quiz;
 when 'takeovers' then
  select * into req from takeover_requests where id=entity_id and quiz_id=p_quiz and status='PENDING';
  if not found then raise exception 'INVALID_TAKEOVER'; end if;
  if op='approve' then
   update quiz_members set revoked_at=clock_timestamp() where quiz_id=p_quiz and (participant_id=req.participant_id or auth_uid=req.auth_uid) and revoked_at is null;
   insert into quiz_members(quiz_id,auth_uid,role,display_name,participant_id) select p_quiz,req.auth_uid,'PARTICIPANT',display_name,req.participant_id from participants where id=req.participant_id;
  end if;
  update takeover_requests set status=case when op='approve' then 'APPROVED' else 'REJECTED' end where id=req.id;
 when 'rules' then
  if op='delete' then delete from leaderboard_rules where id=entity_id and quiz_id=p_quiz;
  else
   if (p_payload->>'trigger'='QUESTION' and not exists(select 1 from questions where id=(p_payload->>'target_id')::uuid and quiz_id=p_quiz)) or (p_payload->>'trigger'='ROUND' and not exists(select 1 from rounds where id=(p_payload->>'target_id')::uuid and quiz_id=p_quiz)) then raise exception 'INVALID_RULE'; end if;
   insert into leaderboard_rules(quiz_id,trigger,target_id) values(p_quiz,p_payload->>'trigger',(p_payload->>'target_id')::uuid);
  end if;
 else raise exception 'UNKNOWN_ENTITY';
 end case;
 perform bump(p_quiz); perform audit(p_quiz,m.id,'SETUP_'||upper(p_entity),p_payload-'items');
 return jsonb_build_object('ok',true,'id',idv);
end $$;
create or replace function get_snapshot(p_auth uuid,p_quiz uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; ls quiz_live_state;
begin
 -- The same lock order as commands and buzzes avoids lock inversion on timer expiry.
 select * into ls from quiz_live_state where quiz_id=p_quiz;
 m:=active_member(p_auth,p_quiz);

 if not ls.is_paused and ls.timer_started_at is not null and clock_timestamp()>=ls.timer_started_at+ls.timer_duration_ms*interval '1 millisecond' and (select lock_on_timer_end from quiz_settings where quiz_id=p_quiz) then
  select * into ls from quiz_live_state where quiz_id=p_quiz for update;
  if not ls.is_paused and ls.timer_started_at is not null and clock_timestamp()>=ls.timer_started_at+ls.timer_duration_ms*interval '1 millisecond' then
  update buzzer_sessions set status='LOCKED',lock_reason='TIMER_END' where id=ls.current_buzzer_session_id and status='OPEN';
  if found then perform bump(p_quiz); perform audit(p_quiz,null,'TIMER_COMPLETED'); end if;
  end if;
 end if;
 update quiz_members set last_seen_at=clock_timestamp() where id=m.id and last_seen_at<clock_timestamp()-interval '10 seconds';
 return snapshot_data(p_quiz,m.role,m.id);
end $$;
create function participant_code_info(p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 select jsonb_build_object('individual',true,'display_name',display_name) into result from participants where join_code=p_code;
 if result is not null then return result; end if;
 if exists(select 1 from quiz_access a join quiz_settings s on s.quiz_id=a.quiz_id where a.code=p_code and a.kind='PARTICIPANT' and a.active and s.participant_mode='OPEN') then return jsonb_build_object('individual',false); end if;
 raise exception 'INVALID_CODE';
end $$;
create function api_record_buzz(p_auth uuid,p_quiz uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not rate_limit('api:'||p_auth,600,60) or not rate_limit('buzz:'||p_auth||':'||p_quiz,20,10) then raise exception 'RATE_LIMITED'; end if;
 return record_buzz(p_auth,p_quiz,p_session);
end $$;
revoke all on function participant_code_info(text),api_record_buzz(uuid,uuid,uuid) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 revoke all on function participant_code_info(text),api_record_buzz(uuid,uuid,uuid) from anon,authenticated;
 grant execute on function participant_code_info(text),api_record_buzz(uuid,uuid,uuid) to service_role;
end if; end $$;
