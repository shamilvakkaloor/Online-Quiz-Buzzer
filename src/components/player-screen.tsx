'use client';
import { useState } from 'react';
import { Check, Flag, LogOut, Maximize2, Radio, Sparkles, Trophy, Zap } from 'lucide-react';
import type { QuizClient } from '@/lib/use-quiz';
import { Avatar, Badge, Brand, SoundButton, useTimer } from './ui';
import { Leaderboard } from './workspace-views';
export function PlayerScreen({
  client,
  audience = false,
}: {
  client: QuizClient;
  audience?: boolean;
}) {
  const s = client.state!,
    timer = useTimer(s, client.offset),
    [pressing, setPressing] = useState(false),
    [ack, setAck] = useState<{ id: string; rank: number | null } | null>(null);
  const accepted = s.own_buzz?.accepted || !!(ack && ack.id === s.session?.id),
    rank = s.own_buzz?.official_rank ?? (ack && ack.id === s.session?.id ? ack.rank : null),
    canBuzz =
      client.connected &&
      s.session?.status === 'OPEN' &&
      !s.live.is_paused &&
      !accepted &&
      s.question?.status === 'ACTIVE';
  async function buzz() {
    if (!canBuzz || pressing) return;
    setPressing(true);
    try {
      const result = (await client.action('buzz', { buzzer_session_id: s.session!.id })) as {
        official_rank: number | null;
      };
      setAck({ id: s.session!.id, rank: result.official_rank });
      navigator.vibrate?.([60, 40, 60]);
    } catch {
    } finally {
      setPressing(false);
    }
  }
  const status =
    s.live.status === 'COMPLETED'
      ? 'That’s a wrap!'
      : s.live.is_paused
        ? 'A quick breather.'
        : accepted
          ? 'You’re in!'
          : s.session?.status === 'OPEN'
            ? 'Know it? Buzz it.'
            : s.question?.status === 'ACTIVE'
              ? 'Hang tight.'
              : 'Get your game face on.';
  return (
    <div className={`player-page ${audience ? 'audience-page' : ''}`}>
      <header className="player-header">
        <Brand />
        <div>
          <Badge tone={client.connected ? 'green' : 'amber'}>
            {client.connected
              ? client.config?.demo
                ? 'Practice quiz'
                : 'Connected'
              : 'Reconnecting'}
          </Badge>
          {audience && (
            <button
              className="icon-button"
              aria-label="Enter full screen"
              onClick={() => {
                if (!document.fullscreenElement)
                  void document.documentElement.requestFullscreen().catch(() => {});
                else void document.exitFullscreen();
              }}
            >
              <Maximize2 size={20} />
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => void client.logout()}
            aria-label="Leave quiz"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="player-main">
        <div className="player-quiz-title">
          <span className="eyebrow">{s.quiz.title}</span>
          <h1>
            {audience
              ? s.live.status === 'COMPLETED'
                ? 'What a game.'
                : s.live.is_paused
                  ? 'We’ll be right back.'
                  : s.question
                    ? `Question ${String(s.question.question_number).padStart(2, '0')}`
                    : 'Let the good times begin.'
              : status}
          </h1>
          <p>
            {s.round?.name || 'Good company. Great questions.'}
            {s.subround ? ` / ${s.subround.name}` : ''}
          </p>
        </div>
        {audience ? (
          <>
            <div className="audience-status">
              <Badge tone={s.session?.status === 'OPEN' && !s.live.is_paused ? 'green' : 'neutral'}>
                {s.live.is_paused
                  ? 'Quiz paused'
                  : s.session?.status === 'OPEN'
                    ? 'Buzzers open'
                    : s.session?.status === 'LOCKED'
                      ? 'Buzzers locked'
                      : 'Standing by'}
              </Badge>
              {s.live.timer_duration_ms && <strong>{timer.text}</strong>}
              <SoundButton count={s.buzz_count} />
            </div>
            <div className="audience-content">
              <section className="card audience-buzzes">
                <div className="card-toolbar">
                  <h3>
                    <Zap size={21} />
                    Quick off the mark
                  </h3>
                  <span>{s.buzz_count} buzzes</span>
                </div>
                {s.buzzes.length ? (
                  s.buzzes.map((b, i) => (
                    <div className={`buzz-row ${i === 0 ? 'winning' : ''}`} key={b.participant_id}>
                      <span className="buzz-rank">{String(b.official_rank).padStart(2, '0')}</span>
                      <Avatar name={b.display_name} index={i} />
                      <strong>{b.display_name}</strong>
                      {i === 0 && <Sparkles size={24} />}
                    </div>
                  ))
                ) : (
                  <div className="audience-waiting">
                    <Radio size={50} />
                    <h2>{s.live.is_paused ? 'A moment to regroup.' : 'The room is ready.'}</h2>
                    <p>Official buzz positions will appear here.</p>
                  </div>
                )}
              </section>
              {s.live.leaderboard_visible && (
                <section className="card">
                  <div className="card-toolbar">
                    <h3>
                      <Trophy size={21} />
                      The standings
                    </h3>
                  </div>
                  <Leaderboard state={s} />
                </section>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="player-question-line">
              <span>
                {s.question
                  ? `QUESTION ${String(s.question.question_number).padStart(2, '0')}`
                  : 'WAITING FOR THE FIRST QUESTION'}
              </span>
              {s.live.timer_duration_ms !== null && <strong>{timer.text}</strong>}
            </div>
            <div
              className={`buzzer-ring ${canBuzz ? 'available' : ''} ${accepted ? 'accepted' : ''}`}
            >
              <button
                className="big-buzzer"
                onClick={() => void buzz()}
                disabled={!canBuzz || pressing}
                aria-label="Press the buzzer"
              >
                {accepted ? (
                  <Check size={55} />
                ) : (
                  <Zap size={64} strokeWidth={1.5} fill={canBuzz ? 'currentColor' : 'none'} />
                )}
                <strong>
                  {pressing
                    ? 'SENDING…'
                    : accepted
                      ? s.live.show_own_position && rank
                        ? `POSITION ${rank}`
                        : 'BUZZED!'
                      : canBuzz
                        ? 'BUZZ'
                        : 'STAND BY'}
                </strong>
                <span>
                  {accepted
                    ? 'Your buzz is confirmed'
                    : canBuzz
                      ? 'Make your move'
                      : s.live.is_paused
                        ? 'Quiz paused'
                        : 'Your moment is coming'}
                </span>
              </button>
            </div>
            <p className="player-hint">
              {accepted
                ? 'Nice reaction. Your quizmaster will take it from here.'
                : s.live.is_paused
                  ? 'Take a breath. The quiz will resume shortly.'
                  : 'One press. One chance. Make it count.'}
            </p>
            <div className="player-identity">
              <Avatar name={s.member.display_name} />
              <div>
                <strong>{s.member.display_name}</strong>
                <small>You’re playing as this participant</small>
              </div>
              <Check size={17} />
            </div>
            {s.buzzes.length > 0 && (
              <section className="card player-results">
                <div className="card-toolbar">
                  <h3>The quick thinkers</h3>
                  <span>{s.buzz_count} buzzes</span>
                </div>
                {s.buzzes.map((b) => (
                  <div className="player-result" key={b.participant_id}>
                    <span>#{b.official_rank}</span>
                    <strong>{b.display_name}</strong>
                    {b.participant_id === s.member.participant_id && <Badge>You</Badge>}
                  </div>
                ))}
              </section>
            )}
            {s.live.leaderboard_visible && (
              <section className="card player-results">
                <div className="card-toolbar">
                  <h3>
                    <Trophy size={17} />
                    The standings
                  </h3>
                </div>
                <Leaderboard state={s} />
              </section>
            )}
          </>
        )}
        {client.error && (
          <div className="form-error" role="alert">
            {client.error}
          </div>
        )}
        <footer className="player-footer">
          {client.config?.demo && <span>Practice workspace · </span>}Official buzz order follows the
          server’s processing order.
        </footer>
      </main>
    </div>
  );
}
