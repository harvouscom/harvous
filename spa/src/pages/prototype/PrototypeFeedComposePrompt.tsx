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
 * invitation rather than a label you stop seeing, and each new line types itself out behind a
 * caret, as if someone had started writing there. (A blue light running round the border did this
 * job first; it read as decoration, where a caret reads as "type here".) One pass per visit, then
 * it settles on a plain, generic line and the caret goes — never back on the most specific one,
 * which was only right for the moment it arrived ("Still in Romans 8?" resting there for the rest
 * of the visit reads like the app forgot the time passed); paused while hovered, focused or in a
 * background tab. Moving text on a reading page is only welcome if it stops. Under reduced motion
 * none of it plays: the resting line shows from the start, with no caret.
 */
import { useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import { FEED_COMPOSE_FILLERS } from './feed-compose-prompts';

/** Long enough to read twice, short enough that it feels alive. Includes the typing. */
const ROTATE_MS = 4500;

/** Per character. A 45-character line is written in about two seconds, then held. */
const TYPE_MS = 42;

/** Where a pass comes to rest — plain and always true, so it never overstays a line that was
    only right for the moment it appeared. `FEED_COMPOSE_FILLERS` is documented as having this
    line first for exactly this reason. */
const ANCHOR_LINE = FEED_COMPOSE_FILLERS[0];

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * One line, written out a character at a time behind a caret.
 *
 * Mounted fresh for each line (the parent keys it), so every line starts from nothing. The caret
 * is solid while it types and blinks once the line is written, as a real one does. `caret` false
 * takes it away once the line is written — the settled line keeps no cursor, because a caret
 * blinking for the rest of a visit is motion that never stops.
 */
function TypedLine({
  text,
  animate,
  caret,
}: {
  text: string;
  animate: boolean;
  caret: boolean;
}) {
  const [typed, setTyped] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setTyped(text.length);
      return undefined;
    }
    // The opening line can sharpen while the page's data lands; start that one over.
    setTyped(0);
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setTyped(count);
      if (count >= text.length) window.clearInterval(timer);
    }, TYPE_MS);
    return () => window.clearInterval(timer);
  }, [text, animate]);

  const done = typed >= text.length;
  return (
    <>
      {text.slice(0, typed)}
      {animate && (caret || !done) ? (
        <span className="proto-feed-compose__caret" data-blink={done ? '' : undefined} aria-hidden />
      ) : null}
    </>
  );
}

export default function PrototypeFeedComposePrompt({
  prompts,
}: {
  /** Most specific first — see `buildFeedComposePrompts`. Where the pass ends is `ANCHOR_LINE`,
      not the end of this list, so a rotation of one still shows and a rotation of five doesn't
      leave the reader looking at whichever specific line happened to be first. */
  prompts: readonly string[];
}) {
  const [step, setStep] = useState(0);
  /*
   * Follow the list until the first rotation, then hold it. The page's data lands over the first
   * second or two, so the opening line may sharpen once ("What are you studying today?" becoming
   * "Still in Romans 8?"); after that a late query must not reshuffle a pass mid-way.
   */
  const [lines, setLines] = useState(prompts);
  useEffect(() => {
    if (step === 0) setLines(prompts);
  }, [prompts, step]);
  const list = lines.length > 0 ? lines : FEED_COMPOSE_FILLERS;
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

  const passDone = step >= list.length;
  useEffect(() => {
    if (paused || !pageVisible || passDone || reducedMotion || list.length < 2) return undefined;
    const timer = window.setTimeout(() => setStep((s) => s + 1), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, pageVisible, passDone, reducedMotion, list.length, step]);

  // A full pass ends on the anchor line, not back on the most specific one: "Still in Romans 8?"
  // was right for the moment it arrived, not for the rest of the visit.
  const activeIndex = step % list.length;
  const label = passDone ? ANCHOR_LINE : list[activeIndex];

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
      <Icon name="pen-to-square" size={14} aria-hidden />
      {/* Keyed so each new line mounts and types from nothing — including the settle onto the
          anchor line, a distinct key from every rotation index so it always plays. A single line
          never rotates, so it is simply shown. */}
      <span key={passDone ? 'rest' : activeIndex} className="proto-feed-compose__label">
        <TypedLine
          text={label}
          animate={!reducedMotion && list.length > 1}
          caret={!passDone}
        />
      </span>
    </button>
  );
}
