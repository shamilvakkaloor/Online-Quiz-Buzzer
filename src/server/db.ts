import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { seed } from './seed';

export function isDemo() {
  if (process.env.DEMO_MODE === 'true') return true;
  if (process.env.DEMO_MODE === 'false' || process.env.NODE_ENV === 'production') return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}
const globalDb = globalThis as unknown as {
  buzzerDb?: Promise<PGlite>;
  buzzerSupabase?: SupabaseClient;
};
export async function localDb() {
  if (!isDemo()) throw new Error('DEMO_DISABLED');
  globalDb.buzzerDb ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    await mkdir(path.join(process.cwd(), '.local'), { recursive: true });
    const db = new PGlite(path.join(process.cwd(), '.local', 'quiz-db'));
    await db.waitReady;
    await db.exec('create table if not exists app_migrations (name text primary key)');
    for (const name of ['001_core.sql', '002_snapshots.sql']) {
      if (!(await db.query('select name from app_migrations where name=$1', [name])).rows.length) {
        const sql = await readFile(
          path.join(process.cwd(), 'database', 'migrations', name),
          'utf8',
        );
        await db.transaction(async (tx) => {
          await tx.exec(sql);
          await tx.query('insert into app_migrations values($1)', [name]);
        });
      }
    }
    await seed(db);
    return db;
  })();
  return globalDb.buzzerDb;
}
export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  return (globalDb.buzzerSupabase ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!/^[a-z_]+$/.test(name)) throw new Error('INVALID_FUNCTION');
  if (isDemo()) {
    const db = await localDb();
    const params = Object.values(args).map((v) =>
      v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
    );
    const slots = Object.keys(args)
      .map((key, i) => `${key} => $${i + 1}`)
      .join(',');
    const result = await db.query<{ result: T }>(`select ${name}(${slots}) as result`, params);
    return result.rows[0]?.result;
  }
  const { data, error } = await serviceDb().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
