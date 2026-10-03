import type { PGlite } from '@electric-sql/pglite';
import { hashPassword } from './password';
export const DEMO_HOST = '22222222-2222-4222-8222-222222222222';
export const DEMO_ADMIN = '33333333-3333-4333-8333-333333333333';
export async function seed(db: PGlite) {
  if ((await db.query('select id from quizzes limit 1')).rows.length) return;
  await db.query('insert into admin_users(user_id) values($1)', [DEMO_ADMIN]);
  await db.query("select admin_action($1,'create',$2::jsonb)", [
    DEMO_ADMIN,
    JSON.stringify({
      title: 'The Friday Quiz',
      quiz_code: 'FRIDAY',
      password_hash: await hashPassword('quizmaster2026'),
    }),
  ]);
  const { rows } = await db.query<{ id: string }>('select id from quizzes limit 1');
  const id = rows[0].id;
  // Create through the same entry points used in production.
  await db.query("select join_quiz($1,'QUIZMASTER','','Alex Morgan',$2)", [DEMO_HOST, id]);
  const teams = [
    'The Brainwaves',
    'Ctrl + Alt + Defeat',
    'The Know-It-Alls',
    'Quiztopher Columbus',
    'Mind Over Matter',
    'The Wild Guesses',
    'Agatha Quiztie',
    'The Underdogs',
  ];
  await db.query("select setup_quiz($1,$2,'participants',$3::jsonb)", [
    DEMO_HOST,
    id,
    JSON.stringify({ items: teams.map((display_name) => ({ display_name, type: 'TEAM' })) }),
  ]);
  for (const name of ['The warm-up', 'Around the world', 'The final countdown']) {
    const r = await db.query<{ result: { id: string } }>(
      "select setup_quiz($1,$2,'rounds',$3::jsonb) result",
      [DEMO_HOST, id, JSON.stringify({ name })],
    );
    await db.query("select setup_quiz($1,$2,'questions',$3::jsonb)", [
      DEMO_HOST,
      id,
      JSON.stringify({ round_id: r.rows[0].result.id, count: 6 }),
    ]);
  }
  await db.query(
    "update quiz_access set code=case kind when 'PARTICIPANT' then 'PLAYFRDY' when 'SCOREKEEPER' then 'SCOREFRD' else 'WATCHFRD' end where quiz_id=$1",
    [id],
  );
  await db.query(
    "update participants set join_code='BRAINWAV' where quiz_id=$1 and display_name='The Brainwaves'",
    [id],
  );
  await db.query("update quiz_live_state set status='READY' where quiz_id=$1", [id]);
}
