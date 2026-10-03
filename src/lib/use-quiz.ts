'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, Role, Snapshot } from '@/types/quiz';
import {
  ApiError,
  browserClient,
  loadSession,
  request,
  saveSession,
  sessionKey,
  type Config,
  type Session,
} from './client';
export function useQuiz(role: Role) {
  const [config, setConfig] = useState<Config | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [fatal, setFatal] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [presenceOnline, setPresenceOnline] = useState<Record<string, boolean>>({}),
    [offset, setOffset] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const refreshing = useRef(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await request<Config>('config');
        if (!active) return;
        setConfig(cfg);
        let saved = loadSession(role);
        if (cfg.demo && !saved && (role === 'QUIZMASTER' || role === 'ADMIN')) {
          saved = await request<Session>('demo/session', null, { role });
          saveSession(role, saved);
        }
        if (saved && active) setSession(saved);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [role]);
  const getToken = useCallback(async () => {
    if (!session) return undefined;
    if (config && !config.demo) {
      const { data } = await browserClient(config, role).auth.getSession();
      return data.session?.access_token;
    }
    return session.token;
  }, [session, config, role]);
  const refresh = useCallback(async () => {
    if (!session || role === 'ADMIN' || refreshing.current) return;
    refreshing.current = true;
    try {
      const fresh = await request<Snapshot>('live/state', session, undefined, await getToken());
      setState((old) => {
        const next = !old || fresh.version >= old.version ? fresh : old;
        stateRef.current = next;
        return next;
      });
      setConnected(true);
    } catch (e) {
      setConnected(false);
      if (!stateRef.current) setError((e as Error).message);
      if (e instanceof ApiError && ['SESSION_REVOKED', 'UNAUTHENTICATED'].includes(e.code)) {
        setState(null);
        setFatal(true);
        setError(e.message);
      }
    } finally {
      refreshing.current = false;
    }
  }, [session, role, getToken]);
  useEffect(() => {
    void refresh();
    if (!session) return;
    const interval = setInterval(() => void refresh(), config?.demo ? 1500 : 5000);
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', online);
    };
  }, [refresh, session, config?.demo]);
  useEffect(() => {
    let active = true;
    const sync = async () => {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
          const { server_time } = await request<{ server_time: number }>('time');
          const end = Date.now();
          if (end - start < best && active) {
            best = end - start;
            setOffset(server_time - (start + end) / 2);
          }
        } catch {}
      }
    };
    void sync();
    window.addEventListener('online', sync);
    const timer = setInterval(sync, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', sync);
    };
  }, []);
  const epoch = (state?.live as (Snapshot['live'] & { realtime_epoch?: number }) | undefined)
    ?.realtime_epoch;
  useEffect(() => {
    if (!config || config.demo || !session || !state?.member || !epoch) return;
    let disposed = false;
    const client = browserClient(config, role),
      topic = `quiz:${session.quiz_id}:${epoch}`;
    const channel = client
      .channel(`${topic}:${['QUIZMASTER', 'SCOREKEEPER'].includes(role) ? 'staff' : 'display'}`, {
        config: { private: true },
      })
      .on('broadcast', { event: 'STATE' }, ({ payload }: { payload: Snapshot }) => {
        if (!payload || typeof payload.version !== 'number') return;
        setState((old) =>
          old && payload.version >= old.version
            ? {
                ...old,
                version: payload.version,
                live: payload.live,
                session: payload.session,
                question: payload.question,
                round: payload.round,
                subround: payload.subround,
                buzzes: payload.buzzes,
                buzz_count: payload.buzz_count,
                leaderboard: payload.leaderboard,
                scoring: payload.scoring,
              }
            : old,
        );
        void refresh();
      });
    const presence = client.channel(`${topic}:presence:${state.member.id}`, {
      config: { private: true, presence: { key: state.member.id } },
    });
    void getToken()
      .then(async (token) => {
        if (disposed) return;
        await client.realtime.setAuth(token);
        if (disposed) return;
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnected(true);
            void refresh();
          }
        });
        presence.subscribe((status) => {
          if (status === 'SUBSCRIBED') void presence.track({ online_at: new Date().toISOString() });
        });
      })
      .catch(() => setConnected(false));
    return () => {
      disposed = true;
      void client.removeChannel(channel);
      void client.removeChannel(presence);
    };
  }, [config, session, role, epoch, state?.member?.id, getToken, refresh]);
  const presenceMembers =
    state?.members
      .filter((member) => member.participant_id && !member.revoked_at)
      .map((member) => `${member.id}:${member.participant_id}`)
      .sort()
      .join(',') || '';
  useEffect(() => {
    setPresenceOnline({});
    if (!config || config.demo || !session || !epoch || !presenceMembers) return;
    const supabase = browserClient(config, role);
    const observers = presenceMembers.split(',').map((entry) => {
      const [memberId, participantId] = entry.split(':');
      const channel = supabase.channel(`quiz:${session.quiz_id}:${epoch}:presence:${memberId}`, {
        config: { private: true },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          // The topic identifies the member. Never trust client-supplied identity fields.
          setPresenceOnline((old) => ({
            ...old,
            [participantId]: Object.keys(channel.presenceState()).length > 0,
          }));
        })
        .subscribe();
      return channel;
    });
    return () => {
      observers.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [config, session, role, epoch, presenceMembers]);
  function isParticipantOnline(participant: Participant) {
    return (
      presenceOnline[participant.id] ??
      !!(
        participant.last_seen_at &&
        Date.now() + offset - new Date(participant.last_seen_at).getTime() < 20000
      )
    );
  }
  const call = useCallback(
    async <T = unknown>(path: string, body?: unknown): Promise<T> =>
      request<T>(path, session, body, await getToken()),
    [session, getToken],
  );
  const action = useCallback(
    async (path: string, body: unknown) => {
      setBusy(true);
      setError('');
      try {
        const result = await call(path, body);
        await refresh();
        return result;
      } catch (e) {
        setError((e as Error).message);
        await refresh();
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [call, refresh],
  );
  const command = useCallback(
    (type: string, payload: Record<string, unknown> = {}) =>
      action('live/command', { type, payload, expected_version: stateRef.current?.version }),
    [action],
  );
  function joined(next: Session) {
    saveSession(role, next);
    setSession(next);
    setFatal(false);
    setError('');
  }
  async function logout() {
    localStorage.removeItem(sessionKey(role));
    if (config && !config.demo) await browserClient(config, role).auth.signOut();
    setSession(null);
    setState(null);
    setFatal(false);
    setError('');
  }
  return {
    config,
    session,
    state,
    error,
    setError,
    fatal,
    loading,
    busy,
    connected,
    isParticipantOnline,
    offset,
    refresh,
    call,
    action,
    command,
    joined,
    logout,
  };
}
export type QuizClient = ReturnType<typeof useQuiz>;
