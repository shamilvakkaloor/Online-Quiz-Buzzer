'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Radio, ShieldCheck, Zap } from 'lucide-react';
import type { Role } from '@/types/quiz';
import type { QuizClient } from '@/lib/use-quiz';
import { browserClient, request, type Session } from '@/lib/client';
import { Brand, Spinner } from './ui';
import { Captcha } from './captcha';
export function JoinScreen({ client, role }: { client: QuizClient; role: Role }) {
  const [code, setCode] = useState(''),
    [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Session | null>(null),
    [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState(''),
    [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [participantInfo, setParticipantInfo] = useState<{
    individual: boolean;
    display_name?: string;
  } | null>(null);
  useEffect(() => {
    setCode(new URLSearchParams(location.search).get('code') || '');
  }, []);
  useEffect(() => {
    if (!pending) return;
    const i = setInterval(async () => {
      try {
        const result = await request<{ joined: boolean; request_status: string }>(
          'join-status',
          pending,
        );
        if (result.joined) client.joined(pending);
        else if (result.request_status === 'REJECTED') {
          setPending(null);
          setError('The quizmaster declined the device change. Please ask them for help.');
        }
      } catch {}
    }, 2000);
    return () => clearInterval(i);
  }, [pending, client]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client.config) return;
    setBusy(true);
    setError('');
    try {
      let token: string;
      if (client.config.demo) {
        const temp = await request<Session>('demo/session', null, { role });
        token = temp.token;
        if (role === 'ADMIN') {
          client.joined(temp);
          return;
        }
      } else {
        const supabase = browserClient(client.config, role);
        if (role === 'ADMIN') {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken },
          });
          if (error) throw error;
          token = data.session!.access_token;
          await request('admin/quizzes', null, undefined, token);
          client.joined({ token, quiz_id: '' });
          return;
        }
        let {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously({
            options: { captchaToken },
          });
          if (error) throw error;
          session = data.session;
        }
        token = session!.access_token;
      }
      if (role === 'PARTICIPANT' && !participantInfo) {
        setParticipantInfo(await request('join-info', null, { code }, token));
        return;
      }
      const path = role === 'QUIZMASTER' ? 'auth/quizmaster/login' : `join/${role.toLowerCase()}`;
      const result = await request<{ quiz_id: string; pending?: boolean }>(
        path,
        null,
        {
          code,
          display_name: participantInfo?.individual ? undefined : name || undefined,
          ...(role === 'QUIZMASTER' ? { password } : {}),
        },
        token,
      );
      const next = { token, quiz_id: result.quiz_id };
      if (result.pending) setPending(next);
      else client.joined(next);
    } catch (e) {
      setError((e as Error).message);
      setCaptchaToken('');
      setCaptchaAttempt((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  const title =
    role === 'QUIZMASTER'
      ? 'Your quiz. Your stage.'
      : role === 'ADMIN'
        ? 'Behind the scenes.'
        : role === 'AUDIENCE'
          ? 'Take a front-row seat.'
          : role === 'SCOREKEEPER'
            ? 'Make every point count.'
            : 'Got the answer?';
  return (
    <div className="join-page">
      <section className="join-story">
        <Brand />
        <div className="join-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-star">✳</div>
          <div className="art-buzzer">
            <Zap size={68} strokeWidth={1.7} />
          </div>
          <span className="art-label">
            <span />
            QUICK THINKING. GOOD TIMES.
          </span>
        </div>
        <h1>
          A little friendly
          <br />
          competition.
        </h1>
        <p>
          Great questions, quick reactions, and that
          <br />
          unbeatable feeling of buzzing in first.
        </p>
        <small>Made for your next great quiz.</small>
      </section>
      <section className="join-form-side">
        <nav className="role-links">
          <a href="/join" className={role === 'PARTICIPANT' ? 'selected' : ''}>
            Play
          </a>
          <a href="/quizmaster" className={role === 'QUIZMASTER' ? 'selected' : ''}>
            Host
          </a>
          <a href="/scorekeeper" className={role === 'SCOREKEEPER' ? 'selected' : ''}>
            Score
          </a>
          <a href="/audience" className={role === 'AUDIENCE' ? 'selected' : ''}>
            Watch
          </a>
        </nav>
        <div className="join-form">
          <div className="eyebrow">
            {role === 'PARTICIPANT' ? 'YOU’RE UP' : role.replace('_', ' ')}
          </div>
          <h2>{title}</h2>
          <p className="muted">
            {role === 'ADMIN'
              ? 'Sign in with your owner account.'
              : role === 'QUIZMASTER'
                ? 'Sign in to bring everyone together.'
                : 'Enter your access code and join the fun.'}
          </p>
          {client.config?.demo && (
            <div className="practice-note">
              <Zap size={17} />
              <div>
                <strong>Try the practice quiz</strong>
                <button
                  type="button"
                  onClick={() => {
                    setCode(
                      role === 'QUIZMASTER'
                        ? 'FRIDAY'
                        : role === 'PARTICIPANT'
                          ? 'BRAINWAV'
                          : role === 'SCOREKEEPER'
                            ? 'SCOREFRD'
                            : 'WATCHFRD',
                    );
                    setPassword('quizmaster2026');
                    setName(
                      role === 'PARTICIPANT'
                        ? 'The Brainwaves'
                        : role === 'QUIZMASTER'
                          ? 'Alex Morgan'
                          : 'Guest',
                    );
                  }}
                >
                  Fill in practice details <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
          {pending ? (
            <div className="waiting-approval">
              <Spinner />
              <h3>Your quizmaster is on it.</h3>
              <p>Waiting for approval to move this participant to your device.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              {role === 'ADMIN' ? (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
              ) : (
                <label>
                  {role === 'QUIZMASTER' ? 'Quiz ID' : 'Access code'}
                  <input
                    className="code-input"
                    required
                    autoComplete="off"
                    value={code}
                    maxLength={40}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setParticipantInfo(null);
                    }}
                    placeholder="ENTER CODE"
                  />
                </label>
              )}
              {participantInfo?.individual && (
                <div className="join-identity">
                  <small>YOU’RE JOINING AS</small>
                  <h3>{participantInfo.display_name}</h3>
                  <p>This personal code uses the name set by your quizmaster.</p>
                </div>
              )}
              {role !== 'ADMIN' &&
                (role !== 'PARTICIPANT' || participantInfo?.individual === false) && (
                  <label>
                    {role === 'PARTICIPANT' ? 'Your name or team' : 'Your display name'}
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={role === 'QUIZMASTER' || role === 'PARTICIPANT'}
                      maxLength={100}
                      placeholder={
                        role === 'PARTICIPANT' ? 'What should we call you?' : 'Your name'
                      }
                    />
                  </label>
                )}
              {(role === 'ADMIN' || role === 'QUIZMASTER') && (
                <label>
                  Password
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {client.config?.turnstile_site_key && !client.config.demo && (
                <Captcha
                  key={captchaAttempt}
                  siteKey={client.config.turnstile_site_key}
                  onToken={setCaptchaToken}
                />
              )}
              {(error || client.error) && (
                <div role="alert" className="form-error">
                  {error || client.error}
                </div>
              )}
              <button
                className="button primary full"
                disabled={
                  busy ||
                  !client.config ||
                  !!(client.config.turnstile_site_key && !client.config.demo && !captchaToken)
                }
              >
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    {role === 'QUIZMASTER' || role === 'ADMIN'
                      ? 'Enter workspace'
                      : role === 'PARTICIPANT' && !participantInfo
                        ? 'Continue'
                        : 'Join quiz'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}
          <p className="join-footer">
            <ShieldCheck size={15} />
            {role === 'PARTICIPANT'
              ? 'No account needed. Just your competitive spirit.'
              : 'Your access stays private to this quiz.'}
          </p>
        </div>
        <footer>
          <Radio size={14} /> Good quizzes bring people together.
        </footer>
      </section>
    </div>
  );
}
