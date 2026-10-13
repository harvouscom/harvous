/**
 * The Takeaway card: "What did you take from {note}?"
 *
 * The one self-rated rung, and deliberately so. What someone took from their own note has no
 * answer key — no index holds it and no model may guess it — so the card asks the reader to bring
 * it to mind first, then opens the real note to check against, and only then offers the three
 * verdicts. Rating before looking would be rating a guess; the verdicts are never on screen until
 * the note has been opened.
 *
 * There is a writing box (Oct 2026, Derek: "what's its purpose without a text box?"). It is the
 * one note-card exception to "writing from memory is for Scripture": writing the takeaway is the
 * act of bringing it to mind. It is never graded, never required (checking is always allowed) and
 * never sent anywhere — the words stay on the card so they sit beside the note when it opens.
 *
 * Not the paper-stack verdict edge that was retired in 582635025 either: the note opens in the
 * real editor, the dock stays where it is, and the verdicts live here, on the card.
 *
 * Layout and its one bit of state (asked → revealed) only. Marking, sound and handover stay in
 * the dock; this calls back with the outcome, which the server records as given
 * (`verdict ?? outcome` in the outcome route).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReviewOutcome } from '@/utils/review-item-kinds';
import { ExerciseStage } from './ExerciseStage';
import {
  REVIEW_ALMOST_COPY,
  REVIEW_RECALLED_COPY,
  REVIEW_REVEALED_ACK_COPY,
  REVIEW_TAKEAWAY_ASK_COPY,
  REVIEW_TAKEAWAY_OPEN_NOTE_COPY,
  REVIEW_TAKEAWAY_PLACEHOLDER,
} from '../proto-review-copy';

/** Least to most, left to right, and each a description of a memory rather than a grade. */
const VERDICTS: readonly { outcome: ReviewOutcome; label: string }[] = [
  { outcome: 'revealed', label: REVIEW_REVEALED_ACK_COPY },
  { outcome: 'almost', label: REVIEW_ALMOST_COPY },
  { outcome: 'recalled', label: REVIEW_RECALLED_COPY },
];

export interface TakeawayCardProps {
  /** The question, as the server wrote it. */
  task: ReactNode;
  /** The line under it, if any. Never the note's opening line — see `reviewRowSubtitle`. */
  subject?: ReactNode;
  /** Warm the note, so opening it does not start on an empty frame. Called once on mount. */
  onPrefetch?: () => void;
  /** Open the reader's note beside the dock. */
  onOpenNote: () => void;
  /** Record how it went. */
  onVerdict: (outcome: ReviewOutcome) => void;
  /** An answer is on its way. */
  disabled?: boolean;
}

export function TakeawayCard({ task, subject, onPrefetch, onOpenNote, onVerdict, disabled = false }: TakeawayCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [written, setWritten] = useState('');
  const prefetch = useRef(onPrefetch);
  prefetch.current = onPrefetch;
  useEffect(() => {
    prefetch.current?.();
  }, []);

  return (
    <ExerciseStage
      task={task}
      subject={subject}
      say={revealed ? null : <p className="proto-caption">{REVIEW_TAKEAWAY_ASK_COPY}</p>}
      actions={
        revealed ? (
          VERDICTS.map((verdict) => (
            <button
              key={verdict.outcome}
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
              disabled={disabled}
              onClick={() => onVerdict(verdict.outcome)}
            >
              {verdict.label}
            </button>
          ))
        ) : (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
            onClick={() => {
              setRevealed(true);
              onOpenNote();
            }}
          >
            {REVIEW_TAKEAWAY_OPEN_NOTE_COPY}
          </button>
        )
      }
    >
      <textarea
        className="proto-review-dock__attempt"
        placeholder={REVIEW_TAKEAWAY_PLACEHOLDER}
        aria-label={REVIEW_TAKEAWAY_PLACEHOLDER}
        value={written}
        onChange={(event) => setWritten(event.target.value)}
        rows={3}
      />
    </ExerciseStage>
  );
}
