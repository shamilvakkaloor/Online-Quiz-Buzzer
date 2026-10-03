-- Shared by Supabase PostgreSQL and the local PGlite practice workspace.
-- All mutations lock live state first, then membership/session rows, in that order.
create table admin_users (user_id uuid primary key, created_at timestamptz not null default now());
create table quizzes (
 id uuid primary key default gen_random_uuid(), quiz_code text unique not null,
 password_hash text not null, title text not null check (length(title) between 1 and 120),
 created_by uuid, created_at timestamptz not null default now(), completed_at timestamptz
);
create table quiz_settings (
 quiz_id uuid primary key references quizzes on delete cascade,
 max_participants int not null default 50 check (max_participants between 1 and 50),
 max_buzzes_per_question int not null default 50 check (max_buzzes_per_question between 1 and 50),
 default_display_limit int not null default 3 check (default_display_limit between 0 and 50),
 show_own_position boolean not null default true,
 default_positive_score numeric(8,2) not null default 10, default_negative_score numeric(8,2) not null default -5,
 default_zero_score numeric(8,2) default 0, participant_mode text not null default 'PRE_REGISTERED' check (participant_mode in ('OPEN','PRE_REGISTERED')),
 identifier_style text not null default 'Team name', auto_lock_after int check (auto_lock_after between 1 and 50),
 lock_on_timer_end boolean not null default true, default_timer_ms int default 30000 check (default_timer_ms between 1000 and 3600000),
 audience_enabled boolean not null default true
);
create table quiz_access (
 quiz_id uuid references quizzes on delete cascade, kind text check (kind in ('PARTICIPANT','SCOREKEEPER','AUDIENCE')),
 code text unique not null, active boolean not null default true, primary key(quiz_id,kind)
);
create table rounds (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 name text not null, sequence int not null check(sequence > 0), uses_subrounds boolean not null default false,
 positive_score numeric(8,2), negative_score numeric(8,2), zero_score numeric(8,2), unique(quiz_id,sequence)
);
create table subrounds (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 round_id uuid not null references rounds on delete cascade, name text not null, sequence int not null check(sequence > 0),
 positive_score numeric(8,2), negative_score numeric(8,2), zero_score numeric(8,2), unique(round_id,sequence)
);
create table questions (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 round_id uuid not null references rounds, subround_id uuid references subrounds,
 question_number int not null, sequence int not null check(sequence > 0), status text not null default 'PENDING' check(status in ('PENDING','ACTIVE','COMPLETED','SKIPPED')),
 positive_score numeric(8,2), negative_score numeric(8,2), zero_score numeric(8,2), unique(quiz_id,sequence), unique(quiz_id,question_number)
);
create unique index one_active_question on questions(quiz_id) where status='ACTIVE';
create table participants (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 display_name text not null, identifier text not null, type text not null default 'TEAM' check(type in ('TEAM','PERSON')),
 join_code text unique, created_at timestamptz not null default now(), unique(quiz_id,identifier)
);
create table quiz_members (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 auth_uid uuid not null, role text not null check(role in ('QUIZMASTER','PARTICIPANT','SCOREKEEPER','AUDIENCE')),
 display_name text not null, participant_id uuid references participants,
 revoked_at timestamptz, last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(),
 check ((role='PARTICIPANT') = (participant_id is not null))
);
create unique index one_active_identity on quiz_members(quiz_id,auth_uid) where revoked_at is null;
create unique index one_active_device on quiz_members(participant_id) where revoked_at is null and participant_id is not null;
create index member_lookup on quiz_members(auth_uid,quiz_id);
create table buzzer_sessions (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 question_id uuid unique not null references questions, status text not null default 'OPEN' check(status in ('OPEN','LOCKED','COMPLETED')),
 next_rank int not null default 1, record_limit int not null check(record_limit between 1 and 50),
 auto_lock_after int check(auto_lock_after between 1 and 50), lock_reason text,
 opened_at timestamptz not null default clock_timestamp()
);
create table quiz_live_state (
 quiz_id uuid primary key references quizzes on delete cascade,
 status text not null default 'SETUP' check(status in ('SETUP','READY','LIVE','COMPLETED')),
 current_question_id uuid references questions, current_buzzer_session_id uuid references buzzer_sessions,
 is_paused boolean not null default false, display_limit int not null default 3 check(display_limit between 0 and 50),
 show_own_position boolean not null default true, leaderboard_visible boolean not null default false,
 timer_started_at timestamptz, timer_duration_ms int, timer_remaining_ms int, timer_resume_on_quiz boolean not null default false,
 version bigint not null default 1, realtime_epoch bigint not null default 1, updated_at timestamptz not null default clock_timestamp()
);
create table buzzes (
 id uuid primary key default gen_random_uuid(), buzzer_session_id uuid not null references buzzer_sessions,
 participant_id uuid not null references participants, member_id uuid not null references quiz_members,
 official_rank int not null check(official_rank between 1 and 50), server_received_at timestamptz not null default clock_timestamp(),
 unique(buzzer_session_id,participant_id), unique(buzzer_session_id,official_rank)
);
create table scores (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 question_id uuid not null references questions, participant_id uuid not null references participants,
 value numeric(8,2) not null, revision int not null default 1, unique(question_id,participant_id)
);
create table score_revisions (
 id uuid primary key default gen_random_uuid(), score_id uuid not null references scores,
 old_value numeric(8,2), new_value numeric(8,2) not null, member_id uuid not null references quiz_members,
 reason text not null, created_at timestamptz not null default clock_timestamp()
);
create table audit_logs (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 member_id uuid references quiz_members, action text not null, details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create index audit_quiz on audit_logs(quiz_id,created_at desc);
create table takeover_requests (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes,
 participant_id uuid not null references participants, auth_uid uuid not null, display_name text not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')), created_at timestamptz not null default now()
);
create unique index one_pending_takeover on takeover_requests(quiz_id,auth_uid) where status='PENDING';
create table leaderboard_rules (
 id uuid primary key default gen_random_uuid(), quiz_id uuid not null references quizzes on delete cascade,
 trigger text not null check(trigger in ('QUESTION','ROUND','EVENT')), target_id uuid
);
create table auth_attempts (key text primary key, count int not null default 0, window_start timestamptz not null default now());

create function rotate_realtime_epoch() returns trigger language plpgsql set search_path=public as $$
begin
 if old.revoked_at is null and new.revoked_at is not null then update quiz_live_state set realtime_epoch=realtime_epoch+1 where quiz_id=new.quiz_id; end if;
 return new;
end $$;
create trigger member_revoked after update on quiz_members for each row execute function rotate_realtime_epoch();

create function new_code() returns text language sql volatile set search_path=public as $$
 select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',1+(get_byte(decode(replace(gen_random_uuid()::text,'-',''),'hex'),0)%30),1),'') from generate_series(1,8)
$$;
create function rate_limit(p_key text,p_limit int,p_window int) returns boolean language plpgsql security definer set search_path=public as $$
declare n int;
begin
 insert into auth_attempts as a(key,count,window_start) values(p_key,1,clock_timestamp())
 on conflict(key) do update set count=case when a.window_start < clock_timestamp()-make_interval(secs=>p_window) then 1 else a.count+1 end,
 window_start=case when a.window_start < clock_timestamp()-make_interval(secs=>p_window) then clock_timestamp() else a.window_start end returning count into n;
 return n<=p_limit;
end $$;
create function resolve_scoring(p_question uuid) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('positive_score',coalesce(q.positive_score,s.positive_score,r.positive_score,c.default_positive_score),
 'negative_score',coalesce(q.negative_score,s.negative_score,r.negative_score,c.default_negative_score),
 'zero_score',coalesce(q.zero_score,s.zero_score,r.zero_score,c.default_zero_score))
 from questions q join rounds r on r.id=q.round_id left join subrounds s on s.id=q.subround_id join quiz_settings c on c.quiz_id=q.quiz_id where q.id=p_question
$$;
create function leaderboard(p_quiz uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.rank,t.display_name),'[]') from (
 select p.id participant_id,p.display_name,coalesce(sum(s.value),0) total,rank() over(order by coalesce(sum(s.value),0) desc) rank
 from participants p left join scores s on s.participant_id=p.id where p.quiz_id=p_quiz group by p.id
 ) t
