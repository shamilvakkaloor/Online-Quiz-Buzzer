'use client';
import { useEffect, useRef, useState } from 'react';
import { Radio, X, LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import type { Snapshot } from '@/types/quiz';
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Buzzer home">
      <span className="brand-mark">
        <Radio size={23} strokeWidth={2.5} />
      </span>
      buzzer<span className="brand-period">.</span>
    </a>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={18} />;
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 6}`}>
      {name
        .split(/\s+/)
        .filter((s) => s !== 'The')
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function useTimer(state: Snapshot, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, []);
  const live = state.live;
  const remaining = live.timer_started_at
    ? Math.max(
        0,
        new Date(live.timer_started_at).getTime() + (live.timer_duration_ms || 0) - (now + offset),
      )
    : (live.timer_remaining_ms ?? live.timer_duration_ms ?? 0);
  const seconds = Math.ceil(remaining / 1000);
  return {
    text: `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`,
    remaining,
    seconds,
  };
}
export function SoundButton({
  count,
  state,
  offset = 0,
}: {
  count: number;
  state?: Snapshot;
  offset?: number;
}) {
  const [enabled, setEnabled] = useState(false),
    context = useRef<AudioContext | null>(null);
  const previous = useRef<Snapshot | undefined>(state),
    previousCount = useRef(count),
    tick = useRef('');
  function tone(frequency = 740, duration = 0.14, delay = 0) {
    const ctx = context.current;
    if (!ctx || ctx.state !== 'running') return;
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      at = ctx.currentTime + delay;
    o.type = 'sine';
    o.frequency.setValueAtTime(frequency, at);
    g.gain.setValueAtTime(0.06, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + duration);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(at);
    o.stop(at + duration);
  }
  useEffect(() => {
    const old = previous.current;
    if (enabled) {
      if (count > previousCount.current) tone(880, 0.2);
      if (state && old) {
        if (state.session?.id !== old.session?.id) {
          tone(660);
          tone(990, 0.2, 0.16);
        }
        if (state.live.is_paused !== old.live.is_paused)
          tone(state.live.is_paused ? 330 : 660, 0.22);
        if (state.session?.status === 'LOCKED' && old.session?.status === 'OPEN') tone(220, 0.3);
        if (state.live.status === 'COMPLETED' && old.live.status !== 'COMPLETED') {
          [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, i * 0.16));
        } else if (state.live.leaderboard_visible && !old.live.leaderboard_visible) {
          tone(784, 0.2);
          tone(1046, 0.3, 0.18);
        }
      }
    }
    previous.current = state;
    previousCount.current = count;
  }, [state, count, enabled]);
  useEffect(() => {
    if (
      !enabled ||
      !state?.live.timer_started_at ||
      state.live.is_paused ||
      state.question?.status !== 'ACTIVE'
    )
      return;
    const check = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (new Date(state.live.timer_started_at!).getTime() +
            (state.live.timer_duration_ms || 0) -
            Date.now() -
            offset) /
            1000,
        ),
      );
      const key = state.live.timer_started_at + ':' + remaining;
      if (key === tick.current) return;
      tick.current = key;
      if (remaining <= 10)
        tone(remaining === 0 ? 180 : remaining <= 3 ? 1046 : 660, remaining === 0 ? 0.7 : 0.09);
    };
    check();
    const id = setInterval(check, 100);
    return () => clearInterval(id);
  }, [
    enabled,
    state?.live.timer_started_at,
    state?.live.timer_duration_ms,
    state?.live.is_paused,
    state?.question?.status,
    offset,
  ]);
  useEffect(() => {
    if (!enabled) return;
    const click = (e: MouseEvent) => {
      if ((e.target as Element).closest('button:not(:disabled),a')) tone(460, 0.035);
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [enabled]);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  return (
    <button
      className={`button quiet ${enabled ? 'sound-on' : ''}`}
      aria-label={enabled ? 'Disable sound' : 'Enable sound'}
      aria-pressed={enabled}
      onClick={() => {
        context.current ??= new AudioContext();
        void context.current.resume().then(() => {
          if (!enabled) tone();
        });
        setEnabled(!enabled);
      }}
    >
      {enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
      <span>{enabled ? 'Sound on' : 'Enable sound'}</span>
    </button>
  );
}
