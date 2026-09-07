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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import {
  remindersRowApplies,
  shownOnboardingProgress,
  stepAppliesTo,
  stepIsDone,
} from './onboarding-visible-steps';
import Icon, { type IconName } from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useOnboardingState } from './useOnboardingState';
import { PROTO_ONBOARDING_ROW_EXIT_MS, PROTO_ONBOARDING_ROW_DWELL_MS } from '../../layouts/proto-motion';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';
import { toast } from '@/utils/toast';
import {
  prototypeSettingsAppearanceRouteTo,
  prototypeSettingsDataRouteTo,
  prototypeSettingsRemindersRouteTo,
} from '@/lib/prototype-path';
import type { PushSupport } from '../../lib/push-reminders';
import {
  ONBOARDING_VERSION,
  type OnboardingCustomizeId,
  type OnboardingStepId,
} from '@/utils/onboarding-state';

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

/**
 * "Make it yours" — the three offers that are settings rather than lessons.
 *
 * Held apart from the tour above, and not just visually. The tour is what the dock is *for*:
 * finish it and the dock retires. These three tag along because a new account is already
 * looking here, and because each of them otherwise lives somewhere nobody new goes — reminders
 * behind a card most readers never qualify for, appearance behind Settings with no pointer at
 * all. When the tour ends they go with it, and the standing surfaces (`PrototypeRemindersCard`,
 * Activity's import row) take the offer back over for anyone who never got round to it.
 */
export const CUSTOMIZE_STEP_COPY: readonly OnboardingStepCopy[] = [
  {
    id: 'reminders',
    icon: 'bell',
    title: 'Turn on reminders',
    meta: 'A verse Sunday morning, a nudge midweek.',
  },
  {
    id: 'appearance',
    icon: 'paintbrush',
    title: 'Pick your look',
    // The same words Settings uses for this category, so arriving there is not a surprise.
    meta: 'Background color or image behind the app.',
  },
  {
    id: 'import',
    icon: 'cloud-arrow-up',
    title: 'Bring your notes in',
    meta: 'Markdown, Word, Evernote, or a folder of files.',
  },
];

const COPY_BY_ID = new Map(
  [...ONBOARDING_STEP_COPY, ...CUSTOMIZE_STEP_COPY].map((step) => [step.id, step]),
);

type Props = {
  /** Take the user to where a step gets done. */
  onStepAction: (id: OnboardingStepId) => void;
  /**
   * `home` is the ambient group on Activity. `popover` is the same list inside the toolbar's
   * card, where the eyebrow and the cluster-dismiss are the popover's own chrome and would be
   * said twice.
   */
  variant?: 'home' | 'popover';
};

