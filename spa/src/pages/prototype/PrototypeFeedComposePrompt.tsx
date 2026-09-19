/**
 * "What are you studying today?" — the always-visible way to start a note, on Activity.
 *
 * Feedback (Sept 2026): people could not tell where to write. The getting-started checklist
 * teaches it, but only until it is dismissed or done; after that the one way in was the pencil
 * in the toolbar segment, an icon whose name ("New note in My Home") exists only as a hover
 * tooltip — which a phone never shows. Onboarding runs once; this has to be findable on the
 * tenth visit too, so it sits in the page itself, under the greeting, in words.
 *
 * Shaped like a field because that is what a composer prompt is everywhere else, but it is a
 * button: it opens the editor the same way the toolbar pencil does (`prototypeShortcutNewNote`),
 * so the two land a new note in the same space and there is one compose path, not two.
 *
 * One bounded bit of motion: the line rotates through a few prompts, so it reads as an
 * invitation rather than a label you stop seeing, and a blue gradient runs around the border
 * as each new line arrives — the two are one gesture. One pass per visit, then it rests on the
 * day's first line with no sweep; paused while hovered, focused or in a background tab.
 * Moving text on a reading page is only welcome if it stops. Under reduced motion none of it
 * plays: the day picks one line and it stays.
 */
import { useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';

export const FEED_COMPOSE_PROMPTS = [
  'What are you studying today?',
  'What stood out in your reading?',
  'A verse on your mind?',
  'A question you’re sitting with?',
  'What did Sunday leave you with?',
  'Start with a thought, or a verse',
] as const;

/** Long enough to read twice, short enough that it feels alive. */
const ROTATE_MS = 4500;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** Where today's pass starts, so the first line differs from day to day. */
export function feedComposeStartIndex(now: Date = new Date()): number {
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return dayNumber % FEED_COMPOSE_PROMPTS.length;
}

export default function PrototypeFeedComposePrompt() {
  const [start] = useState(() => feedComposeStartIndex());
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);

  /*
   * Visibility as state, not a check inside the tick: a tick that landed while the tab was in
   * the background used to return without scheduling another, and the rotation stalled for the
   * rest of the visit. Now hiding pauses it and showing resumes it.
   */
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const passDone = step >= FEED_COMPOSE_PROMPTS.length;
  useEffect(() => {
    if (paused || !pageVisible || passDone || reducedMotion) return undefined;
    const timer = window.setTimeout(() => setStep((s) => s + 1), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, pageVisible, passDone, reducedMotion, step]);

  // After a full pass it comes back to where the day started and rests there.
  const index = (start + (passDone ? 0 : step)) % FEED_COMPOSE_PROMPTS.length;

  return (
    <button
      type="button"
      className="proto-feed-compose"
      /* A fixed name: a screen reader should not re-announce each rotating line. */
      aria-label="Write a note"
      onClick={() => window.dispatchEvent(new Event('prototypeShortcutNewNote'))}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* The sweep that goes with each line: keyed to it, so every new line replays it, and
          absent once the pass is done — resting means still. */}
      {!passDone && !reducedMotion ? (
        <span key={`ring-${index}`} className="proto-feed-compose__ring" aria-hidden />
      ) : null}
      <Icon name="pen-to-square" size={14} aria-hidden />
      {/* Keyed so each new line mounts and plays its fade-in. */}
      <span key={index} className="proto-feed-compose__label">
        {FEED_COMPOSE_PROMPTS[index]}
      </span>
    </button>
  );
}
