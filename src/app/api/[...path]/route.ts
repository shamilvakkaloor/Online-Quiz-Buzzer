import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isDemo, rpc, localDb } from '@/server/db';
import { identity, demoToken, limit } from '@/server/auth';
import { DEMO_ADMIN, DEMO_HOST } from '@/server/seed';
import { hashPassword, verifyPassword } from '@/server/password';
import { markDirty } from '@/server/broadcaster';
import {
  joinSchema,
  commandSchema,
  scoreSchema,
  setupSchemas,
  quizCreateSchema,
  credentialsSchema,
  uuid,
} from '@/lib/validation';
import type { Snapshot, Role } from '@/types/quiz';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}
function csvCell(v: unknown) {
  let value = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
  return '"' + value.replaceAll('"', '""') + '"';
}
async function handler(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: parts } = await ctx.params,
      path = parts.join('/'),
      url = new URL(req.url),
      post = req.method !== 'GET';
    if (path === 'time') return json({ server_time: Date.now() });
    if (path === 'config')
      return json({
        demo: isDemo(),
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
        supabase_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
        turnstile_site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
      });
    if (path === 'health') {
      await rpc('rate_limit', { p_key: 'health', p_limit: 1000000, p_window: 60 });
      return json({ status: 'ok', database: isDemo() ? 'local-postgres' : 'supabase' });
    }
    if (Number(req.headers.get('content-length') || 0) > 32768)
      return json({ error: 'Request is too large.' }, 413);
    let body: unknown = {};
    if (post) {
      const raw = await req.text();
      if (raw.length > 32768) return json({ error: 'Request is too large.' }, 413);
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return json({ error: 'Invalid JSON.' }, 400);
      }
    }
    if (path === 'demo/session' && post) {
      if (!isDemo()) return json({ error: 'Not found' }, 404);
      const { role } = z
        .object({ role: z.enum(['QUIZMASTER', 'ADMIN', 'PARTICIPANT', 'SCOREKEEPER', 'AUDIENCE']) })
        .parse(body);
      const db = await localDb();
      const quiz = (
        await db.query<{ id: string }>('select id from quizzes order by created_at limit 1')
      ).rows[0].id;
      if (role === 'QUIZMASTER' || role === 'ADMIN')
        return json({
          token: await demoToken(role === 'ADMIN' ? DEMO_ADMIN : DEMO_HOST),
          quiz_id: quiz,
        });
      return json({ token: await demoToken(randomUUID()), quiz_id: quiz });
    }
    const actor = await identity(req);
    if (path !== 'buzz') await limit(`api:${actor}`, 600, 60);
    if (path === 'join-info' && post) {
      const { code } = joinSchema.parse(body);
      await limit(`join-info:${actor}`, 30, 300);
      return json(await rpc('participant_code_info', { p_code: code }));
    }
    if (path === 'auth/quizmaster/login' || path.startsWith('join/')) {
      if (!post) return json({ error: 'Method not allowed' }, 405);
      const input = joinSchema.parse(body);
      await limit(`join-member:${actor}`, 30, 300);
      const role: Role =
        path === 'auth/quizmaster/login'
          ? 'QUIZMASTER'
          : (
              {
                participant: 'PARTICIPANT',
                scorekeeper: 'SCOREKEEPER',
                audience: 'AUDIENCE',
              } as Record<string, Role>
            )[parts[1]];
      if (!role) return json({ error: 'Not found' }, 404);
      await limit(`join-code:${role}:${input.code}`, role === 'QUIZMASTER' ? 15 : 150, 300);
      let quizId: string | undefined;
      if (role === 'QUIZMASTER') {
        const quiz = await rpc<{ id: string; password_hash: string } | null>('lookup_quiz', {
          p_code: input.code,
        });
        const valid = await verifyPassword(
          input.password || '',
          quiz?.password_hash || 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64),
        );
        if (!quiz || !valid) throw new Error('INVALID_CREDENTIALS');
        quizId = quiz.id;
        if (!input.display_name) throw new Error('DISPLAY_NAME_REQUIRED');
      }
      const result = await rpc<{ quiz_id: string }>('join_quiz', {
        p_auth: actor,
        p_role: role,
        p_code: input.code,
        p_name: input.display_name || (role === 'PARTICIPANT' ? '' : role),
        ...(quizId ? { p_quiz: quizId } : {}),
      });
      markDirty(result.quiz_id);
      return json(result);
    }
    if (path.startsWith('admin/quizzes')) {
      if (parts.length === 2) {
        if (!post) return json(await rpc('admin_action', { p_auth: actor, p_action: 'list' }));
        const data = quizCreateSchema.parse(body);
        return json(
          await rpc('admin_action', {
            p_auth: actor,
            p_action: 'create',
            p_payload: {
              title: data.title,
              quiz_code: data.quiz_code,
              password_hash: await hashPassword(data.password),
            },
          }),
          201,
        );
      }
      const id = uuid.parse(parts[2]);
      if (parts[3] === 'credentials' && post) {
        const data = credentialsSchema.parse(body);
        const { password, ...rest } = data;
        const result = await rpc('admin_action', {
          p_auth: actor,
          p_action: 'credentials',
          p_payload: {
            ...rest,
            id,
            ...(password ? { password_hash: await hashPassword(password) } : {}),
          },
        });
        markDirty(id);
        return json(result);
      }
      if (!post) {
        const history = await rpc<{
          leaderboard: { rank: number; display_name: string; total: number }[];
        }>('admin_action', { p_auth: actor, p_action: 'history', p_payload: { id } });
        if (parts[3] === 'export') {
          const content = [
            'Rank,Participant,Total',
            ...history.leaderboard.map((row) =>
              [row.rank, row.display_name, row.total].map(csvCell).join(','),
            ),
          ].join('\r\n');
          return new Response('\uFEFF' + content, {
            headers: {
              ...headers,
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="quiz-${id}-results.csv"`,
            },
          });
        }
        return json(history);
      }
    }
    const quiz = uuid.parse(url.searchParams.get('quiz'));
    if (path === 'join-status')
      return json(await rpc('membership_status', { p_auth: actor, p_quiz: quiz }));
    if (path === 'live/state' || path === 'me/state' || path === 'leaderboard') {
      if (post) return json({ error: 'Method not allowed' }, 405);
      const state = await rpc<Snapshot>('get_snapshot', { p_auth: actor, p_quiz: quiz });
      return json(path === 'leaderboard' ? state.leaderboard : state);
    }
    if (!post) return json({ error: 'Not found' }, 404);
    let result: unknown;
    if (path === 'buzz') {
      const data = z.object({ buzzer_session_id: uuid }).strict().parse(body);
      result = await rpc('api_record_buzz', {
        p_auth: actor,
        p_quiz: quiz,
        p_session: data.buzzer_session_id,
      });
    } else if (path === 'live/command') {
      const data = commandSchema.parse(body);
      result = await rpc('run_command', {
        p_auth: actor,
        p_quiz: quiz,
        p_type: data.type,
        p_version: data.expected_version,
        p_payload: data.payload,
      });
    } else if (path === 'scores')
      result = await rpc('upsert_score', {
        p_auth: actor,
        p_quiz: quiz,
        p_payload: scoreSchema.parse(body),
      });
    else if (parts[0] === 'quiz' && setupSchemas[parts[1]]) {
      let input = body as Record<string, unknown>;
      if (parts[1] === 'participants' && parts[2] === 'import')
        input = {
          items: z
            .object({
              names: z.string().min(1).max(10000),
              type: z.enum(['PERSON', 'TEAM']).default('TEAM'),
            })
            .parse(body)
            .names.split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((display_name) => ({
              display_name,
              type: (body as { type?: string }).type || 'TEAM',
            })),
        };
      if (parts[1] === 'members' && parts[2]) input = { id: parts[2] };
      if (parts[1] === 'takeovers' && parts[2]) input = { id: parts[2], operation: parts[3] };
      result = await rpc('setup_quiz', {
        p_auth: actor,
        p_quiz: quiz,
        p_entity: parts[1],
        p_payload: setupSchemas[parts[1]].parse(input),
      });
    } else return json({ error: 'Not found' }, 404);
    markDirty(quiz);
    if (result && typeof result === 'object' && 'error' in result) return json(result, 409);
    return json(result);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues.map((i) => i.message).join(' '), code: 'VALIDATION_ERROR' },
        400,
      );
    const message = (error as Error).message;
    const safe = /^[A-Z][A-Z_]+$/.test(message);
    const status =
      message === 'UNAUTHENTICATED'
        ? 401
        : message === 'RATE_LIMITED'
          ? 429
          : ['FORBIDDEN', 'SESSION_REVOKED'].includes(message)
            ? 403
            : message === 'SERVER_NOT_CONFIGURED'
              ? 503
              : message.startsWith('STALE')
                ? 409
                : 400;
    if (!safe) console.error('API error:', message);
    return json(
      {
        error: safe
          ? message
          : 'The change could not be saved. Check for a duplicate entry or an item that is still in use.',
        code: safe ? message : 'REQUEST_FAILED',
      },
      status,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
