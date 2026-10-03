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
export function SoundButton({ count }: { count: number }) {
  const [enabled, setEnabled] = useState(false),
    context = useRef<AudioContext | null>(null),
    previous = useRef(count);
  function beep() {
    const ctx = context.current;
    if (!ctx) return;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.25);
  }
  useEffect(() => {
    if (enabled && count > previous.current) beep();
    previous.current = count;
  }, [count, enabled]);
  return (
    <button
      className={`button quiet ${enabled ? 'sound-on' : ''}`}
      aria-label={enabled ? 'Disable sound' : 'Enable sound'}
      onClick={() => {
        context.current ??= new AudioContext();
        void context.current.resume();
        if (!enabled) beep();
        setEnabled(!enabled);
      }}
    >
      {enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
      <span>{enabled ? 'Sound on' : 'Enable sound'}</span>
    </button>
  );
}
