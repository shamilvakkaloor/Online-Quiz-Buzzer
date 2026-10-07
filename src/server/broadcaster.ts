import 'server-only';
import { isDemo, rpc } from './db';
import type { Snapshot } from '@/types/quiz';
type Pending = {
  last: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  dirty: boolean;
};
const globalBroadcast = globalThis as unknown as { buzzerBroadcast?: Map<string, Pending> };
const pending = (globalBroadcast.buzzerBroadcast ??= new Map<string, Pending>());
async function publish(quiz: string) {
  const messages = await Promise.all(
    ['SCOREKEEPER', 'AUDIENCE'].map(async (role) => {
      const snapshot = await rpc<Snapshot>('snapshot_data', { p_quiz: quiz, p_role: role });
      const epoch = (snapshot.live as Snapshot['live'] & { realtime_epoch: number }).realtime_epoch;
      return {
        topic: `quiz:${quiz}:${epoch}:${role === 'SCOREKEEPER' ? 'staff' : 'display'}`,
        event: 'STATE',
        payload: snapshot,
        private: true,
      };
    }),
  );
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error(`Broadcast failed (${response.status})`);
}
export function markDirty(quiz: string) {
  if (isDemo()) return;
  let state = pending.get(quiz);
  if (!state) {
    state = { last: 0, timer: null, running: false, dirty: false };
    pending.set(quiz, state);
  }
  state.dirty = true;
  const flush = async () => {
    state!.timer = null;
    state!.running = true;
    state!.dirty = false;
    state!.last = Date.now();
    try {
      await publish(quiz);
    } catch (e) {
      console.error('Realtime snapshot:', (e as Error).message);
    } finally {
      state!.running = false;
      if (state!.dirty)
        state!.timer = setTimeout(flush, Math.max(0, 1500 - (Date.now() - state!.last)));
      else {
        const finished = state;
        setTimeout(() => {
          if (pending.get(quiz) === finished && !finished?.running && !finished?.timer)
            pending.delete(quiz);
        }, 60000).unref();
      }
    }
  };
  if (state.running || state.timer) return;
  if (Date.now() - state.last >= 1500) void flush();
  else state.timer = setTimeout(flush, 1500 - (Date.now() - state.last));
}
