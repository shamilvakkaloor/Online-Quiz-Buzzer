'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/types/quiz';
export type Config = {
  demo: boolean;
  supabase_url: string | null;
  supabase_key: string | null;
  turnstile_site_key?: string | null;
};
export type Session = { token: string; quiz_id: string };
const clients = new Map<Role, SupabaseClient>();
export function browserClient(config: Config, role: Role) {
  if (!config.supabase_url || !config.supabase_key)
    throw new Error('Connect Supabase to enable this workspace.');
  let client = clients.get(role);
  if (!client) {
    client = createClient(config.supabase_url, config.supabase_key, {
      auth: { storageKey: `buzzer-auth-${role}`, persistSession: true, autoRefreshToken: true },
    });
    clients.set(role, client);
  }
  return client;
}
const errors: Record<string, string> = {
  STALE_VERSION: 'Another action changed the quiz. The latest state is now loaded; try again.',
  STALE_SCORE: 'This score was edited on another screen. Review the latest value and try again.',
  SESSION_REVOKED: 'This session has ended. You may have joined on another device.',
  BUZZER_CLOSED: 'The buzzer is closed. Wait for the next question.',
  STALE_SESSION: 'The question changed. Wait for the current buzzer.',
  INVALID_CREDENTIALS: 'The quiz ID or password is incorrect.',
  INVALID_CODE: 'That access code is not valid.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  FORBIDDEN: 'Your role does not have permission for this action.',
  UNAUTHENTICATED: 'Your session expired. Please sign in again.',
  INDIVIDUAL_CODE_REQUIRED: 'Use the individual join code provided by your quizmaster.',
  PARTICIPANT_LIMIT: 'The participant limit has been reached.',
  RESET_TIMER_FIRST: 'Reset the expired timer before reopening the buzzer.',
  NEXT_QUESTION_REQUIRED: 'Start the next pending question in sequence.',
  SERVER_NOT_CONFIGURED:
    'Supabase is not configured. See the deployment guide to connect your project.',
  ALREADY_JOINED_OTHER_ROLE: 'This identity already has another role in this quiz.',
  INVALID_STATE: 'This action is not available in the current quiz state.',
  COMPLETE_CURRENT_QUESTION: 'Complete the active question before finishing the quiz.',
};
export class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(errors[code] || message);
    this.code = code;
  }
}
export async function request<T = unknown>(
  path: string,
  session?: Session | null,
  body?: unknown,
  tokenOverride?: string,
): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(
    `/api/${path}${session?.quiz_id ? `${separator}quiz=${session.quiz_id}` : ''}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(tokenOverride || session?.token
          ? { Authorization: `Bearer ${tokenOverride || session?.token}` }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error || 'Could not connect to the quiz.',
      data.code || data.error || 'ERROR',
    );
  return data;
}
export function sessionKey(role: Role) {
  return `buzzer-session-${role}`;
}
export function saveSession(role: Role, session: Session) {
  localStorage.setItem(sessionKey(role), JSON.stringify(session));
}
export function loadSession(role: Role): Session | null {
  try {
    return JSON.parse(localStorage.getItem(sessionKey(role)) || 'null');
  } catch {
    return null;
  }
}
export function points(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
