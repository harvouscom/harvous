/**
 * The getting-started dock — Home's ambient checklist.
 *
 * Passive by construction. It never covers anything, never interrupts, and every row is
 * both a shortcut and a receipt: tap it to be taken to the thing, or just go do the thing
 * and watch the row check itself off. No forks, no tour, no overlay — a group of Home rows
 * like every other group, which is why it can sit there for a week without becoming furniture
 * someone has to fight past. (`PrototypeBanner` is deprecated for exactly this reason.)
 *
 * Only unfinished steps get a row. Steps latched from the account's existing data — the
 * seed path — were never rows at all; they are already counted in the header and would
 * otherwise open the checklist with four things you did last year. What the header counts
 * and what the list shows are deliberately different: the count is your progress, the list
 * is what is left.
 */
import { useEffect, useRef, useState } from 'react';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { guestHighlights } from '../../lib/guest-store';
import Icon, { type IconName } from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useOnboardingState } from './useOnboardingState';
import { PROTO_ONBOARDING_ROW_EXIT_MS, PROTO_ONBOARDING_ROW_DWELL_MS } from '../../layouts/proto-motion';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';
import { ONBOARDING_VERSION, type OnboardingStepId } from '@/utils/onboarding-state';

export interface OnboardingStepCopy {
  id: OnboardingStepId;
  icon: IconName;
  title: string;
  meta: string;
}

/**
 * The steps, in the order a reader meets them.
 *
 * Reading first, on the same reasoning as the first-run rows this replaced: a blank account
 * asked to "create your first note" is being asked to produce something before it has been
 * given anything. Harvous has the whole Bible in it — the first move is to open it.
 */
export const ONBOARDING_STEP_COPY: readonly OnboardingStepCopy[] = [
  {
    id: 'read',
    icon: 'book-open',
    title: 'Open the Bible',
    meta: 'Start with a passage.',
  },
  {
    id: 'note',
    icon: 'note-sticky',
    title: 'Write a note',
    meta: 'A thought, a question, anything.',
  },
  {
    // The same glyph the sidebar's Scripture list mode uses. A generic link icon said
    // "hyperlink", which is the mechanism rather than the thing — every other scripture
    // surface in the app is a scroll, and this row should be recognisable as one of them.
    id: 'pill',
    icon: 'scroll',
    title: 'Mention a verse',
    meta: 'Type a reference — it becomes a live link.',
  },
  {
    id: 'highlight',
    icon: 'highlighter',
    title: 'Highlight a verse',
    meta: 'Select while reading to keep it.',
  },
  {
    id: 'thread',
    icon: 'arrow-right-arrow-left',
    title: 'Connect two notes',
    meta: 'A study is notes that talk to each other.',
  },
  {
    id: 'recall',
    icon: 'arrow-rotate-left',
    title: 'Revisit something',
    meta: 'Harvous brings back what you studied.',
  },
];

const COPY_BY_ID = new Map(ONBOARDING_STEP_COPY.map((step) => [step.id, step]));

/**
 * The steps a guest can actually finish.
 *
 * Reading, highlighting, and writing a note on a verse from the reader's annotate dock all
 * work without an account. Pills, threads and recall need one. Listing a step nobody can tick
 * would make the checklist lie about itself — and a count that can never reach its total is a
 * worse invitation than an honest short list ending in the thing that unlocks the rest.
 */
const GUEST_STEP_IDS = new Set<OnboardingStepId>(['read', 'highlight', 'note']);

/**
 * A guest's steps, read back off what they have rather than only off what we caught them doing.
 *
 * The account version does this too (`DERIVED_STEP_IDS`), and for the same reason: an event
 * latch only knows about the times it was listening. A guest who highlighted a verse through
 * some path that does not latch — or before a build that latched at all — would be looking at
 * their own highlight above a row telling them to go and make one.
 *
 * 'read' has nothing to derive from, which is why it stays event-only: a chapter that has been
 * opened leaves no trace on this device unless someone records that it was.
 */
function guestStepDerived(id: OnboardingStepId): boolean {
  const highlights = guestHighlights();
  if (id === 'highlight') return highlights.length > 0;
  if (id === 'note') return highlights.some((h) => h.miniNoteBody?.trim());
  return false;
}

type Props = {
  /** Take the user to where a step gets done. */
  onStepAction: (id: OnboardingStepId) => void;
};

