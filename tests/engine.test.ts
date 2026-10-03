import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
let db: PGlite;
async function call<T = any>(fn: string, ...args: unknown[]): Promise<T> {
  const res = await db.query<{ r: T }>(
    `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) r`,
    args.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v)),
  );
  return res.rows[0].r;
}
before(async () => {
  db = new PGlite();
  for (const file of ['001_core.sql', '002_snapshots.sql'])
    await db.exec(await readFile(`database/migrations/${file}`, 'utf8'));
});
after(async () => await db.close());
async function fixture(count = 3) {
  const admin = randomUUID(),
    host = randomUUID();
  await db.query('insert into admin_users(user_id) values($1)', [admin]);
  const { id: quiz } = await call('admin_action', admin, 'create', {
    title: 'Test',
    quiz_code: randomUUID(),
    password_hash: 'test-only',
  });
  await call('join_quiz', host, 'QUIZMASTER', '', 'Host', quiz);
  const { id: round } = await call('setup_quiz', host, quiz, 'rounds', { name: 'Round' });
  await call('setup_quiz', host, quiz, 'questions', { round_id: round, count: 3 });
  await call('setup_quiz', host, quiz, 'participants', {
    items: Array.from({ length: count }, (_, i) => ({ display_name: `Team ${i}`, type: 'TEAM' })),
  });
  const participants = (
    await db.query<any>('select * from participants where quiz_id=$1 order by display_name', [quiz])
  ).rows;
  const players = await Promise.all(
    participants.map(async (p) => {
      const auth = randomUUID();
      await call('join_quiz', auth, 'PARTICIPANT', p.join_code, p.display_name);
      return { ...p, auth };
    }),
  );
  async function state() {
    return call('get_snapshot', host, quiz);
  }
  async function cmd(type: string, payload = {}) {
    return call('run_command', host, quiz, type, (await state()).version, payload);
  }
  await cmd('START_QUIZ');
  await cmd('START_QUESTION');
  return { admin, host, quiz, round, players, state, cmd };
}
test('60 simultaneous attempts: 50 distinct ranks, contiguous, duplicate-safe, record cap', async () => {
  const f = await fixture(50),
    state = await f.state(),
    sid = state.session.id;
  const results = await Promise.all(
    Array.from({ length: 60 }, (_, i) => call('record_buzz', f.players[i % 50].auth, f.quiz, sid)),
  );
  assert.equal(results.filter((r) => !r.was_duplicate).length, 50);
  assert.deepEqual(
    [...new Set(results.map((r) => r.official_rank))].sort((a: number, b: number) => a - b),
    Array.from({ length: 50 }, (_, i) => i + 1),
  );
  const after = await f.state();
  assert.equal(after.buzz_count, 50);
  assert.equal(after.session.status, 'LOCKED');
});
test('pause and manual lock reject; reopening preserves order; stale session rejected', async () => {
  const f = await fixture(),
    s = await f.state();
  assert.equal(
    (await call('record_buzz', f.players[0].auth, f.quiz, s.session.id)).official_rank,
    1,
  );
  await f.cmd('PAUSE');
  assert.equal(
    (await call('record_buzz', f.players[1].auth, f.quiz, s.session.id)).error,
    'BUZZER_CLOSED',
  );
  await f.cmd('RESUME');
  await f.cmd('LOCK_BUZZER');
  assert.equal(
    (await call('record_buzz', f.players[1].auth, f.quiz, s.session.id)).error,
    'BUZZER_CLOSED',
  );
  await f.cmd('REOPEN_BUZZER');
  assert.equal(
    (await call('record_buzz', f.players[1].auth, f.quiz, s.session.id)).official_rank,
    2,
  );
  await f.cmd('COMPLETE_QUESTION');
  await f.cmd('START_QUESTION');
  await assert.rejects(
    call('record_buzz', f.players[0].auth, f.quiz, s.session.id),
    /STALE_SESSION/,
  );
});
test('conflicting quizmasters produce one winner; participant and scorekeeper cannot control', async () => {
  const f = await fixture(),
    s = await f.state();
  const outcomes = await Promise.allSettled([
    call('run_command', f.host, f.quiz, 'LOCK_BUZZER', s.version, {}),
    call('run_command', f.host, f.quiz, 'PAUSE', s.version, {}),
  ]);
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
  assert.match(
    (outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult).reason.message,
    /STALE_VERSION/,
  );
  await assert.rejects(
    call('run_command', f.players[0].auth, f.quiz, 'PAUSE', (await f.state()).version, {}),
    /FORBIDDEN/,
  );
  const access = (
    await db.query<any>("select code from quiz_access where quiz_id=$1 and kind='SCOREKEEPER'", [
      f.quiz,
    ])
  ).rows[0];
  const sk = randomUUID();
  await call('join_quiz', sk, 'SCOREKEEPER', access.code, 'Scorer');
  await assert.rejects(
    call('run_command', sk, f.quiz, 'PAUSE', (await f.state()).version, {}),
    /FORBIDDEN/,
  );
});
test('timer rejects late presses and pause freezes remaining time', async () => {
  const f = await fixture(),
    s = await f.state();
  await f.cmd('TIMER_START', { duration_ms: 10000 });
  await f.cmd('PAUSE');
  const paused = await f.state();
  assert.equal(paused.live.timer_started_at, null);
  assert.ok(paused.live.timer_remaining_ms > 0);
  await f.cmd('RESUME');
  await db.query(
    "update quiz_live_state set timer_started_at=clock_timestamp()-interval '20 seconds' where quiz_id=$1",
    [f.quiz],
  );
  assert.equal(
    (await call('record_buzz', f.players[0].auth, f.quiz, s.session.id)).error,
    'BUZZER_CLOSED',
  );
  assert.equal((await f.state()).session.lock_reason, 'TIMER_END');
});
test('auto-lock at N, hidden personal position, display filtering and reconnect', async () => {
  const f = await fixture();
  await f.cmd('COMPLETE_QUESTION');
  const initial = await f.state();
  const { quiz_id, ...settings } = initial.settings;
  await call('setup_quiz', f.host, f.quiz, 'settings', {
    ...settings,
    auto_lock_after: 2,
    default_display_limit: 1,
    show_own_position: false,
  });
  await f.cmd('START_QUESTION');
  const sid = (await f.state()).session.id;
  for (const p of f.players.slice(0, 2))
    assert.equal((await call('record_buzz', p.auth, f.quiz, sid)).official_rank, null);
  assert.equal((await f.state()).session.status, 'LOCKED');
  const participant = await call('get_snapshot', f.players[1].auth, f.quiz);
  assert.equal(participant.buzzes.length, 1);
  assert.equal(participant.buzz_count, 2);
  assert.equal(participant.own_buzz.accepted, true);
  assert.equal(participant.own_buzz.official_rank, null);
  assert.deepEqual(participant.leaderboard, []);
  assert.deepEqual(participant.scores, []);
  assert.deepEqual(participant.participants, []);
  assert.deepEqual(participant.access, []);
});
test('score values survive rule changes; edits create revision and reject stale edits', async () => {
  const f = await fixture(),
    s = await f.state();
  const payload = {
    question_id: s.question.id,
    participant_id: f.players[0].id,
    value: 10.25,
    expected_revision: 0,
  };
  await call('upsert_score', f.host, f.quiz, payload);
  await call('upsert_score', f.host, f.quiz, {
    ...payload,
    value: -2.5,
    expected_revision: 1,
    reason: 'Correction',
  });
  await assert.rejects(
    call('upsert_score', f.host, f.quiz, { ...payload, expected_revision: 1 }),
    /STALE_SCORE/,
  );
  const revisions = (
    await db.query(
      'select * from score_revisions where score_id in (select id from scores where quiz_id=$1)',
      [f.quiz],
    )
  ).rows;
  assert.equal(revisions.length, 2);
  await call('setup_quiz', f.host, f.quiz, 'questions', { id: s.question.id, positive_score: 99 });
  assert.equal(
    (await f.state()).leaderboard.find((p: any) => p.participant_id === f.players[0].id).total,
    -2.5,
  );
  await assert.rejects(call('upsert_score', f.players[0].auth, f.quiz, payload), /FORBIDDEN/);
});
test('individual-code takeover immediately revokes writes and rotates broadcast epoch', async () => {
  const f = await fixture(),
    before = await f.state(),
    p = f.players[0],
    next = randomUUID();
  await call('join_quiz', next, 'PARTICIPANT', p.join_code, p.display_name);
  await assert.rejects(call('record_buzz', p.auth, f.quiz, before.session.id), /SESSION_REVOKED/);
  await assert.rejects(call('get_snapshot', p.auth, f.quiz), /SESSION_REVOKED/);
  assert.ok((await f.state()).live.realtime_epoch > before.live.realtime_epoch);
  assert.equal((await call('record_buzz', next, f.quiz, before.session.id)).official_rank, 1);
});
test('hierarchical scoring resolves each field independently', async () => {
  const f = await fixture();
  const { id: r } = await call('setup_quiz', f.host, f.quiz, 'rounds', {
    name: 'Special',
    uses_subrounds: true,
    positive_score: 20,
    negative_score: -10,
  });
  const { id: sr } = await call('setup_quiz', f.host, f.quiz, 'subrounds', {
    name: 'Bonus',
    round_id: r,
    positive_score: 30,
  });
  const { id: q } = await call('setup_quiz', f.host, f.quiz, 'questions', {
    round_id: r,
    subround_id: sr,
  });
  await call('setup_quiz', f.host, f.quiz, 'questions', { id: q, negative_score: -2.5 });
  assert.deepEqual(await call('resolve_scoring', q), {
    positive_score: 30,
    negative_score: -2.5,
    zero_score: 0,
  });
  await assert.rejects(
    call('setup_quiz', f.host, f.quiz, 'questions', { round_id: r }),
    /INVALID_ROUND/,
  );
});
test('open join requires host approval for existing identifiers', async () => {
  const f = await fixture(),
    s = await f.state();
  const { quiz_id, ...settings } = s.settings;
  await call('setup_quiz', f.host, f.quiz, 'settings', { ...settings, participant_mode: 'OPEN' });
  const code = (
    await db.query<any>("select code from quiz_access where quiz_id=$1 and kind='PARTICIPANT'", [
      f.quiz,
    ])
  ).rows[0].code;
  const next = randomUUID(),
    request = await call('join_quiz', next, 'PARTICIPANT', code, f.players[0].display_name);
  assert.equal(request.pending, true);
  await assert.rejects(call('record_buzz', next, f.quiz, s.session.id), /SESSION_REVOKED/);
  await call('setup_quiz', f.host, f.quiz, 'takeovers', {
    id: request.request_id,
    operation: 'approve',
  });
  assert.equal((await call('record_buzz', next, f.quiz, s.session.id)).official_rank, 1);
  await assert.rejects(
    call('record_buzz', f.players[0].auth, f.quiz, s.session.id),
    /SESSION_REVOKED/,
  );
});
