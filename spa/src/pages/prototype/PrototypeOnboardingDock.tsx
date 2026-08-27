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
    id: 'pill',
    icon: 'link',
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

type Props = {
  /** Take the user to where a step gets done. */
  onStepAction: (id: OnboardingStepId) => void;
};

export default function PrototypeOnboardingDock({ onStepAction }: Props) {
  const { state, visible, progress, dismissStep, dismissAll } = useOnboardingState();

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
    if (exiting.includes(step.id)) return true;
    const s = state.steps[step.id];
    return !s.done && !s.dismissed;
  });
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

  if (!showing || rows.length === 0) return null;

  return (
    <section
      className="proto-home-section proto-onboarding-dock"
      aria-label="Getting started"
    >
      <div className="proto-onboarding-dock__head">
        <p className="proto-caption proto-onboarding-dock__eyebrow">
          Getting started
          <span className="proto-onboarding-dock__count" aria-label={`${progress.done} of ${progress.total} done`}>
            {progress.done} of {progress.total}
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
      </div>
    </section>
  );
}

export function onboardingStepCopy(id: OnboardingStepId): OnboardingStepCopy | undefined {
  return COPY_BY_ID.get(id);
}
