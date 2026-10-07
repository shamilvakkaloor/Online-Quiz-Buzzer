'use client';
import { Trophy } from 'lucide-react';
import type { Snapshot } from '@/types/quiz';
export function QuizFinale({ state }: { state: Snapshot }) {
  if (state.live.status !== 'COMPLETED') return null;
  return (
    <section className="quiz-finale" aria-live="polite">
      <span className="eyebrow">QUIZ ENDED</span>
      <h2>That’s a wrap!</h2>
      <p>Thanks for playing {state.quiz.title}.</p>
      {state.live.leaderboard_visible ? (
        <>
          <Trophy size={42} />
          <h3>Final standings</h3>
          <ol>
            {state.leaderboard.map((p, i) => (
              <li key={p.participant_id} style={{ animationDelay: `${Math.min(i, 10) * 90}ms` }}>
                <b>#{p.rank}</b>
                <strong>{p.display_name}</strong>
                <span>{p.total} pts</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>The quizmaster hasn’t revealed the final standings yet.</p>
      )}
    </section>
  );
}
