'use client';
import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  Flag,
  LockKeyhole,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  Sparkles,
  Timer,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import type { QuizClient } from '@/lib/use-quiz';
import { Avatar, Badge, Empty, Modal, SoundButton, useTimer } from './ui';
import { Leaderboard, safe } from './workspace-views';
export function LiveControl({
  client,
  navigate,
}: {
  client: QuizClient;
  navigate: (tab: string) => void;
}) {
  const s = client.state!,
    timer = useTimer(s, client.offset),
    [finish, setFinish] = useState(false);
  const next = s.questions.find((q) => q.status === 'PENDING'),
    active = s.question?.status === 'ACTIVE',
    started = s.live.status === 'LIVE',
    completed = s.live.status === 'COMPLETED',
    open = s.session?.status === 'OPEN' && !s.live.is_paused;
  const question = active ? s.question : next || s.question,
    round = s.rounds.find((r) => r.id === question?.round_id),
    done = s.questions.filter((q) => q.status === 'COMPLETED' || q.status === 'SKIPPED').length,
    online = s.participants.filter(client.isParticipantOnline).length;
  const audience = s.access.find((a) => a.kind === 'AUDIENCE');
  return (
    <>
      <div className="section-heading live-heading">
        <div>
          <span className="eyebrow">THE FLOOR IS YOURS</span>
          <h1>
            Let’s make it a good one<span className="lime-text">.</span>
          </h1>
          <p>You bring the questions. We’ll handle the quick reactions.</p>
        </div>
        <SoundButton count={s.buzz_count} />
      </div>
      <div className="metrics-row">
        <div className="metric">
          <span className="metric-icon mint">
            <Users size={20} />
          </span>
          <div>
            <span>Participants</span>
            <strong>
              {s.participants.length}
              <small> / {s.settings?.max_participants || 50}</small>
            </strong>
          </div>
          <span className="metric-note">
            <i />
            {online} connected
          </span>
        </div>
        <div className="metric">
          <span className="metric-icon lavender">
            <ListIcon />
          </span>
          <div>
            <span>Quiz progress</span>
            <strong>
              {done}
              <small> / {s.questions.length} questions</small>
            </strong>
          </div>
          <div className="mini-progress">
            <i
              style={{ width: `${s.questions.length ? (done / s.questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="metric">
          <span className="metric-icon peach">
            <Trophy size={20} />
          </span>
          <div>
            <span>Leaderboard</span>
            <strong className="metric-word">
              {s.live.leaderboard_visible ? 'On display' : 'Behind the scenes'}
            </strong>
          </div>
          <button className="text-button" onClick={() => navigate('leaderboard')}>
            Manage
            <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      <div className="control-grid">
        <div className="control-main">
          <section className="card question-card">
            <div className="question-card-top">
              <div className="eyebrow">
                <span className="round-indicator" />
                ROUND {round?.sequence || 1}
                <ChevronRight size={13} />
                {round?.name || 'Your first round'}
              </div>
              <Badge
                tone={
                  s.live.is_paused ? 'amber' : completed ? 'neutral' : started ? 'green' : 'neutral'
                }
              >
                {s.live.is_paused
                  ? 'Quiz paused'
                  : completed
                    ? 'Quiz complete'
                    : started
                      ? 'Live quiz'
                      : 'Ready to go'}
              </Badge>
            </div>
            <div className="question-stage">
              <div>
                <span className="eyebrow">
                  {completed ? 'THAT’S A WRAP' : active ? 'ON THE FLOOR' : 'UP NEXT'}
                </span>
                <h2>
                  {completed ? (
                    'Well played.'
                  ) : (
                    <>
                      Question{' '}
                      <span>{String(question?.question_number || 1).padStart(2, '0')}</span>
                    </>
                  )}
                </h2>
                <p>
                  {completed
                    ? 'The final scores are in. What a game.'
                    : s.subround && active
                      ? s.subround.name
                      : active
                        ? 'A little quick thinking goes a long way.'
                        : started
                          ? 'The next round of quick thinking awaits.'
                          : 'Gather your teams. Find your quizmaster voice.'}
                </p>
              </div>
              <div
                className={`timer-panel ${timer.seconds <= 5 && s.live.timer_started_at ? 'urgent' : ''}`}
              >
                <div>
                  <Timer size={14} />
                  QUESTION TIMER
                </div>
                <strong>{timer.text}</strong>
                <div className="timer-actions">
                  <button
                    aria-label={s.live.timer_started_at ? 'Pause timer' : 'Start timer'}
                    disabled={!active || s.live.is_paused || client.busy}
                    onClick={() =>
                      safe(client.command(s.live.timer_started_at ? 'TIMER_PAUSE' : 'TIMER_START'))
                    }
                  >
                    {s.live.timer_started_at ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <span>
                    {s.live.is_paused
                      ? 'Paused'
                      : s.live.timer_started_at
                        ? 'Counting down'
                        : 'Ready when you are'}
                  </span>
                  <button
                    aria-label="Reset timer"
                    disabled={!active || client.busy}
                    onClick={() => safe(client.command('TIMER_RESET'))}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
            </div>
            <div
              className={`buzzer-status ${open ? 'is-open' : s.live.is_paused ? 'is-paused' : ''}`}
            >
              <span className="status-orbit">
                {open ? (
                  <Radio size={20} />
                ) : s.live.is_paused ? (
                  <Pause size={18} />
                ) : (
                  <LockKeyhole size={18} />
                )}
              </span>
              <div>
                <strong>
                  {completed
                    ? 'Thanks for playing'
                    : s.live.is_paused
                      ? 'A quick breather.'
                      : open
                        ? 'Buzzers are open'
                        : active
                          ? 'Buzzers are locked'
                          : 'The stage is set'}
                </strong>
                <p>
                  {completed
                    ? 'Your history and scores are ready to review.'
                    : s.live.is_paused
                      ? 'Timer frozen. Participants are standing by.'
                      : open
                        ? 'First in, first heard. Let the answers fly.'
                        : active
                          ? s.session?.lock_reason === 'TIMER_END'
                            ? 'Time’s up. Reset the timer to reopen.'
                            : 'Take a moment to hear the answers.'
                          : started
                            ? 'Start the next question to open the buzzers.'
                            : 'Start your quiz when everyone is ready.'}
                </p>
              </div>
              {open && (
                <span className="live-wave">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </div>
            <div className="question-controls">
              {!started && !completed ? (
                <button
                  className="button primary"
                  disabled={client.busy || !next}
                  onClick={() => safe(client.command('START_QUIZ'))}
                >
                  <Play size={17} fill="currentColor" />
                  Start quiz
                </button>
              ) : active ? (
                <>
                  <button
                    className={`button ${open ? 'lock-button' : 'primary'}`}
                    disabled={client.busy || s.live.is_paused}
                    onClick={() => safe(client.command(open ? 'LOCK_BUZZER' : 'REOPEN_BUZZER'))}
                  >
                    {open ? <LockKeyhole size={16} /> : <Radio size={17} />}{' '}
                    {open ? 'Lock buzzers' : 'Reopen buzzers'}
                  </button>
                  <button
                    className="button"
                    disabled={client.busy}
                    onClick={() => safe(client.command(s.live.is_paused ? 'RESUME' : 'PAUSE'))}
                  >
                    {s.live.is_paused ? <Play size={16} /> : <Pause size={16} />}{' '}
                    {s.live.is_paused ? 'Resume quiz' : 'Pause quiz'}
                  </button>
                  <button
                    className="button quiet complete-button"
                    disabled={client.busy}
                    onClick={() => safe(client.command('COMPLETE_QUESTION'))}
                  >
                    Complete question
                    <Check size={17} />
                  </button>
                </>
              ) : completed ? (
                <button className="button primary" onClick={() => navigate('leaderboard')}>
                  <Trophy size={17} />
                  View final standings
                </button>
              ) : (
                <>
                  <button
                    className="button primary"
                    disabled={client.busy || !next || s.live.is_paused}
                    onClick={() =>
                      safe(client.command('START_QUESTION', { question_id: next?.id }))
                    }
                  >
                    <Play size={16} fill="currentColor" />
                    Start question {next?.question_number || ''}
                  </button>
                  {s.live.is_paused ? (
                    <button
                      className="button"
                      disabled={client.busy}
                      onClick={() => safe(client.command('RESUME'))}
                    >
                      <Play size={16} />
                      Resume quiz
                    </button>
                  ) : (
                    <button
                      className="button quiet"
                      disabled={!next || client.busy}
                      onClick={() =>
                        safe(client.command('SKIP_QUESTION', { question_id: next?.id }))
                      }
                    >
                      <SkipForward size={16} />
                      Skip question
                    </button>
                  )}
                  <button className="button quiet complete-button" onClick={() => setFinish(true)}>
                    Finish quiz
                    <Flag size={16} />
                  </button>
                </>
              )}
            </div>
          </section>
          <section className="card buzz-card">
            <div className="card-toolbar">
              <div>
                <h3>
                  <Zap size={19} />
                  The buzz order <span className="count-pill">{s.buzz_count}</span>
                </h3>
                <p>Official order. Every reaction accounted for.</p>
              </div>
              <Badge tone={open ? 'green' : 'neutral'}>{open ? 'Listening' : 'Standing by'}</Badge>
            </div>
            {s.buzzes.length ? (
              <div className="buzz-list">
                {s.buzzes.map((b, i) => (
                  <div className={`buzz-row ${i === 0 ? 'winning' : ''}`} key={b.participant_id}>
                    <span className="buzz-rank">{String(b.official_rank).padStart(2, '0')}</span>
                    <Avatar name={b.display_name} index={i} />
                    <div>
                      <strong>{b.display_name}</strong>
                      <small>
                        {i === 0 ? 'First to the buzzer' : 'Official position confirmed'}
                      </small>
                    </div>
                    {i === 0 ? (
                      <span className="first-buzz">
                        <Zap size={12} fill="currentColor" />
                        FIRST IN
                      </span>
                    ) : (
                      <time>
                        {new Date(b.server_received_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    )}
                    <Check size={15} className="positive-text" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="buzz-empty">
                <div className="buzz-empty-graphic">
                  <span />
                  <span />
                  <Zap size={28} />
                </div>
                <h3>{open ? 'Who’s got the quickest reaction?' : 'Big ideas. Quick fingers.'}</h3>
                <p>
                  {open
                    ? 'The first buzz will appear right here.'
                    : 'Start a question and watch the buzzes roll in.'}
                </p>
                {client.config?.demo && (
                  <a
                    href="/join?code=BRAINWAV"
                    target="_blank"
                    rel="noreferrer"
                    className="text-button"
                  >
                    Try the participant buzzer
                    <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            )}
            <div className="buzz-footer">
              <span>
                Recorded{' '}
                <strong>
                  {s.buzz_count} /{' '}
                  {s.session?.record_limit || s.settings?.max_buzzes_per_question || 50}
                </strong>
              </span>
              <label>
                Show on public screens
                <select
                  aria-label="Public display limit"
                  value={s.live.display_limit}
                  disabled={client.busy}
                  onChange={(e) =>
                    safe(client.command('SET_DISPLAY_LIMIT', { value: Number(e.target.value) }))
                  }
                >
                  {[...new Set([0, 1, 3, 5, 10, 25, 50, s.live.display_limit])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option value={n} key={n}>
                        {n === 50 ? 'All positions' : n === 0 ? 'None' : `Top ${n}`}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </section>
          <div className="host-note">
            <span>
              <Sparkles size={18} />
            </span>
            <div>
              <strong>A little tip from the booth</strong>
              <p>
                Read the whole question before opening the floor. Great quizzes have great pacing.
              </p>
            </div>
            <span className="note-decoration">✳</span>
          </div>
        </div>
        <aside className="control-aside">
          <section className="card round-overview">
            <div className="card-toolbar">
              <h3>The running order</h3>
              <button
                className="icon-button"
                onClick={() => navigate('questions')}
                aria-label="Edit questions"
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="round-overview-list">
              {s.rounds.map((r, i) => {
                const qs = s.questions.filter((q) => q.round_id === r.id),
                  finished =
                    qs.length > 0 &&
                    qs.every((q) => q.status === 'COMPLETED' || q.status === 'SKIPPED'),
                  current = r.id === round?.id;
                return (
                  <div className={`overview-round ${current ? 'current' : ''}`} key={r.id}>
                    <div className="overview-round-heading">
                      <span className="round-step">
                        {finished ? <Check size={14} /> : String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {qs.length} questions{current ? ' · You’re here' : ''}
                        </small>
                      </div>
                      {current && <i />}
                    </div>
                    {current && (
                      <div className="question-dots">
                        {qs.map((q) => (
                          <span
                            key={q.id}
                            title={`Question ${q.question_number}: ${q.status.toLowerCase()}`}
                            className={`${q.status.toLowerCase()} ${q.id === question?.id ? 'next' : ''}`}
                          >
                            {q.status === 'COMPLETED' ? <Check size={11} /> : q.question_number}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!s.rounds.length && (
                <Empty icon={<Flag />} title="A clean slate">
                  Add a round in Quiz setup.
                </Empty>
              )}
            </div>
            <button className="text-button full" onClick={() => navigate('questions')}>
              View all questions
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="standings-card">
            <div className="standings-heading">
              <span>
                <Trophy size={18} /> A peek at the podium
              </span>
              <Sparkles size={17} />
            </div>
            <Leaderboard state={s} compact />
            <div className="standings-footer">
              <span>
                {s.live.leaderboard_visible ? <Eye size={14} /> : <EyeOffIcon />}
                {s.live.leaderboard_visible ? 'Visible to everyone' : 'Only your crew can see this'}
              </span>
              <button
                className="icon-button"
                aria-label="View leaderboard"
                onClick={() => navigate('leaderboard')}
              >
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
          <section className="audience-promo">
            <span className="audience-spark">✳</span>
            <span className="eyebrow">GIVE IT THE BIG SCREEN</span>
            <h3>
              Let the room
              <br />
              in on the action.
            </h3>
            <p>
              Buzzes, countdowns, and those
              <br />
              all-important scores.
            </p>
            <a
              className="text-button"
              href={`/audience${audience ? `?code=${audience.code}` : ''}`}
              target="_blank"
              rel="noreferrer"
            >
              Open audience view
              <ArrowUpRight size={15} />
            </a>
          </section>
        </aside>
      </div>
      {finish && (
        <Modal title="Ready for the final applause?" onClose={() => setFinish(false)}>
          <p className="muted">
            Finishing closes the quiz. You can still edit scores and reveal the leaderboard
            afterward.
          </p>
          {next && (
            <p className="form-error">
              There are {s.questions.filter((q) => q.status === 'PENDING').length} unplayed
              questions.
            </p>
          )}
          <div className="modal-actions">
            <button className="button" onClick={() => setFinish(false)}>
              Keep playing
            </button>
            <button
              className="button primary"
              disabled={client.busy}
              onClick={async () => {
                try {
                  await client.command('FINISH_QUIZ');
                  setFinish(false);
                } catch {}
              }}
            >
              Finish quiz
              <Flag size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ListIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M9 5h12M9 12h12M9 19h12M3 5h.1M3 12h.1M3 19h.1" strokeLinecap="round" />
    </svg>
  );
}
function EyeOffIcon() {
  return <Eye size={14} />;
}
