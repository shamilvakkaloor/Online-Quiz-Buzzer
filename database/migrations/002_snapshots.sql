create function snapshot_data(p_quiz uuid,p_role text,p_member uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare ls quiz_live_state; member_row quiz_members; staff boolean:=p_role in ('QUIZMASTER','SCOREKEEPER'); qm boolean:=p_role='QUIZMASTER'; own jsonb; result jsonb;
begin
 select * into ls from quiz_live_state where quiz_id=p_quiz;
 if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
 select * into member_row from quiz_members where id=p_member;
 select jsonb_build_object('accepted',true,'official_rank',case when ls.show_own_position then official_rank else null end) into own from buzzes where buzzer_session_id=ls.current_buzzer_session_id and participant_id=member_row.participant_id;
 result:=jsonb_build_object(
 'quiz',(select to_jsonb(q)-'password_hash'-'created_by' from quizzes q where id=p_quiz),
 'member',case when p_member is null then null else to_jsonb(member_row)-'auth_uid' end,
 'version',ls.version,'server_time',clock_timestamp(),'live',to_jsonb(ls),
 'session',(select to_jsonb(s) from buzzer_sessions s where id=ls.current_buzzer_session_id),
 'question',(select to_jsonb(q) from questions q where id=ls.current_question_id),
 'round',(select to_jsonb(r) from rounds r join questions q on q.round_id=r.id where q.id=ls.current_question_id),
 'subround',(select to_jsonb(s) from subrounds s join questions q on q.subround_id=s.id where q.id=ls.current_question_id),
 'buzzes',coalesce((select jsonb_agg(to_jsonb(b) order by official_rank) from (
  select b.participant_id,p.display_name,b.official_rank,b.server_received_at from buzzes b join participants p on p.id=b.participant_id
  where b.buzzer_session_id=ls.current_buzzer_session_id and (staff or b.official_rank<=ls.display_limit)) b),'[]'),
 'buzz_count',(select count(*) from buzzes where buzzer_session_id=ls.current_buzzer_session_id),
 'own_buzz',own,'leaderboard',case when staff or ls.leaderboard_visible then leaderboard(p_quiz) else '[]'::jsonb end,
 'scoring',case when staff then resolve_scoring(ls.current_question_id) else null end,
 'participants',case when staff then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'type',p.type,'identifier',p.identifier,'join_code',case when qm then p.join_code else null end,
 'joined',exists(select 1 from quiz_members where participant_id=p.id and revoked_at is null),'last_seen_at',(select max(last_seen_at) from quiz_members where participant_id=p.id and revoked_at is null)) order by p.created_at,p.display_name) from participants p where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'questions',case when staff then coalesce((select jsonb_agg(to_jsonb(q) order by sequence) from questions q where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'rounds',case when staff then coalesce((select jsonb_agg(to_jsonb(r) order by sequence) from rounds r where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'subrounds',case when staff then coalesce((select jsonb_agg(to_jsonb(s) order by sequence) from subrounds s where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'settings',case when staff then (select to_jsonb(s) from quiz_settings s where quiz_id=p_quiz) else null end,
 'scores',case when staff then coalesce((select jsonb_agg(to_jsonb(s)) from scores s where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'history',case when staff then coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
 select a.id,a.action,a.details,a.created_at,coalesce(m.display_name,'System') actor from audit_logs a left join quiz_members m on m.id=a.member_id where a.quiz_id=p_quiz order by a.created_at desc limit 100) h),'[]') else '[]'::jsonb end,
 'members',case when qm then coalesce((select jsonb_agg(to_jsonb(m)-'auth_uid') from quiz_members m where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'access',case when qm then coalesce((select jsonb_agg(to_jsonb(a)) from quiz_access a where quiz_id=p_quiz),'[]') else '[]'::jsonb end,
 'takeovers',case when qm then coalesce((select jsonb_agg(to_jsonb(t)-'auth_uid') from takeover_requests t where quiz_id=p_quiz and status='PENDING'),'[]') else '[]'::jsonb end,
 'rules',case when staff then coalesce((select jsonb_agg(to_jsonb(r)) from leaderboard_rules r where quiz_id=p_quiz),'[]') else '[]'::jsonb end
 );
 return result;
end $$;

create function get_snapshot(p_auth uuid,p_quiz uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m quiz_members; ls quiz_live_state;
begin
 -- The same lock order as commands and buzzes avoids lock inversion on timer expiry.
 select * into ls from quiz_live_state where quiz_id=p_quiz for update;
 m:=active_member(p_auth,p_quiz);
 update quiz_members set last_seen_at=clock_timestamp() where id=m.id and last_seen_at<clock_timestamp()-interval '10 seconds';
 if not ls.is_paused and ls.timer_started_at is not null and clock_timestamp()>=ls.timer_started_at+ls.timer_duration_ms*interval '1 millisecond' and (select lock_on_timer_end from quiz_settings where quiz_id=p_quiz) then
  update buzzer_sessions set status='LOCKED',lock_reason='TIMER_END' where id=ls.current_buzzer_session_id and status='OPEN';
  if found then perform bump(p_quiz); perform audit(p_quiz,null,'TIMER_COMPLETED'); end if;
 end if;
 return snapshot_data(p_quiz,m.role,m.id);
end $$;

create function admin_action(p_auth uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare qid uuid:=(p_payload->>'id')::uuid; result jsonb;
begin
 if not exists(select 1 from admin_users where user_id=p_auth) then raise exception 'FORBIDDEN'; end if;
 case p_action
 when 'list' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') into result from (
   select q.id,q.quiz_code,q.title,q.created_at,ls.status,(select count(*) from participants where quiz_id=q.id) participant_count from quizzes q join quiz_live_state ls on ls.quiz_id=q.id) q;
 when 'create' then
  insert into quizzes(title,quiz_code,password_hash,created_by) values(p_payload->>'title',p_payload->>'quiz_code',p_payload->>'password_hash',p_auth) returning id into qid;
  insert into quiz_settings(quiz_id) values(qid); insert into quiz_live_state(quiz_id) values(qid);
  insert into quiz_access(quiz_id,kind,code) values(qid,'PARTICIPANT',new_code()),(qid,'SCOREKEEPER',new_code()),(qid,'AUDIENCE',new_code());
  insert into leaderboard_rules(quiz_id,trigger) values(qid,'EVENT');
  perform audit(qid,null,'QUIZ_CREATED'); result:=jsonb_build_object('id',qid);
 when 'history' then
  result:=jsonb_build_object('quiz',(select to_jsonb(q)-'password_hash' from quizzes q where id=qid),
   'leaderboard',leaderboard(qid),'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by sequence),'[]') from questions q where quiz_id=qid),
   'scores',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from scores s where quiz_id=qid),
   'revisions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from score_revisions r join scores s on s.id=r.score_id where s.quiz_id=qid),
   'buzzes',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from buzzes b join buzzer_sessions s on s.id=b.buzzer_session_id where s.quiz_id=qid),
   'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from audit_logs a where quiz_id=qid));
 when 'credentials' then
  perform 1 from quiz_live_state where quiz_id=qid for update;
  update quizzes set password_hash=coalesce(p_payload->>'password_hash',password_hash),quiz_code=coalesce(p_payload->>'quiz_code',quiz_code) where id=qid;
  if coalesce((p_payload->>'revoke_all')::boolean,false) then update quiz_members set revoked_at=clock_timestamp() where quiz_id=qid and revoked_at is null; end if;
  perform audit(qid,null,'CREDENTIALS_ROTATED'); perform bump(qid); result:=jsonb_build_object('ok',true);
 else raise exception 'UNKNOWN_ACTION';
 end case;
 return result;
end $$;

-- These are service-only helpers; no browser can resolve passwords or quiz membership.
create function lookup_quiz(p_code text) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('id',id,'password_hash',password_hash) from quizzes where quiz_code=p_code
$$;
create function membership_status(p_auth uuid,p_quiz uuid) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('joined',exists(select 1 from quiz_members where auth_uid=p_auth and quiz_id=p_quiz and revoked_at is null),
 'request_status',(select status from takeover_requests where auth_uid=p_auth and quiz_id=p_quiz order by created_at desc limit 1))
$$;