$$;
create function active_member(p_auth uuid,p_quiz uuid) returns quiz_members language plpgsql stable security definer set search_path=public as $$
declare m quiz_members;
begin
 select * into m from quiz_members where auth_uid=p_auth and quiz_id=p_quiz and revoked_at is null;
 if not found then raise exception 'SESSION_REVOKED'; end if;
 return m;
end $$;
create function audit(p_quiz uuid,p_member uuid,p_action text,p_details jsonb default '{}') returns void language sql set search_path=public as $$
 insert into audit_logs(quiz_id,member_id,action,details) values(p_quiz,p_member,p_action,p_details)
$$;
create function bump(p_quiz uuid) returns void language sql set search_path=public as $$
 update quiz_live_state set version=version+1,updated_at=clock_timestamp() where quiz_id=p_quiz
$$;

create function record_buzz(p_auth uuid,p_quiz uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; s buzzer_sessions; ls quiz_live_state; r int; expired boolean;
begin
 select * into ls from quiz_live_state where quiz_id=p_quiz for update;
 m:=active_member(p_auth,p_quiz);
 if m.role<>'PARTICIPANT' then raise exception 'FORBIDDEN'; end if;
 if p_session is distinct from ls.current_buzzer_session_id then raise exception 'STALE_SESSION'; end if;
 select * into s from buzzer_sessions where id=p_session and quiz_id=p_quiz for update;
 if not found then raise exception 'STALE_SESSION'; end if;
 select official_rank into r from buzzes where buzzer_session_id=s.id and participant_id=m.participant_id;
 if found then return jsonb_build_object('accepted',true,'official_rank',case when ls.show_own_position then r else null end,'was_duplicate',true); end if;
 expired:=ls.timer_started_at is not null and clock_timestamp()>=ls.timer_started_at+ls.timer_duration_ms*interval '1 millisecond' and (select lock_on_timer_end from quiz_settings where quiz_id=p_quiz);
 if expired and s.status='OPEN' then
  update buzzer_sessions set status='LOCKED',lock_reason='TIMER_END' where id=s.id;
  perform bump(p_quiz); perform audit(p_quiz,null,'TIMER_COMPLETED');
 end if;
 if expired or ls.status<>'LIVE' or ls.is_paused or s.status<>'OPEN' then return jsonb_build_object('error','BUZZER_CLOSED'); end if;
 if s.next_rank>s.record_limit then return jsonb_build_object('error','LIMIT_REACHED'); end if;
 insert into buzzes(buzzer_session_id,participant_id,member_id,official_rank) values(s.id,m.participant_id,m.id,s.next_rank);
 update buzzer_sessions set next_rank=next_rank+1,
 status=case when next_rank>=record_limit or (auto_lock_after is not null and next_rank>=auto_lock_after) then 'LOCKED' else status end,
 lock_reason=case when next_rank>=record_limit then 'RECORD_LIMIT' when auto_lock_after is not null and next_rank>=auto_lock_after then 'AUTO_LIMIT' else lock_reason end where id=s.id;
 perform bump(p_quiz); perform audit(p_quiz,m.id,'BUZZ_RECEIVED',jsonb_build_object('rank',s.next_rank,'session',s.id));
 return jsonb_build_object('accepted',true,'official_rank',case when ls.show_own_position then s.next_rank else null end,'was_duplicate',false);
end $$;

create function run_command(p_auth uuid,p_quiz uuid,p_type text,p_version bigint,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
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
  update quiz_live_state set status='COMPLETED',is_paused=false,timer_started_at=null,leaderboard_visible=leaderboard_visible or exists(select 1 from leaderboard_rules where quiz_id=p_quiz and trigger='EVENT') where quiz_id=p_quiz;
  update quizzes set completed_at=clock_timestamp() where id=p_quiz;
 when 'START_QUESTION' then
  if ls.status<>'LIVE' or ls.is_paused or exists(select 1 from questions where quiz_id=p_quiz and status='ACTIVE') then raise exception 'INVALID_STATE'; end if;
  select * into q from questions where quiz_id=p_quiz and status='PENDING' order by sequence limit 1;
  if not found or (p_payload ? 'question_id' and q.id<>(p_payload->>'question_id')::uuid) then raise exception 'NEXT_QUESTION_REQUIRED'; end if;
  insert into buzzer_sessions(quiz_id,question_id,record_limit,auto_lock_after) values(p_quiz,q.id,cfg.max_buzzes_per_question,cfg.auto_lock_after) returning id into sid;
  update questions set status='ACTIVE' where id=q.id;
  update quiz_live_state set current_question_id=q.id,current_buzzer_session_id=sid,timer_started_at=null,timer_duration_ms=cfg.default_timer_ms,timer_remaining_ms=cfg.default_timer_ms,timer_resume_on_quiz=false where quiz_id=p_quiz;
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

create function upsert_score(p_auth uuid,p_quiz uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; old scores; sid uuid; qid uuid:=(p_payload->>'question_id')::uuid; pid uuid:=(p_payload->>'participant_id')::uuid; val numeric(8,2):=(p_payload->>'value')::numeric;
begin
 perform 1 from quiz_live_state where quiz_id=p_quiz for update;
 m:=active_member(p_auth,p_quiz);
 if m.role not in ('QUIZMASTER','SCOREKEEPER') then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from questions where id=qid and quiz_id=p_quiz and status in ('ACTIVE','COMPLETED')) or not exists(select 1 from participants where id=pid and quiz_id=p_quiz) then raise exception 'INVALID_SCORE_TARGET'; end if;
 select * into old from scores where question_id=qid and participant_id=pid;
 if coalesce(old.revision,0)<>coalesce((p_payload->>'expected_revision')::int,0) then raise exception 'STALE_SCORE'; end if;
 insert into scores(quiz_id,question_id,participant_id,value) values(p_quiz,qid,pid,val) on conflict(question_id,participant_id) do update set value=excluded.value,revision=scores.revision+1 returning id into sid;
 insert into score_revisions(score_id,old_value,new_value,member_id,reason) values(sid,old.value,val,m.id,coalesce(nullif(p_payload->>'reason',''),'Score entry'));
 perform bump(p_quiz); perform audit(p_quiz,m.id,'SCORE_UPDATED',jsonb_build_object('question_id',qid,'participant_id',pid,'old',old.value,'value',val,'reason',p_payload->>'reason'));
 return jsonb_build_object('ok',true);
end $$;

create function join_quiz(p_auth uuid,p_role text,p_code text,p_name text,p_quiz uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare qid uuid; pid uuid; mid uuid; cfg quiz_settings; current_m quiz_members; takeid uuid;
begin
 if p_role='QUIZMASTER' then qid:=p_quiz; -- password is verified by the server before this service-only function
 elsif p_role='PARTICIPANT' then
  select quiz_id,id into qid,pid from participants where join_code=p_code;
  if qid is null then select quiz_id into qid from quiz_access where kind=p_role and code=p_code and active; end if;
 else select quiz_id into qid from quiz_access where kind=p_role and code=p_code and active; end if;
 if qid is null then raise exception 'INVALID_CODE'; end if;
 perform 1 from quiz_live_state where quiz_id=qid for update;
 select * into cfg from quiz_settings where quiz_id=qid;
 if p_role='AUDIENCE' and not cfg.audience_enabled then raise exception 'ACCESS_DISABLED'; end if;
 select * into current_m from quiz_members where quiz_id=qid and auth_uid=p_auth and revoked_at is null;
 if found then
  if current_m.role=p_role and (pid is null or pid=current_m.participant_id) then return jsonb_build_object('quiz_id',qid,'member_id',current_m.id); end if;
  raise exception 'ALREADY_JOINED_OTHER_ROLE';
 end if;
 if p_role='PARTICIPANT' then
  if pid is null then
   if cfg.participant_mode<>'OPEN' or nullif(trim(p_name),'') is null then raise exception 'INDIVIDUAL_CODE_REQUIRED'; end if;
   select id into pid from participants where quiz_id=qid and identifier=lower(trim(p_name));
   if found then
    insert into takeover_requests(quiz_id,participant_id,auth_uid,display_name) values(qid,pid,p_auth,p_name) on conflict(quiz_id,auth_uid) where status='PENDING' do update set display_name=excluded.display_name returning id into takeid;
    perform bump(qid); perform audit(qid,null,'TAKEOVER_REQUESTED',jsonb_build_object('participant_id',pid));
    return jsonb_build_object('pending',true,'request_id',takeid,'quiz_id',qid);
   end if;
   if (select count(*) from participants where quiz_id=qid)>=cfg.max_participants then raise exception 'PARTICIPANT_LIMIT'; end if;
   insert into participants(quiz_id,display_name,identifier,type) values(qid,trim(p_name),lower(trim(p_name)),'TEAM') returning id into pid;
  else
   update quiz_members set revoked_at=clock_timestamp() where participant_id=pid and revoked_at is null;
  end if;
  select display_name into p_name from participants where id=pid;
 end if;
 insert into quiz_members(quiz_id,auth_uid,role,display_name,participant_id) values(qid,p_auth,p_role,coalesce(nullif(trim(p_name),''),initcap(p_role)),pid) returning id into mid;
 perform bump(qid); perform audit(qid,mid,'MEMBER_JOINED',jsonb_build_object('role',p_role));
 return jsonb_build_object('quiz_id',qid,'member_id',mid);
end $$;

create function setup_quiz(p_auth uuid,p_quiz uuid,p_entity text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
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
  participant_mode=p_payload->>'participant_mode',identifier_style=p_payload->>'identifier_style',auto_lock_after=(p_payload->>'auto_lock_after')::int,lock_on_timer_end=(p_payload->>'lock_on_timer_end')::boolean,default_timer_ms=(p_payload->>'default_timer_ms')::int,audience_enabled=(p_payload->>'audience_enabled')::boolean where quiz_id=p_quiz;
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