export default function PrototypeOnboardingDock({ onStepAction }: Props) {
  const { state, visible, progress, dismissStep, dismissAll } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();

  /*
   * Rows mid-goodbye: done, but still on screen playing the check and collapse.
   *
   * Without this the row would vanish the instant the step completed, which is the one
   * moment the checklist has anything to say. A step latched before the dock mounted never
   * enters this set — it was never a row, so it has no exit to play.
   */
  const [exiting, setExiting] = useState<OnboardingStepId[]>([]);
  /** Steps that have actually been on screen — the only ones with an exit to play. */
  const renderedRef = useRef<Set<OnboardingStepId>>(new Set());
  const timersRef = useRef<number[]>([]);
  const celebratedRef = useRef(false);

  const rows = ONBOARDING_STEP_COPY.filter((step) => {
    if (isGuest && !GUEST_STEP_IDS.has(step.id)) return false;
    if (exiting.includes(step.id)) return true;
    const s = state.steps[step.id];
    if (isGuest && guestStepDerived(step.id)) return false;
    return !s.done && !s.dismissed;
  });

  /*
   * A guest's count is over their own two steps plus the account row below, not the six an
   * account gets. `progress` counts all six, and "1 of 6" in front of a two-row list reads as
   * four rows having gone missing.
   */
  const guestDone = [...GUEST_STEP_IDS].filter(
    (id) => state.steps[id].done || guestStepDerived(id),
  ).length;
  const shownProgress = isGuest
    ? { done: guestDone, total: GUEST_STEP_IDS.size + 1 }
    : progress;
  /*
   * A row still finishing its exit keeps the dock up — but only when the dock is leaving of
   * its own accord. Completing the last step should play out; being dismissed should not.
   * Without the `dismissed` term, tapping the cluster's × mid-animation would leave the
   * whole thing on screen for another second, which reads as the button not working.
   */
  const dismissed = state.dismissedVersion >= ONBOARDING_VERSION;
  const showing = !dismissed && (visible || exiting.length > 0);
  const liveIds = showing ? rows.filter((r) => !exiting.includes(r.id)).map((r) => r.id) : [];
  const liveKey = liveIds.join(',');

  useEffect(
    () => () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    },
    [],
  );

  /*
   * Declared before the completion effect on purpose: effects run in order, so the set of
   * on-screen rows is up to date for this render before the next effect asks which of them
   * just finished. Reversed, a step completing in the same tick it first rendered would be
   * missed and the row would simply disappear.
   */
  useEffect(() => {
    for (const id of liveIds) renderedRef.current.add(id);
    // `liveIds` is rebuilt every render; `liveKey` is the value that actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  useEffect(() => {
    const newlyDone = ONBOARDING_STEP_COPY.filter(
      (step) => state.steps[step.id].done && renderedRef.current.has(step.id),
    ).map((step) => step.id);
    if (newlyDone.length === 0) return;

    for (const id of newlyDone) renderedRef.current.delete(id);
    setExiting((prev) => [...prev, ...newlyDone.filter((id) => !prev.includes(id))]);

    const timer = window.setTimeout(() => {
      setExiting((prev) => prev.filter((id) => !newlyDone.includes(id)));
    }, PROTO_ONBOARDING_ROW_DWELL_MS + PROTO_ONBOARDING_ROW_EXIT_MS);
    timersRef.current.push(timer);
  }, [state]);

  /*
   * The last step is worth a word, and only the last one. Every other completion is its own
   * reward — a row ticking itself off while you were doing something else.
   */
  useEffect(() => {
    if (celebratedRef.current) return;
    if (!state.completedAt) return;
    celebratedRef.current = true;
    // Nothing to celebrate if the checklist completed via the seed, before it was ever
    // shown — that is an established account, not a finish line.
    if (renderedRef.current.size === 0 && exiting.length === 0) return;
    showPrototypeFeedbackToast("That's the tour — the rest is yours.", 'success');
  }, [state.completedAt, exiting.length]);

  // A guest always has the account row, so an empty step list is not an empty dock for them.
  if (!showing || (rows.length === 0 && !isGuest)) return null;

  return (
    <section
      className="proto-home-section proto-onboarding-dock"
      aria-label="Getting started"
    >
      <div className="proto-onboarding-dock__head">
        <p className="proto-caption proto-onboarding-dock__eyebrow">
          Getting started
          <span
            className="proto-onboarding-dock__count"
            aria-label={`${shownProgress.done} of ${shownProgress.total} done`}
          >
            {shownProgress.done} of {shownProgress.total}
          </span>
        </p>
        <button
          type="button"
          className="proto-side-panel__action-btn proto-onboarding-dock__dismiss"
          aria-label="Dismiss getting started"
          onClick={dismissAll}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>
      </div>

      <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-onboarding-dock__list">
        {rows.map((step, index) => {
          const done = exiting.includes(step.id);
          return (
            <div
              key={step.id}
              className={`proto-onboarding-dock__row${done ? ' proto-onboarding-dock__row--done' : ''}`}
              /* The stagger reads as one list arriving, so it is keyed off position rather
                 than a per-row delay someone has to keep in sync. */
              style={{ '--proto-onboarding-index': index } as React.CSSProperties}
            >
              <div className="proto-onboarding-dock__row-inner">
                <PrototypeHomeRow
                  icon={step.icon}
                  title={step.title}
                  meta={[step.meta]}
                  onClick={done ? undefined : () => onStepAction(step.id)}
                  disabled={done}
                  trailing={
                    done ? (
                      <span className="proto-onboarding-dock__check" aria-hidden>
                        <Icon name="check" size={11} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="proto-side-panel__action-btn"
                        aria-label={`Dismiss "${step.title}"`}
                        onClick={() => dismissStep(step.id)}
                      >
                        <Icon name="xmark" size={12} aria-hidden />
                      </button>
                    )
                  }
                />
              </div>
            </div>
          );
        })}

        {/*
          The last step, and the only one that is not about Scripture: it is what turns two
          highlights on one browser into a study. Placed inside the same list rather than as a
          separate card so it reads as the end of the sequence — the thing you arrive at, not a
          banner bolted underneath one.

          No dismiss control. The other rows can be put away because the app works without
          them; this one is the offer the whole mode exists to make, and the dock's own
          dismiss already puts the entire cluster away for anyone who wants it gone.
        */}
        {isGuest ? (
          <div className="proto-onboarding-dock__row" style={{ '--proto-onboarding-index': rows.length } as React.CSSProperties}>
            <div className="proto-onboarding-dock__row-inner">
              <PrototypeHomeRow
                icon="circle-user"
                title="Create a free account"
                meta={['Keeps what you make, and opens notes, threads and recall.']}
                onClick={() => {
                  leaveForSignUp();
                  window.location.href = guestSignUpHref();
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function onboardingStepCopy(id: OnboardingStepId): OnboardingStepCopy | undefined {
  return COPY_BY_ID.get(id);
}
