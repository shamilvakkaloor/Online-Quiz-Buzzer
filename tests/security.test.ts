import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('Supabase policy migration: denied client table access and RPC execution; topic role and epoch boundaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema realtime;create table realtime.messages(id int,extension text);
 alter table realtime.messages enable row level security;
 grant usage on schema realtime to authenticated;grant select,insert on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
 `);
    for (const file of [
      '001_core.sql',
      '002_snapshots.sql',
      '003_supabase_security.sql',
      '004_signup_hook.sql',
    ])
      await db.exec(await readFile(`database/migrations/${file}`, 'utf8'));
    assert.deepEqual(
      (
        await db.query<{ r: unknown }>(
          `select before_quiz_user_created('{"user":{"is_anonymous":true}}') r`,
        )
      ).rows[0].r,
      {},
    );
    assert.equal(
      (
        await db.query<{ r: { error: { http_code: number } } }>(
          `select before_quiz_user_created('{"user":{"is_anonymous":false}}') r`,
        )
      ).rows[0].r.error.http_code,
      403,
    );
    const q = '11111111-1111-4111-8111-111111111111',
      host = '22222222-2222-4222-8222-222222222222',
      p = '33333333-3333-4333-8333-333333333333';
    await db.query(
      "insert into quizzes(id,quiz_code,password_hash,title) values($1,'TEST','x','Test')",
      [q],
    );
    await db.query('insert into quiz_live_state(quiz_id) values($1)', [q]);
    await db.query(
      "insert into quiz_members(quiz_id,auth_uid,role,display_name) values($1,$2,'QUIZMASTER','Host'),($1,$3,'AUDIENCE','Display')",
      [q, host, p],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [p]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from quizzes'), /permission denied/);
    await assert.rejects(
      db.query("select snapshot_data($1,'QUIZMASTER')", [q]),
      /permission denied/,
    );
    const can = async (topic: string) =>
      (await db.query<{ ok: boolean }>('select can_receive_quiz_topic($1) ok', [topic])).rows[0].ok;
    assert.equal(await can(`quiz:${q}:1:display`), true);
    assert.equal(await can(`quiz:${q}:1:staff`), false);
    assert.equal(await can(`quiz:${q}:2:display`), false);
    await db.query("select set_config('realtime.topic',$1,false)", [`quiz:${q}:1:display`]);
    await assert.rejects(
      db.query("insert into realtime.messages values(1,'broadcast')"),
      /row-level security/,
    );
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [host]);
    await db.exec('set role authenticated');
    assert.equal(await can(`quiz:${q}:1:staff`), true);
    await db.exec('reset role');
    await db.query('update quiz_members set revoked_at=now() where auth_uid=$1', [p]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [p]);
    await db.exec('set role authenticated');
    assert.equal(await can(`quiz:${q}:2:display`), false);
  } finally {
    await db.close();
  }
});
