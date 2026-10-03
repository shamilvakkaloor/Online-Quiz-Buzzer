/** Run against a dedicated rehearsal quiz only. Never point this at an active event. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.LOAD_BASE_URL;
const hostToken = process.env.LOAD_HOST_TOKEN;
const quiz = process.env.LOAD_QUIZ_ID;
const rosterFile = process.env.LOAD_ROSTER_FILE;
if (!base || !hostToken || !quiz || !rosterFile)
  throw new Error(
    'Set LOAD_BASE_URL, LOAD_HOST_TOKEN, LOAD_QUIZ_ID and LOAD_ROSTER_FILE. See README.',
  );
const roster: { token: string }[] = JSON.parse(await readFile(rosterFile, 'utf8'));
if (roster.length !== 50)
  throw new Error('Provide exactly 50 already-joined participant access tokens.');
async function api(path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}/api/${path}?quiz=${quiz}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}
const host = hostToken;
async function cmd(type: string, payload = {}) {
  const s = await api('live/state', host);
  return api('live/command', host, { type, payload, expected_version: s.version });
}
const initial = await api('live/state', host);
if (initial.live.status === 'COMPLETED' || initial.question?.status === 'ACTIVE')
  throw new Error('Use an idle rehearsal quiz with at least 20 pending questions.');
if (initial.questions.filter((q: { status: string }) => q.status === 'PENDING').length < 20)
  throw new Error('Add at least 20 pending questions.');
if (initial.settings.auto_lock_after || initial.settings.max_buzzes_per_question !== 50)
  throw new Error('Turn off auto-lock and set the record limit to 50 for this rehearsal.');
if (initial.live.status !== 'LIVE') await cmd('START_QUIZ');
const results = [];
for (let round = 0; round < 20; round++) {
  await cmd('START_QUESTION');
  const state = await api('live/state', host);
  const requests = await Promise.all(
    Array.from({ length: 60 }, async (_, i) => {
      const start = performance.now();
      const value = await api('buzz', roster[i % 50].token, {
        buzzer_session_id: state.session.id,
      });
      return { duration: performance.now() - start, value };
    }),
  );
  const final = await api('live/state', host);
  assert.equal(final.buzz_count, 50);
  assert.deepEqual(
    final.buzzes.map((b: { official_rank: number }) => b.official_rank),
    Array.from({ length: 50 }, (_, i) => i + 1),
  );
  // Recovery uses a new HTTP request for each participant, independent of its original response.
  const restored = await Promise.all(roster.map((p) => api('me/state', p.token)));
  assert.ok(restored.every((s) => s.own_buzz?.accepted));
  const times = requests.map((r) => r.duration).sort((a, b) => a - b);
  const metrics = {
    question: round + 1,
    median_ms: Math.round(times[30]),
    p95_ms: Math.round(times[57]),
    max_ms: Math.round(times[59]),
    accepted: final.buzz_count,
  };
  results.push(metrics);
  console.log(metrics);
  await cmd('COMPLETE_QUESTION');
  // Avoid testing the anti-repeat limiter instead of the intended burst behavior.
  if (round < 19) await new Promise((resolve) => setTimeout(resolve, 1100));
}
await writeFile('rehearsal-results.json', JSON.stringify(results, null, 2));
console.log('Passed 20 questions, 1,200 requests, and 1,000 recovery checks.');
