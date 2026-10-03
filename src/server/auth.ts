import 'server-only';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDemo, rpc } from './db';
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let demoSecret: Promise<Uint8Array> | undefined;
function secret() {
  return (demoSecret ??= (async () => {
    const dir = path.join(process.cwd(), '.local'),
      file = path.join(dir, 'session.key');
    await mkdir(dir, { recursive: true });
    try {
      return new Uint8Array(await readFile(file));
    } catch {
      try {
        await writeFile(file, randomBytes(32), { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      return new Uint8Array(await readFile(file));
    }
  })());
}
export async function demoToken(uid: string) {
  if (!isDemo()) throw new Error('DEMO_DISABLED');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(uid)
    .setAudience('buzzer-practice')
    .setIssuer('buzzer-local')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(await secret());
}
export async function identity(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  try {
    if (isDemo()) {
      const { payload } = await jwtVerify(token, await secret(), {
        issuer: 'buzzer-local',
        audience: 'buzzer-practice',
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('UNAUTHENTICATED');
      return payload.sub;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error('SERVER_NOT_CONFIGURED');
    jwks ??= createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${url}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    if (!payload.sub) throw new Error('UNAUTHENTICATED');
    return payload.sub;
  } catch {
    throw new Error('UNAUTHENTICATED');
  }
}
export async function limit(key: string, count: number, seconds: number) {
  if (!(await rpc<boolean>('rate_limit', { p_key: key, p_limit: count, p_window: seconds })))
    throw new Error('RATE_LIMITED');
}
