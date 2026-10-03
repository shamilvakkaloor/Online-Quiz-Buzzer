'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Clock3,
  KeyRound,
  LogOut,
  Plus,
  Radio,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import type { QuizClient } from '@/lib/use-quiz';
import { Badge, Brand, Empty, Modal, Spinner } from './ui';
import { SectionHeading } from './workspace-views';
type Quiz = {
  id: string;
  title: string;
  quiz_code: string;
  status: string;
  created_at: string;
  participant_count: number;
};
type HistoryData = {
  leaderboard: { rank: number; display_name: string; total: number }[];
  buzzes: unknown[];
  scores: unknown[];
  revisions: unknown[];
  audit: { id: string; action: string; created_at: string }[];
};
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(v: unknown) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
export function AdminScreen({ client }: { client: QuizClient }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]),
    [loading, setLoading] = useState(true),
    [modal, setModal] = useState<'create' | Quiz | null>(null),
    [history, setHistory] = useState<{ quiz: Quiz; data: HistoryData } | null>(null),
    [title, setTitle] = useState(''),
    [code, setCode] = useState(''),
    [password, setPassword] = useState(''),
    [revoke, setRevoke] = useState(false),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setQuizzes(await client.call<Quiz[]>('admin/quizzes'));
    } catch (e) {
      client.setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client.call, client.setError]);
  useEffect(() => {
    void load();
  }, [load]);
  async function exportQuiz(q: Quiz, format: 'csv' | 'json') {
    try {
      const data = await client.call<HistoryData>(`admin/quizzes/${q.id}/history`);
      download(
        `${q.quiz_code}-${format === 'csv' ? 'results.csv' : 'history.json'}`,
        format === 'csv'
          ? '\uFEFF' +
              [
                'Rank,Participant,Total',
                ...data.leaderboard.map((r) =>
                  [r.rank, r.display_name, r.total].map(csv).join(','),
                ),
              ].join('\r\n')
          : JSON.stringify(data, null, 2),
        format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      );
    } catch (e) {
      client.setError((e as Error).message);
    }
  }
  return (
    <div className="admin-page">
      <header className="player-header">
        <Brand />
        <div>
          <Badge>
            <ShieldCheck size={13} />
            Owner workspace
          </Badge>
          <a className="button quiet" href="/quizmaster">
            Quizmaster login
            <ArrowRight size={16} />
          </a>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => void client.logout()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <main>
        <SectionHeading
          eyebrow="THE HOME OF YOUR NEXT GREAT QUIZ"
          title="Good times start here."
          description="Create the quiz, hand over the keys, and keep the memories."
          action={
            <button
              className="button primary"
              onClick={() => {
                setModal('create');
                setTitle('');
                setCode('');
                setPassword('');
              }}
            >
              <Plus size={17} />
              Create quiz
            </button>
          }
        />
        {client.config?.demo && (
          <div className="practice-banner">
            <Radio size={16} />
            You’re in the local practice workspace. Production uses your Supabase owner account.
          </div>
        )}
        {notice && <div className="success-note">{notice}</div>}
        {client.error && (
          <div className="form-error" role="alert">
            {client.error}
          </div>
        )}
        <div className="card">
          <div className="card-toolbar">
            <h3>Your quizzes</h3>
            <span className="muted">{quizzes.length} events</span>
          </div>
          {loading ? (
            <div className="empty">
              <Spinner />
            </div>
          ) : quizzes.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>QUIZ</th>
                    <th>QUIZ ID</th>
                    <th>STATUS</th>
                    <th>PARTICIPANTS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {quizzes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <strong>{q.title}</strong>
                        <small className="block muted">
                          Created {new Date(q.created_at).toLocaleDateString()}
                        </small>
                      </td>
                      <td>
                        <code>{q.quiz_code}</code>
                      </td>
                      <td>
                        <Badge tone={q.status === 'LIVE' ? 'green' : 'neutral'}>
                          {q.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td>{q.participant_count}</td>
                      <td>
                        <div className="flex-row">
                          <button
                            className="icon-button"
                            aria-label={`Export ${q.title} results`}
                            onClick={() => void exportQuiz(q, 'csv')}
                          >
                            <ArrowDownToLine size={17} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Manage ${q.title} credentials`}
                            onClick={() => {
                              setModal(q);
                              setPassword('');
                              setCode(q.quiz_code);
                              setRevoke(false);
                            }}
                          >
                            <KeyRound size={17} />
                          </button>
                          <button
                            className="button small"
                            onClick={async () => {
                              try {
                                setHistory({
                                  quiz: q,
                                  data: await client.call<HistoryData>(
                                    `admin/quizzes/${q.id}/history`,
                                  ),
                                });
                              } catch (e) {
                                client.setError((e as Error).message);
                              }
                            }}
                          >
                            History
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<Trophy />} title="Your first great quiz is waiting">
              Create a quiz and share its ID and password with your quizmaster.
            </Empty>
          )}
        </div>
        <div className="info-note">
          <ShieldCheck size={19} />
          <p>
            You create quizzes and manage credentials. Quizmasters configure and run their own
            events.
          </p>
        </div>
      </main>
      {modal && (
        <Modal
          title={modal === 'create' ? 'Create a new quiz' : 'Manage quiz credentials'}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (modal === 'create') {
                  await client.action('admin/quizzes', { title, quiz_code: code, password });
                  setNotice(
                    `“${title}” is ready. Share quiz ID ${code.toUpperCase()} and the password you chose with your quizmaster.`,
                  );
                } else {
                  await client.action(`admin/quizzes/${modal.id}/credentials`, {
                    quiz_code: code,
                    ...(password ? { password } : {}),
                    revoke_all: revoke,
                  });
                  setNotice('Quiz credentials updated.');
                }
                setModal(null);
                await load();
              } catch {}
            }}
          >
            {modal === 'create' && (
              <label>
                Quiz title
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="The Friday Quiz"
                />
              </label>
            )}
            <label>
              Quiz ID
              <input
                required
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z2-9]+"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FRIDAY"
              />
            </label>
            <label>
              {modal === 'create' ? 'Quizmaster password' : 'New password (leave blank to keep)'}
              <input
                type="password"
                autoComplete="new-password"
                required={modal === 'create'}
                minLength={10}
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </label>
            {modal !== 'create' && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={revoke}
                  onChange={(e) => setRevoke(e.target.checked)}
                />
                Revoke all current member sessions
              </label>
            )}
            <button className="button primary full" disabled={client.busy}>
              {modal === 'create' ? 'Create quiz' : 'Update credentials'}
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title={history.quiz.title} onClose={() => setHistory(null)}>
          <div className="history-summary">
            <span>
              <strong>{history.data.buzzes.length}</strong> buzzes
            </span>
            <span>
              <strong>{history.data.scores.length}</strong> scores
            </span>
            <span>
              <strong>{history.data.revisions.length}</strong> score revisions
            </span>
          </div>
          <div className="flex-row">
            <button className="button" onClick={() => void exportQuiz(history.quiz, 'csv')}>
              <ArrowDownToLine size={16} />
              Results CSV
            </button>
            <button className="button" onClick={() => void exportQuiz(history.quiz, 'json')}>
              Full history JSON
            </button>
          </div>
          <div className="admin-audit">
            {history.data.audit.map((a) => (
              <div className="activity-row" key={a.id}>
                <Clock3 size={15} />
                <strong>{a.action.toLowerCase().replaceAll('_', ' ')}</strong>
                <time>{new Date(a.created_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
