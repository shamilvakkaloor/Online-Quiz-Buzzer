export type Role = 'QUIZMASTER' | 'PARTICIPANT' | 'SCOREKEEPER' | 'AUDIENCE' | 'ADMIN';
export type ScoreRule = {
  positive_score: number | null;
  negative_score: number | null;
  zero_score: number | null;
};
export type Question = ScoreRule & {
  id: string;
  round_id: string;
  subround_id: string | null;
  question_number: number;
  sequence: number;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
};
export type Round = ScoreRule & {
  id: string;
  name: string;
  sequence: number;
  uses_subrounds: boolean;
};
export type Subround = ScoreRule & { id: string; round_id: string; name: string; sequence: number };
export type Participant = {
  id: string;
  display_name: string;
  identifier: string;
  type: 'TEAM' | 'PERSON';
  join_code?: string;
  joined: boolean;
  last_seen_at?: string;
};
export type Buzz = {
  participant_id: string;
  display_name: string;
  official_rank: number;
  server_received_at: string;
};
export type Leader = { participant_id: string; display_name: string; total: number; rank: number };
export type Member = {
  id: string;
  role: Role;
  display_name: string;
  participant_id: string | null;
  last_seen_at?: string;
  revoked_at?: string | null;
};
export type Settings = {
  max_participants: number;
  max_buzzes_per_question: number;
  default_display_limit: number;
  show_own_position: boolean;
  default_positive_score: number;
  default_negative_score: number;
  default_zero_score: number | null;
  participant_mode: 'OPEN' | 'PRE_REGISTERED';
  identifier_style: string;
  auto_lock_after: number | null;
  lock_on_timer_end: boolean;
  default_timer_ms: number | null;
  audience_enabled: boolean;
  auto_start_timer: boolean;
};
export type Snapshot = {
  quiz: { id: string; title: string; quiz_code: string; created_at: string };
  member: Member;
  version: number;
  server_time: string;
  live: {
    status: 'SETUP' | 'READY' | 'LIVE' | 'COMPLETED';
    current_question_id: string | null;
    current_buzzer_session_id: string | null;
    is_paused: boolean;
    display_limit: number;
    show_own_position: boolean;
    leaderboard_visible: boolean;
    timer_started_at: string | null;
    timer_duration_ms: number | null;
    timer_remaining_ms: number | null;
    version: number;
  };
  session: {
    id: string;
    status: 'OPEN' | 'LOCKED' | 'COMPLETED';
    lock_reason: string | null;
    record_limit: number;
  } | null;
  question: Question | null;
  round: Round | null;
  subround: Subround | null;
  buzzes: Buzz[];
  buzz_count: number;
  own_buzz: { accepted: boolean; official_rank: number | null } | null;
  leaderboard: Leader[];
  participants: Participant[];
  questions: Question[];
  rounds: Round[];
  subrounds: Subround[];
  settings: Settings | null;
  scoring: ScoreRule | null;
  scores: {
    id: string;
    question_id: string;
    participant_id: string;
    value: number;
    revision: number;
  }[];
  history: {
    id: string;
    action: string;
    actor: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
  members: Member[];
  access: { kind: string; code: string; active: boolean }[];
  takeovers: { id: string; display_name: string; participant_id: string; created_at: string }[];
  rules: { id: string; trigger: string; target_id: string | null }[];
};
