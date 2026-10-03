'use client';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Flag,
  History,
  KeyRound,
  ListOrdered,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Trash2,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { QuizClient } from '@/lib/use-quiz';
import type { Participant, Question, ScoreRule, Settings, Snapshot } from '@/types/quiz';
import { points } from '@/lib/client';
import { Avatar, Badge, Empty, Modal } from './ui';
export const safe = (promise: Promise<unknown>) => void promise.catch(() => {});
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button"
      aria-label={`Copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

export function Leaderboard({ state, compact = false }: { state: Snapshot; compact?: boolean }) {
  return (
    <div className={compact ? 'leaderboard compact' : 'leaderboard'}>
      {state.leaderboard.length ? (
        state.leaderboard.slice(0, compact ? 5 : 50).map((row, i) => (
          <div className="leader-row" key={row.participant_id}>
            <span className={`leader-rank ${i === 0 ? 'first' : ''}`}>
              {i === 0 ? <Trophy size={16} /> : String(row.rank).padStart(2, '0')}
            </span>
            <Avatar name={row.display_name} index={i} />
            <strong>{row.display_name}</strong>
            <span className="leader-points">
              {row.total}
              <small>pts</small>
            </span>
          </div>
        ))
      ) : (
        <Empty icon={<Trophy />} title="The scores are under wraps">
          The leaderboard will appear when your quizmaster reveals it.
        </Empty>
      )}
    </div>
  );
}

export function ParticipantsView({ client }: { client: QuizClient }) {
  const s = client.state!,
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<'add' | Participant | null>(null),
    [names, setNames] = useState(''),
    [type, setType] = useState('TEAM');
  const list = s.participants.filter((p) =>
    p.display_name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <SectionHeading
        eyebrow="THE PEOPLE MAKE THE QUIZ"
        title="Meet the competition."
        description={`${s.participants.length} participants. A whole lot of potential.`}
        action={
          <button className="button primary" onClick={() => setModal('add')}>
            <Plus size={17} />
            Add participants
          </button>
        }
      />
      {s.takeovers.length > 0 && (
        <div className="card takeover-card">
          <h3>Device changes need your approval</h3>
          {s.takeovers.map((t) => (
            <div className="flex-row" key={t.id}>
              <span>{t.display_name} wants to join on a new device.</span>
              <button
                className="button small"
                onClick={() =>
                  safe(client.action('quiz/takeovers', { id: t.id, operation: 'reject' }))
                }
              >
                Decline
              </button>
              <button
                className="button small primary"
                onClick={() =>
                  safe(client.action('quiz/takeovers', { id: t.id, operation: 'approve' }))
                }
              >
                Approve
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-toolbar">
          <div>
            <h3>
              Participant roster <span className="count-pill">{s.participants.length}</span>
            </h3>
            <p>Individual codes keep each team’s place secure.</p>
          </div>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search participants"
              placeholder="Find a participant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PARTICIPANT</th>
                <th>TYPE</th>
                <th>CONNECTION</th>
                <th>JOIN CODE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <div className="name-cell">
                      <Avatar name={p.display_name} index={i} />
                      <strong>{p.display_name}</strong>
                    </div>
                  </td>
                  <td>{p.type === 'TEAM' ? 'Team' : 'Individual'}</td>
                  <td>
                    <Badge tone={client.isParticipantOnline(p) ? 'green' : 'neutral'}>
                      {client.isParticipantOnline(p)
                        ? 'Connected'
                        : p.joined
                          ? 'Away'
                          : 'Not joined'}
                    </Badge>
                  </td>
                  <td>
                    <div className="code-cell">
                      <code>{p.join_code || 'Disabled'}</code>
                      {p.join_code && <CopyButton value={p.join_code} />}
                    </div>
                  </td>
                  <td>
                    <button className="button small" onClick={() => setModal(p)}>
                      <QrCode size={15} />
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty icon={<Users />} title="Room for a few bright minds">
            Add participants to generate their individual join codes.
          </Empty>
        )}
        <div className="table-footer">
          {s.participants.length} of {s.settings?.max_participants || 50} places filled
          <span>One active device per participant</span>
        </div>
      </div>
      {modal === 'add' && (
        <Modal title="Add your participants" onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await client.action('quiz/participants/import', { names, type });
                setModal(null);
                setNames('');
              } catch {}
            }}
          >
            <p className="muted">
              Paste one name per line. Each participant gets a unique access code.
            </p>
            <label>
              Participant type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="TEAM">Teams</option>
                <option value="PERSON">Individuals</option>
              </select>
            </label>
            <label>
              Names
              <textarea
                rows={7}
                required
                value={names}
                onChange={(e) => setNames(e.target.value)}
                placeholder={'The Brainwaves\nThe Wild Guesses\nYour next great team'}
              />
            </label>
            <button className="button primary full" disabled={client.busy}>
              Add participants
              <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal && modal !== 'add' && (
        <ParticipantModal
          participant={s.participants.find((p) => p.id === modal.id) || modal}
          client={client}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
function ParticipantModal({
  participant: p,
  client,
  onClose,
}: {
  participant: Participant;
  client: QuizClient;
  onClose: () => void;
}) {
  const [name, setName] = useState(p.display_name);
  const member = client.state?.members.find((m) => m.participant_id === p.id && !m.revoked_at);
  const link = typeof window !== 'undefined' ? `${location.origin}/join?code=${p.join_code}` : '';
  return (
    <Modal title="Participant access" onClose={onClose}>
      <div className="qr-panel">
        {p.join_code ? (
          <>
            <QRCodeSVG value={link} size={172} bgColor="#ffffff" fgColor="#25342d" />
            <h3>{p.display_name}</h3>
            <div className="code-cell">
              <code>{p.join_code}</code>
              <CopyButton value={link} />
            </div>
            <p>Scan to join. Keep this code with your team.</p>
          </>
        ) : (
          <p>The join code is disabled.</p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          safe(client.action('quiz/participants', { id: p.id, display_name: name, type: p.type }));
        }}
      >
        <label>
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </label>
        <div className="flex-row wrap">
          <button className="button" disabled={client.busy}>
            Save name
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              safe(client.action('quiz/participants', { id: p.id, operation: 'rotate' }))
            }
          >
            <RefreshCw size={15} />
            New code
          </button>
          <button
            type="button"
            className="button quiet danger-text"
            onClick={() =>
              safe(client.action('quiz/participants', { id: p.id, operation: 'revoke_code' }))
            }
          >
            Disable code
          </button>
          {member && (
            <button
              type="button"
              className="button quiet danger-text"
              disabled={client.busy}
              onClick={() => safe(client.action('quiz/members', { id: member.id }))}
            >
              Disconnect device
            </button>
          )}
          {!p.joined && (
            <button
              type="button"
              className="button quiet danger-text"
              disabled={client.busy}
              onClick={async () => {
                try {
                  await client.action('quiz/participants', { id: p.id, operation: 'delete' });
                  onClose();
                } catch {}
              }}
            >
              Remove participant
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

type Editor = {
  entity: string;
  id?: string;
  title: string;
  round_id?: string;
  subround_id?: string | null;
  values?: Partial<ScoreRule>;
  uses_subrounds?: boolean;
  name?: string;
};
export function QuestionsView({ client }: { client: QuizClient }) {
  const s = client.state!,
    [editor, setEditor] = useState<Editor | null>(null);
  return (
    <>
      <SectionHeading
        eyebrow="A LITTLE STRUCTURE. A LOT OF POSSIBILITY."
        title="Set the stage."
        description="Build your rounds, line up your questions, and make it your own."
        action={
          <button
            className="button primary"
            onClick={() => setEditor({ entity: 'rounds', title: 'Add a round' })}
          >
            <Plus size={17} />
            Add round
          </button>
        }
      />
      <div className="structure-summary">
        <span>
          <ListOrdered size={19} />
          <strong>{s.rounds.length}</strong> rounds
        </span>
        <span>
          <Flag size={19} />
          <strong>{s.questions.length}</strong> questions
        </span>
        <span>
          <Check size={19} />
          <strong>{s.questions.filter((q) => q.status === 'COMPLETED').length}</strong> completed
        </span>
        <p>Questions run in numbered order.</p>
      </div>
      <div className="round-stack">
        {s.rounds.map((r, i) => (
          <div className="card round-card" key={r.id}>
            <div className="card-toolbar">
              <div className="round-title">
                <span className="round-number">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{r.name}</h3>
                  <p>
                    {s.questions.filter((q) => q.round_id === r.id).length} questions ·{' '}
                    {r.uses_subrounds ? 'With subrounds' : 'Classic round'}
                  </p>
                </div>
              </div>
              <div className="flex-row">
                <button
                  className="icon-button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() =>
                    setEditor({
                      entity: 'rounds',
                      id: r.id,
                      title: 'Round settings',
                      name: r.name,
                      values: r,
                    })
                  }
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    setEditor(
                      r.uses_subrounds
                        ? { entity: 'subrounds', round_id: r.id, title: 'Add a subround' }
                        : { entity: 'questions', round_id: r.id, title: 'Add questions' },
                    )
                  }
                >
                  <Plus size={16} />
                  {r.uses_subrounds ? 'Subround' : 'Questions'}
                </button>
              </div>
            </div>
            {r.uses_subrounds ? (
              s.subrounds
                .filter((sr) => sr.round_id === r.id)
                .map((sr) => (
                  <div className="subround" key={sr.id}>
                    <div className="flex-row">
                      <h4>{sr.name}</h4>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${sr.name}`}
                        onClick={() =>
                          setEditor({
                            entity: 'subrounds',
                            id: sr.id,
                            round_id: r.id,
                            title: 'Subround settings',
                            name: sr.name,
                            values: sr,
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="button small"
                        onClick={() =>
                          setEditor({
                            entity: 'questions',
                            round_id: r.id,
                            subround_id: sr.id,
                            title: 'Add questions',
                          })
                        }
                      >
                        <Plus size={14} />
                        Questions
                      </button>
                    </div>
                    <QuestionTiles
                      questions={s.questions.filter((q) => q.subround_id === sr.id)}
                      onSelect={(q) =>
                        setEditor({
                          entity: 'questions',
                          id: q.id,
                          title: `Question ${q.question_number}`,
                          values: q,
                        })
                      }
                    />
                  </div>
                ))
            ) : (
              <QuestionTiles
                questions={s.questions.filter((q) => q.round_id === r.id)}
                onSelect={(q) =>
                  setEditor({
                    entity: 'questions',
                    id: q.id,
                    title: `Question ${q.question_number}`,
                    values: q,
                  })
                }
              />
            )}
          </div>
        ))}
      </div>
      {!s.rounds.length && (
        <div className="card">
          <Empty icon={<ListOrdered />} title="Every great quiz starts with round one">
            Add your first round, then give it a few questions.
          </Empty>
        </div>
      )}
      <div className="info-note">
        <Settings2 size={18} />
        <p>
          Scoring flows from quiz defaults to round, subround, then question. Leave an override
          blank to inherit the previous level.
        </p>
      </div>
      {editor && (
        <StructureEditor editor={editor} client={client} onClose={() => setEditor(null)} />
      )}
    </>
  );
}
function QuestionTiles({
  questions,
  onSelect,
}: {
  questions: Question[];
  onSelect: (q: Question) => void;
}) {
  return (
    <div className="question-tiles">
      {questions.map((q) => (
        <button
          className={`question-tile ${q.status.toLowerCase()}`}
          key={q.id}
          onClick={() => onSelect(q)}
        >
          <span>QUESTION</span>
          <strong>{String(q.question_number).padStart(2, '0')}</strong>
          <small>{q.status === 'PENDING' ? 'Ready to play' : q.status.toLowerCase()}</small>
        </button>
      ))}
      {!questions.length && <p className="muted">Add questions to this round to get started.</p>}
    </div>
  );
}
function StructureEditor({
  editor: e,
  client,
  onClose,
}: {
  editor: Editor;
  client: QuizClient;
  onClose: () => void;
}) {
  const [name, setName] = useState(e.name || ''),
    [count, setCount] = useState(6),
    [uses, setUses] = useState(false),
    [values, setValues] = useState<Record<string, string>>({
      positive_score: e.values?.positive_score?.toString() || '',
      negative_score: e.values?.negative_score?.toString() || '',
      zero_score: e.values?.zero_score?.toString() || '',
    });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      ...(e.id ? { id: e.id } : {}),
      ...(e.round_id ? { round_id: e.round_id } : {}),
      ...(e.subround_id ? { subround_id: e.subround_id } : {}),
    };
    if (e.entity === 'questions' && !e.id) payload.count = count;
    else {
      Object.assign(
        payload,
        Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, v === '' ? null : Number(v)]),
        ),
      );
      if (e.entity !== 'questions') payload.name = name;
      if (e.entity === 'rounds' && !e.id) payload.uses_subrounds = uses;
    }
    try {
      await client.action(`quiz/${e.entity}`, payload);
      onClose();
    } catch {}
  }
  return (
    <Modal title={e.title} onClose={onClose}>
      <form onSubmit={submit}>
        {e.entity !== 'questions' && (
          <label>
            Name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(v) => setName(v.target.value)}
              placeholder="A great name for a great round"
            />
          </label>
        )}
        {e.entity === 'rounds' && !e.id && (
          <label className="check-label">
            <input type="checkbox" checked={uses} onChange={(v) => setUses(v.target.checked)} />
            Organize this round into subrounds
          </label>
        )}
        {e.entity === 'questions' && !e.id ? (
          <label>
            Number of questions
            <input
              type="number"
              min={1}
              max={100}
              required
              value={count}
              onChange={(v) => setCount(Number(v.target.value))}
            />
          </label>
        ) : (
          <>
            <p className="muted">Optional scoring overrides. Blank values inherit.</p>
            <div className="form-grid">
              {Object.entries(values).map(([key, value]) => (
                <label key={key}>
                  {key === 'positive_score'
                    ? 'Correct'
                    : key === 'negative_score'
                      ? 'Incorrect'
                      : 'No answer'}
                  <input
                    type="number"
                    step="0.01"
                    value={value}
                    placeholder="Inherit"
                    onChange={(v) => setValues({ ...values, [key]: v.target.value })}
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          {e.id && (
            <button
              type="button"
              className="button quiet danger-text"
              onClick={async () => {
                try {
                  await client.action(`quiz/${e.entity}`, { id: e.id, operation: 'delete' });
                  onClose();
                } catch {}
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          )}
          <button className="button primary" disabled={client.busy}>
            Save changes
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function resolveScore(s: Snapshot, q: Question): ScoreRule {
  const r = s.rounds.find((r) => r.id === q.round_id),
    sr = s.subrounds.find((sr) => sr.id === q.subround_id);
  return {
    positive_score:
      q.positive_score ??
      sr?.positive_score ??
      r?.positive_score ??
      s.settings?.default_positive_score ??
      10,
    negative_score:
      q.negative_score ??
      sr?.negative_score ??
      r?.negative_score ??
      s.settings?.default_negative_score ??
      -5,
    zero_score:
      q.zero_score ?? sr?.zero_score ?? r?.zero_score ?? s.settings?.default_zero_score ?? null,
  };
}
export function ScoringView({ client }: { client: QuizClient }) {
  const s = client.state!,
    [selected, setSelected] = useState(''),
    [custom, setCustom] = useState<Participant | null>(null),
    [value, setValue] = useState(''),
    [reason, setReason] = useState('');
  const eligible = s.questions.filter((q) => q.status === 'ACTIVE' || q.status === 'COMPLETED'),
    q =
      eligible.find((q) => q.id === selected) ||
      eligible.find((q) => q.id === s.live.current_question_id) ||
      eligible.at(-1),
    rules = q ? resolveScore(s, q) : null;
  async function score(p: Participant, value: number, reason = 'Score entry') {
    if (!q) return;
    const old = s.scores.find((sc) => sc.question_id === q.id && sc.participant_id === p.id);
    await client.action('scores', {
      question_id: q.id,
      participant_id: p.id,
      value,
      reason,
      expected_revision: old?.revision || 0,
    });
  }
  return (
    <>
      <SectionHeading
        eyebrow="GIVE CREDIT WHERE IT’S DUE"
        title="Every point counts."
        description="Award, adjust, and keep a clear record of every score."
        action={
          <select
            aria-label="Question to score"
            value={q?.id || ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              Select question
            </option>
            {eligible.map((q) => (
              <option key={q.id} value={q.id}>
                Question {q.question_number} · {q.status.toLowerCase()}
              </option>
            ))}
          </select>
        }
      />
      {!q ? (
        <div className="card">
          <Empty icon={<Flag />} title="Let the first question begin">
            Scores can be entered as soon as a question has started.
          </Empty>
        </div>
      ) : (
        <>
          <div className="scoring-banner">
            <div>
              <span className="eyebrow">QUESTION {String(q.question_number).padStart(2, '0')}</span>
              <h3>{s.rounds.find((r) => r.id === q.round_id)?.name}</h3>
            </div>
            <span className="score-rule correct">
              Correct <b>{points(rules!.positive_score!)}</b>
            </span>
            <span className="score-rule wrong">
              Incorrect <b>{points(rules!.negative_score!)}</b>
            </span>
            {rules!.zero_score !== null && (
              <span className="score-rule">
                No answer <b>{rules!.zero_score}</b>
              </span>
            )}
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PARTICIPANT</th>
                    <th>BUZZ POSITION</th>
                    <th>AWARD POINTS</th>
                    <th>QUESTION SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {s.participants.map((p, i) => {
                    const saved = s.scores.find(
                        (sc) => sc.question_id === q.id && sc.participant_id === p.id,
                      ),
                      buzz = s.buzzes.find((b) => b.participant_id === p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="name-cell">
                            <Avatar name={p.display_name} index={i} />
                            <strong>{p.display_name}</strong>
                          </div>
                        </td>
                        <td>{q.id === s.question?.id && buzz ? `#${buzz.official_rank}` : '—'}</td>
                        <td>
                          <div className="score-buttons">
                            <button
                              className="score-btn positive"
                              disabled={client.busy}
                              onClick={() => safe(score(p, rules!.positive_score!))}
                            >
                              {points(rules!.positive_score!)}
                            </button>
                            <button
                              className="score-btn negative"
                              disabled={client.busy}
                              onClick={() => safe(score(p, rules!.negative_score!))}
                            >
                              {points(rules!.negative_score!)}
                            </button>
                            {rules!.zero_score !== null && (
                              <button
                                className="score-btn"
                                disabled={client.busy}
                                onClick={() => safe(score(p, rules!.zero_score!))}
                              >
                                {rules!.zero_score}
                              </button>
                            )}
                            <button
                              className="score-btn"
                              aria-label={`Custom score for ${p.display_name}`}
                              onClick={() => {
                                setCustom(p);
                                setValue(saved?.value.toString() || '');
                                setReason('');
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        </td>
                        <td>
                          <strong className={saved && saved.value > 0 ? 'positive-text' : ''}>
                            {saved ? points(saved.value) : '—'}
                          </strong>
                          {saved && (
                            <small className="saved-label">
                              <Check size={11} /> Saved
                            </small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {custom && (
        <Modal title={`Score for ${custom.display_name}`} onClose={() => setCustom(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await score(custom, Number(value), reason || 'Custom score');
                setCustom(null);
              } catch {}
            }}
          >
            <label>
              Points
              <input
                autoFocus
                type="number"
                step="0.01"
                min={-999999.99}
                max={999999.99}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </label>
            <label>
              Reason for this score
              <input
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional note for the history"
              />
            </label>
            <button className="button primary full" disabled={client.busy}>
              Save score
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function LeaderboardView({ client }: { client: QuizClient }) {
  const s = client.state!,
    qm = s.member.role === 'QUIZMASTER',
    [trigger, setTrigger] = useState('EVENT'),
    [target, setTarget] = useState('');
  return (
    <>
      <SectionHeading
        eyebrow="THE BIG PICTURE"
        title="A little healthy competition."
        description="Live totals, shared ranks, and a reveal when the moment is right."
        action={
          qm && (
            <button
              className="button primary"
              disabled={client.busy}
              onClick={() =>
                safe(
                  client.command(
                    s.live.leaderboard_visible ? 'HIDE_LEADERBOARD' : 'REVEAL_LEADERBOARD',
                  ),
                )
              }
            >
              {s.live.leaderboard_visible ? <EyeOff size={17} /> : <Eye size={17} />}{' '}
              {s.live.leaderboard_visible ? 'Hide from participants' : 'Reveal leaderboard'}
            </button>
          )
        }
      />
      <div className="leaderboard-layout">
        <div className="card">
          <div className="card-toolbar">
            <h3>The standings</h3>
            <Badge tone={s.live.leaderboard_visible ? 'green' : 'neutral'}>
              {s.live.leaderboard_visible ? 'Visible to everyone' : 'Staff only'}
            </Badge>
          </div>
          <Leaderboard state={s} />
        </div>
        {qm && (
          <div className="card reveal-rules">
            <span className="eyebrow">MAKE AN ENTRANCE</span>
            <h3>Automatic reveals</h3>
            <p className="muted">Choose the milestones that deserve a big reveal.</p>
            {s.rules.map((r) => (
              <div className="rule-row" key={r.id}>
                <Flag size={16} />
                <span>
                  {r.trigger === 'EVENT'
                    ? 'When the quiz finishes'
                    : r.trigger === 'ROUND'
                      ? `After ${s.rounds.find((rd) => rd.id === r.target_id)?.name}`
                      : `After question ${s.questions.find((q) => q.id === r.target_id)?.question_number}`}
                </span>
                <button
                  className="icon-button"
                  aria-label="Remove reveal rule"
                  onClick={() =>
                    safe(client.action('quiz/rules', { id: r.id, operation: 'delete' }))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                safe(
                  client.action('quiz/rules', {
                    trigger,
                    target_id: trigger === 'EVENT' ? null : target,
                  }),
                );
              }}
            >
              <label>
                Reveal when
                <select
                  value={trigger}
                  onChange={(e) => {
                    setTrigger(e.target.value);
                    setTarget('');
                  }}
                >
                  <option value="EVENT">Quiz finishes</option>
                  <option value="ROUND">Round completes</option>
                  <option value="QUESTION">Question completes</option>
                </select>
              </label>
              {trigger !== 'EVENT' && (
                <label>
                  {trigger === 'ROUND' ? 'Round' : 'Question'}
                  <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Choose one</option>
                    {(trigger === 'ROUND'
                      ? s.rounds.map((r) => ({ id: r.id, label: r.name }))
                      : s.questions.map((q) => ({
                          id: q.id,
                          label: `Question ${q.question_number}`,
                        }))
                    ).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button full" disabled={client.busy}>
                <Plus size={16} />
                Add reveal rule
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

export function HistoryView({ state: s }: { state: Snapshot }) {
  return (
    <>
      <SectionHeading
        eyebrow="NOTHING LOST ALONG THE WAY"
        title="The story so far."
        description="Every buzz, every point, every decision. All in one place."
      />
      <div className="card">
        <div className="card-toolbar">
          <h3>Activity log</h3>
          <span className="muted">Latest 100 events</span>
        </div>
        <div className="activity-list">
          {s.history.map((h) => (
            <div className="activity-row" key={h.id}>
              <span className="activity-symbol">
                <History size={17} />
              </span>
              <div>
                <strong>{h.action.toLowerCase().replaceAll('_', ' ')}</strong>
                <p>
                  {h.actor}
                  {h.details.value !== undefined && ` · ${points(Number(h.details.value))} points`}
                  {h.details.reason ? ` · ${h.details.reason}` : ''}
                  {h.details.rank ? ` · Position #${h.details.rank}` : ''}
                </p>
              </div>
              <time>
                {new Date(h.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </div>
          ))}
        </div>
        {!s.history.length && (
          <Empty icon={<History />} title="A fresh start">
            Your quiz history will appear here.
          </Empty>
        )}
      </div>
    </>
  );
}

export function AccessView({ client }: { client: QuizClient }) {
  const s = client.state!;
  return (
    <>
      <SectionHeading
        eyebrow="BRING EVERYONE TOGETHER"
        title="Good company. Great quiz."
        description="Give your crew the right access, and keep the show running smoothly."
      />
      <div className="access-grid">
        {s.access.map((a) => {
          const rolePath =
              a.kind === 'PARTICIPANT'
                ? '/join'
                : a.kind === 'SCOREKEEPER'
                  ? '/scorekeeper'
                  : '/audience',
            link = `${typeof location === 'undefined' ? '' : location.origin}${rolePath}?code=${a.code}`;
          return (
            <div className="card access-card" key={a.kind}>
              <span className={`access-icon ${a.kind.toLowerCase()}`}>
                {a.kind === 'PARTICIPANT' ? (
                  <Users />
                ) : a.kind === 'SCOREKEEPER' ? (
                  <Pencil />
                ) : (
                  <Eye />
                )}
              </span>
              <h3>
                {a.kind === 'PARTICIPANT'
                  ? 'Open join'
                  : a.kind === 'SCOREKEEPER'
                    ? 'Score keeper'
                    : 'Audience display'}
              </h3>
              <p>
                {a.kind === 'PARTICIPANT'
                  ? 'Works when open join is enabled in settings.'
                  : a.kind === 'SCOREKEEPER'
                    ? 'A helping hand with points. No quiz controls.'
                    : 'A front-row view, made for the big screen.'}
              </p>
              <div className="access-qr">
                <QRCodeSVG value={link} size={112} fgColor="#26382d" />
              </div>
              <div className="big-code">
                {a.code}
                <CopyButton value={link} />
              </div>
              <Badge tone={a.active ? 'green' : 'neutral'}>
                {a.active ? 'Access enabled' : 'Access disabled'}
              </Badge>
              <div className="access-actions">
                <button
                  className="button small"
                  onClick={() =>
                    safe(client.action('quiz/access', { kind: a.kind, operation: 'rotate' }))
                  }
                >
                  <RefreshCw size={14} />
                  New code
                </button>
                <button
                  className="button small quiet"
                  onClick={() =>
                    safe(client.action('quiz/access', { kind: a.kind, active: !a.active }))
                  }
                >
                  {a.active ? 'Disable' : 'Enable'}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-button"
                  aria-label={`Open ${a.kind.toLowerCase()}`}
                >
                  <ArrowRight size={17} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <div className="card-toolbar">
          <h3>Workspace access</h3>
          <Shield size={19} />
        </div>
        {s.members
          .filter((m) => m.role !== 'PARTICIPANT' && !m.revoked_at)
          .map((m, i) => (
            <div className="member-row" key={m.id}>
              <Avatar name={m.display_name} index={i} />
              <div>
                <strong>{m.display_name}</strong>
                <p>{m.role.toLowerCase()}</p>
              </div>
              {m.id === s.member.id ? (
                <Badge>You</Badge>
              ) : (
                <button
                  className="button small"
                  onClick={() => safe(client.action('quiz/members', { id: m.id }))}
                >
                  Revoke access
                </button>
              )}
            </div>
          ))}
      </div>
    </>
  );
}

export function SettingsView({ client }: { client: QuizClient }) {
  const s = client.state!,
    [values, setValues] = useState<Settings>({ ...s.settings! }),
    [saved, setSaved] = useState(false);
  const field = (key: keyof Settings, value: unknown) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  };
  return (
    <>
      <SectionHeading
        eyebrow="YOUR QUIZ, YOUR RULES"
        title="Fine-tune the fun."
        description="Set the pace, the points, and what everyone gets to see."
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { quiz_id, ...clean } = values as Settings & { quiz_id?: string };
            await client.action('quiz/settings', clean);
            setSaved(true);
          } catch {}
        }}
      >
        <div className="settings-grid">
          <div className="card settings-card">
            <div className="setting-title">
              <Users size={21} />
              <h3>Joining the quiz</h3>
            </div>
            <label>
              Join mode
              <select
                value={values.participant_mode}
                onChange={(e) => field('participant_mode', e.target.value)}
              >
                <option value="PRE_REGISTERED">Individual codes (recommended)</option>
                <option value="OPEN">Open join with device-change approval</option>
              </select>
            </label>
            <label>
              Identifier label
              <input
                value={values.identifier_style}
                maxLength={100}
                onChange={(e) => field('identifier_style', e.target.value)}
                required
              />
            </label>
            <label>
              Maximum participants
              <input
                type="number"
                value={values.max_participants}
                min={s.participants.length || 1}
                max={50}
                required
                onChange={(e) => field('max_participants', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="card settings-card">
            <div className="setting-title">
              <Settings2 size={21} />
              <h3>Buzzer & timer</h3>
            </div>
            {(
              [
                { key: 'max_buzzes_per_question', label: 'Maximum recorded buzzes', max: 50 },
                { key: 'auto_lock_after', label: 'Auto-lock after buzzes (blank = off)', max: 50 },
              ] as const
            ).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  min={1}
                  max={f.max}
                  value={values[f.key] ?? ''}
                  onChange={(e) =>
                    field(f.key, e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </label>
            ))}
            <label>
              Default timer (seconds, blank = off)
              <input
                type="number"
                min={1}
                max={3600}
                value={values.default_timer_ms === null ? '' : values.default_timer_ms / 1000}
                onChange={(e) =>
                  field(
                    'default_timer_ms',
                    e.target.value === '' ? null : Number(e.target.value) * 1000,
                  )
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={values.lock_on_timer_end}
                onChange={(e) => field('lock_on_timer_end', e.target.checked)}
              />
              Lock when the timer runs out
            </label>
          </div>
          <div className="card settings-card">
            <div className="setting-title">
              <Trophy size={21} />
              <h3>Default points</h3>
            </div>
            {(
              [
                { key: 'default_positive_score', label: 'Correct answer' },
                { key: 'default_negative_score', label: 'Incorrect answer' },
                { key: 'default_zero_score', label: 'No answer (blank = no quick button)' },
              ] as const
            ).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  step="0.01"
                  required={f.key !== 'default_zero_score'}
                  value={values[f.key] ?? ''}
                  onChange={(e) =>
                    field(f.key, e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </label>
            ))}
            <p className="muted small-text">
              Changing rules never changes previously awarded scores.
            </p>
          </div>
          <div className="card settings-card">
            <div className="setting-title">
              <Eye size={21} />
              <h3>What everyone sees</h3>
            </div>
            <label>
              Public buzz positions
              <input
                type="number"
                min={0}
                max={50}
                required
                value={values.default_display_limit}
                onChange={(e) => field('default_display_limit', Number(e.target.value))}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={values.show_own_position}
                onChange={(e) => field('show_own_position', e.target.checked)}
              />
              Show participants their own position
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={values.audience_enabled}
                onChange={(e) => field('audience_enabled', e.target.checked)}
              />
              Enable the audience screen
            </label>
            <div className="info-note">
              Buzzer changes apply to the next question. Display preferences apply immediately.
            </div>
          </div>
        </div>
        <div className="save-bar">
          <span>
            {saved ? (
              <>
                <Check size={17} /> Settings saved
              </>
            ) : (
              'Make it work your way.'
            )}
          </span>
          <button className="button primary" disabled={client.busy}>
            Save settings
            <Check size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
