'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Radio,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { Role } from '@/types/quiz';
import { useQuiz } from '@/lib/use-quiz';
import { Avatar, Badge, Brand, Modal, Spinner } from './ui';
import { JoinScreen } from './join-screen';
import { AdminScreen } from './admin-screen';
import { PlayerScreen } from './player-screen';
import { LiveControl } from './live-control';
import {
  AccessView,
  HistoryView,
  LeaderboardView,
  ParticipantsView,
  QuestionsView,
  ScoringView,
  SettingsView,
} from './workspace-views';
const tabs = [
  { id: 'control', label: 'Live control', icon: Radio },
  { id: 'questions', label: 'Quiz setup', icon: ClipboardList },
  { id: 'participants', label: 'Participants', icon: Users },
  { id: 'scoring', label: 'Scoring', icon: SlidersHorizontal },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'access', label: 'Access & screens', icon: Monitor },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];
export function QuizApp({ role }: { role: Role }) {
  const client = useQuiz(role),
    [tab, setTab] = useState(role === 'SCOREKEEPER' ? 'scoring' : 'control'),
    [mobile, setMobile] = useState(false),
    [help, setHelp] = useState(false);
  if (client.loading)
    return (
      <div className="loading-page">
        <Brand />
        <Spinner />
        <p>Getting your workspace ready…</p>
      </div>
    );
  if (client.fatal)
    return (
      <div className="loading-page">
        <Brand />
        <div className="card session-ended">
          <ShieldCheck size={35} />
          <h1>Your session has ended.</h1>
          <p>{client.error}</p>
          <button className="button primary" onClick={() => void client.logout()}>
            Return to sign in
          </button>
        </div>
      </div>
    );
  if (!client.session) return <JoinScreen client={client} role={role} />;
  if (role === 'ADMIN') return <AdminScreen client={client} />;
  if (!client.state)
    return (
      <div className="loading-page">
        <Brand />
        <Spinner />
        <p>Connecting to your quiz…</p>
        {client.error && <p className="form-error">{client.error}</p>}
        <button className="button quiet" onClick={() => void client.logout()}>
          Back to sign in
        </button>
      </div>
    );
  if (role === 'PARTICIPANT' || role === 'AUDIENCE')
    return <PlayerScreen client={client} audience={role === 'AUDIENCE'} />;
  const s = client.state,
    nav =
      role === 'SCOREKEEPER'
        ? tabs.filter((t) => ['scoring', 'leaderboard', 'history'].includes(t.id))
        : tabs;
  function navigate(next: string) {
    setTab(next);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const audience = s.access.find((a) => a.kind === 'AUDIENCE');
  return (
    <div className="workspace">
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Brand />
        <div className="sidebar-workspace">
          <span className="workspace-emoji">✳</span>
          <div>
            <strong>{s.quiz.title}</strong>
            <small>{client.config?.demo ? 'Practice workspace' : 'Quiz workspace'}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map((t, i) => (
            <button
              className={`nav-item ${tab === t.id ? 'active' : ''} ${i === 5 ? 'nav-separator' : ''}`}
              key={t.id}
              onClick={() => navigate(t.id)}
            >
              <t.icon size={18} />
              <span>{t.label}</span>
              {t.id === 'participants' && (
                <span className="nav-count">{s.participants.length}</span>
              )}
              {t.id === 'control' && s.live.status === 'LIVE' && <i className="live-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>HERE’S TO THE</span>
            <strong>
              “I knew that!”
              <br />
              moments.
            </strong>
            <Sparkles size={20} />
          </div>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />A little help
          </button>
          <div className="sidebar-user">
            <Avatar name={s.member.display_name} />
            <div>
              <strong>{s.member.display_name}</strong>
              <small>{role === 'SCOREKEEPER' ? 'Score keeper' : 'Quizmaster'}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => void client.logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{s.quiz.title}</strong>
            <Badge tone={s.live.status === 'LIVE' ? 'green' : 'neutral'}>
              {s.live.status === 'LIVE'
                ? 'Live'
                : s.live.status === 'COMPLETED'
                  ? 'Completed'
                  : 'Ready'}
            </Badge>
          </div>
          <div className="header-actions">
            <span className={`connection ${client.connected ? '' : 'offline'}`}>
              <i />
              {client.connected
                ? client.config?.demo
                  ? 'Practice mode'
                  : 'Connected'
                : 'Reconnecting'}
            </span>
            <a
              className="button small"
              target="_blank"
              rel="noreferrer"
              href={`/audience${audience ? `?code=${audience.code}` : ''}`}
            >
              <Monitor size={15} />
              <span>Audience view</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main className="workspace-content">
          {client.error && (
            <div className="toast-error" role="alert">
              <span>{client.error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => client.setError('')}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {tab === 'control' && <LiveControl client={client} navigate={navigate} />}{' '}
          {tab === 'questions' && <QuestionsView client={client} />}{' '}
          {tab === 'participants' && <ParticipantsView client={client} />}{' '}
          {tab === 'scoring' && <ScoringView client={client} />}{' '}
          {tab === 'leaderboard' && <LeaderboardView client={client} />}{' '}
          {tab === 'access' && <AccessView client={client} />}{' '}
          {tab === 'history' && <HistoryView state={s} />}{' '}
          {tab === 'settings' && <SettingsView client={client} />}
          <footer className="workspace-footer">
            <span>
              <Zap size={13} />
              Made for the moments between question and answer.
            </span>
            <span>
              buzzer. <span className="footer-dot">·</span> Let the good times buzz.
            </span>
          </footer>
        </main>
      </div>
      {help && (
        <Modal title="A good quiz, in a few steps." onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>
              <strong>Set the stage.</strong> Add rounds, questions, and scoring rules in Quiz
              setup.
            </li>
            <li>
              <strong>Bring your teams.</strong> Create participants and share their individual
              codes or QR links.
            </li>
            <li>
              <strong>Open the floor.</strong> Start the quiz, then start a question. Buzzers open
              automatically.
            </li>
            <li>
              <strong>Keep the pace.</strong> Lock to hear answers, enter scores, complete the
              question, and move on.
            </li>
            <li>
              <strong>Give them the big reveal.</strong> Show the leaderboard whenever the moment
              feels right.
            </li>
          </ol>
          <p className="muted">
            Buzzer positions follow the server’s processing order. Reopening a question keeps
            existing positions.
          </p>
          <div className="flex-row">
            <a href="/join" target="_blank" className="button">
              Participant view
              <ArrowUpRight size={15} />
            </a>
            <a href="/admin" className="button quiet">
              Owner workspace
              <ArrowUpRight size={15} />
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