export default function PrototypeOnboardingDock({ onStepAction, variant = 'home' }: Props) {
  const { state, visible, dismissStep, dismissAll, markDone } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();
  const navigate = useNavigate();

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
    if (!stepAppliesTo(step.id, isGuest)) return false;
    if (exiting.includes(step.id)) return true;
    if (stepIsDone(state, step.id, isGuest)) return false;
    return !state.steps[step.id].dismissed;
  });

  const shownProgress = shownOnboardingProgress(state, isGuest);

  /*
   * Whether this device could receive a push at all, resolved in an effect because it is a
   * live browser read — and, just as usefully, because resolving it warms the module. The row
   * has to call `enablePushReminders` straight off the tap, and a dynamic import standing
   * between the click and `requestPermission()` is exactly what iOS refuses to treat as a
   * gesture. By the time anyone can press the row, the import has already settled.
   */
  const [pushSupport, setPushSupport] = useState<PushSupport | null>(null);
  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    void import('../../lib/push-reminders').then((mod) => {
      if (!cancelled) setPushSupport(mod.getPushSupport());
    });
    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  const customizeRows = CUSTOMIZE_STEP_COPY.filter((step) => {
    // Every one of these needs an account: a subscription, a synced preference, an import.
    if (isGuest) return false;
    if (exiting.includes(step.id)) return true;
    if (state.steps[step.id].done || state.steps[step.id].dismissed) return false;
    // The one row whose availability is a fact about the device — see `remindersRowApplies`.
    if (step.id === 'reminders') return remindersRowApplies(pushSupport);
    return true;
  });

  const [enablingReminders, setEnablingReminders] = useState(false);

  const turnOnReminders = useCallback(async () => {
    setEnablingReminders(true);
    try {
      const mod = await import('../../lib/push-reminders');
      const result = await mod.enablePushReminders();
      setPushSupport(result.support);
      if (result.ok) {
        markDone('reminders');
        toast.success('Reminders are on. Sunday morning and midweek.');
      } else if (result.support === 'denied') {
        toast.error('Notifications are blocked for Harvous in this browser.');
      } else if (result.error) {
        toast.error(result.error);
      }
    } finally {
      setEnablingReminders(false);
    }
  }, [markDone]);

  const pressCustomizeRow = useCallback(
    (id: OnboardingCustomizeId) => {
      if (id === 'reminders') {
        // On an iPhone in a Safari tab there is nothing to ask for yet; Settings owns the
        // sheet that explains getting to the Home Screen first.
        if (pushSupport === 'needs-home-screen') {
          void navigate({ to: prototypeSettingsRemindersRouteTo() });
          return;
        }
        void turnOnReminders();
        return;
      }
      /*
       * The other two only open the door. Neither is marked done here — the row is a
       * shortcut, and arriving somewhere is not the same as doing the thing. Each page
       * reports its own step when a preset is actually picked or an import actually lands.
       */
      void navigate({
        to: id === 'appearance' ? prototypeSettingsAppearanceRouteTo() : prototypeSettingsDataRouteTo(),
      });
    },
    [navigate, pushSupport, turnOnReminders],
  );

  /*
   * A row still finishing its exit keeps the dock up — but only when the dock is leaving of
   * its own accord. Completing the last step should play out; being dismissed should not.
   * Without the `dismissed` term, tapping the cluster's × mid-animation would leave the
   * whole thing on screen for another second, which reads as the button not working.
   */
  const dismissed = state.dismissedVersion >= ONBOARDING_VERSION;
  /*
   * A guest is never "finished".
   *
   * `visible` goes false once every step is done, which is right for a member — the list has
   * served its purpose and retires itself. A guest's list has a fourth row that is not a step
   * and cannot be ticked, so finishing read, highlight and note made the checklist vanish
   * taking the account offer with it, at the exact moment they had most to keep. Dismissing it
   * still works; completing it no longer counts as dismissing it.
   */
  const showing = !dismissed && (visible || isGuest || exiting.length > 0);
  const liveIds = showing
    ? [...rows, ...customizeRows].filter((r) => !exiting.includes(r.id)).map((r) => r.id)
    : [];
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
    const newlyDone = [...ONBOARDING_STEP_COPY, ...CUSTOMIZE_STEP_COPY].filter(
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
  /* The customization rows can outlive the tour rows by a render or two — someone who
     finishes the last lesson still has "Pick your look" in front of them until the dock
     itself retires — so an empty tour list is no longer an empty dock. */
  if (!showing || (rows.length === 0 && customizeRows.length === 0 && !isGuest)) return null;

  const list = (
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
        {/*
          * "Make it yours", and the reason it is a heading rather than three more rows.
          *
          * The rows above are things to learn; these are things to decide. Run together they
          * read as a nine-item chore list where the last three never get done — which is also
          * why the count in the header stays on the tour: the finish line should not move
          * because someone has not picked a background.
          */}
        {customizeRows.length > 0 ? (
          <p className="proto-caption proto-onboarding-dock__section" aria-hidden>
            Make it yours
          </p>
        ) : null}

        {customizeRows.map((step, index) => {
          const done = exiting.includes(step.id);
          return (
            <div
              key={step.id}
              className={`proto-onboarding-dock__row${done ? ' proto-onboarding-dock__row--done' : ''}`}
              style={
                { '--proto-onboarding-index': rows.length + index } as React.CSSProperties
              }
            >
              <div className="proto-onboarding-dock__row-inner">
                <PrototypeHomeRow
                  icon={step.icon}
                  title={step.title}
                  meta={[
                    /* An iPhone in a Safari tab cannot subscribe, and saying "turn on
                       reminders" to someone who then lands in Settings reads as a dead end.
                       Say what the next step actually is. */
                    step.id === 'reminders' && pushSupport === 'needs-home-screen'
                      ? 'Add Harvous to your Home Screen first.'
                      : step.meta,
                  ]}
                  onClick={
                    done || (step.id === 'reminders' && enablingReminders)
                      ? undefined
                      : () => pressCustomizeRow(step.id as OnboardingCustomizeId)
                  }
                  disabled={done || (step.id === 'reminders' && enablingReminders)}
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

        {isGuest ? (
          <div className="proto-onboarding-dock__row" style={{ '--proto-onboarding-index': rows.length } as React.CSSProperties}>
            <div className="proto-onboarding-dock__row-inner">
              <PrototypeHomeRow
                icon="circle-user"
                title="Create a free account"
                /*
                  Says what an account is *for*, in the terms this reader already has. The line
                  before it — "keeps what you make, and opens notes, threads and recall" —
                  listed three features they have never seen, and led with a verb ("opens")
                  doing work it cannot do on its own. Their study following them is the promise
                  the product actually makes; a phone is the concrete form of it.
                */
                meta={['Keeps your study, and brings it to your phone too.']}
                onClick={() => {
                  leaveForSignUp();
                  window.location.href = guestSignUpHref();
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
  );

  /* The popover supplies its own title and its own way out, so the section head would be
     the same two things said twice inside a card the size of the list. */
  if (variant === 'popover') return list;

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

      {list}
    </section>
  );
}

export function onboardingStepCopy(id: OnboardingStepId): OnboardingStepCopy | undefined {
  return COPY_BY_ID.get(id);
}
