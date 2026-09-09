/**
 * The getting-started dock — Home's ambient checklist.
 *
 * "Make it yours" is a sibling of Getting started on Home, using the same part
 * chrome as "This evening" (eyebrow outside the card, own panel).
 * Each customize row opens the matching Settings page.
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
import {
  prototypeSettingsAppearanceRouteTo,
  prototypeSettingsDataRouteTo,
  prototypeSettingsRemindersRouteTo,
} from '@/lib/prototype-path';
import { prototypeSettingsTranslationRouteTo } from './prototype-settings-translation-route';
import { CUSTOMIZE_STEP_COPY } from './onboarding-customize-copy';
import type { PushSupport } from '../../lib/push-reminders';
import {
  isOnboardingClusterDismissed,
  type OnboardingCustomizeId,
  type OnboardingStepId,
} from '@/utils/onboarding-state';

export interface OnboardingStepCopy {
  id: OnboardingStepId;
  icon: IconName;
  title: string;
  meta: string;
}

export const ONBOARDING_STEP_COPY: readonly OnboardingStepCopy[] = [
  { id: 'read', icon: 'book-open', title: 'Open the Bible', meta: 'Start with a passage.' },
  { id: 'note', icon: 'note-sticky', title: 'Write a note', meta: 'A thought, a question, anything.' },
  { id: 'pill', icon: 'scroll', title: 'Mention a verse', meta: 'Type a reference — it becomes a live link.' },
  { id: 'highlight', icon: 'highlighter', title: 'Highlight a verse', meta: 'Select while reading to keep it.' },
  { id: 'thread', icon: 'arrow-right-arrow-left', title: 'Connect two notes', meta: 'A study is notes that talk to each other.' },
  { id: 'recall', icon: 'arrow-rotate-left', title: 'Revisit something', meta: 'Harvous brings back what you studied.' },
];

const COPY_BY_ID = new Map(
  [...ONBOARDING_STEP_COPY, ...CUSTOMIZE_STEP_COPY].map((step) => [step.id, step]),
);

function customizeSettingsRoute(id: OnboardingCustomizeId) {
  if (id === 'reminders') return prototypeSettingsRemindersRouteTo();
  if (id === 'appearance') return prototypeSettingsAppearanceRouteTo();
  if (id === 'translation') return prototypeSettingsTranslationRouteTo();
  return prototypeSettingsDataRouteTo();
}

type Props = {
  onStepAction: (id: OnboardingStepId) => void;
  variant?: 'home' | 'popover';
};

export default function PrototypeOnboardingDock({ onStepAction, variant = 'home' }: Props) {
  const { state, visible, dismissStep, dismissAll } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();
  const navigate = useNavigate();

  const [exiting, setExiting] = useState<OnboardingStepId[]>([]);
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
    if (isGuest) return false;
    if (exiting.includes(step.id)) return true;
    if (!state.steps[step.id]) return false;
    if (state.steps[step.id].done || state.steps[step.id].dismissed) return false;
    if (step.id === 'reminders') return remindersRowApplies(pushSupport);
    return true;
  });

  const pressCustomizeRow = useCallback(
    (id: OnboardingCustomizeId) => {
      void navigate({ to: customizeSettingsRoute(id) });
    },
    [navigate],
  );

  const showing =
    !isOnboardingClusterDismissed(state) && (visible || isGuest || exiting.length > 0);
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

  useEffect(() => {
    for (const id of liveIds) renderedRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  useEffect(() => {
    const newlyDone = [...ONBOARDING_STEP_COPY, ...CUSTOMIZE_STEP_COPY].filter(
      (step) => state.steps[step.id]?.done && renderedRef.current.has(step.id),
    ).map((step) => step.id);
    if (newlyDone.length === 0) return;

    for (const id of newlyDone) renderedRef.current.delete(id);
    setExiting((prev) => [...prev, ...newlyDone.filter((id) => !prev.includes(id))]);

    const timer = window.setTimeout(() => {
      setExiting((prev) => prev.filter((id) => !newlyDone.includes(id)));
    }, PROTO_ONBOARDING_ROW_DWELL_MS + PROTO_ONBOARDING_ROW_EXIT_MS);
    timersRef.current.push(timer);
  }, [state]);

  useEffect(() => {
    if (celebratedRef.current) return;
    if (!state.completedAt) return;
    celebratedRef.current = true;
    if (renderedRef.current.size === 0 && exiting.length === 0) return;
    showPrototypeFeedbackToast("That's the tour — the rest is yours.", 'success');
  }, [state.completedAt, exiting.length]);

  if (!showing || (rows.length === 0 && customizeRows.length === 0 && !isGuest)) return null;

  const renderRow = (
    step: { id: OnboardingStepId; icon: IconName; title: string; meta: string },
    index: number,
    onClick: (() => void) | undefined,
    disabled: boolean,
  ) => {
    const done = exiting.includes(step.id);
    return (
      <div
        key={step.id}
        className={`proto-onboarding-dock__row${done ? ' proto-onboarding-dock__row--done' : ''}`}
        style={{ '--proto-onboarding-index': index } as React.CSSProperties}
      >
        <div className="proto-onboarding-dock__row-inner">
          <PrototypeHomeRow
            icon={step.icon}
            title={step.title}
            meta={[step.meta]}
            onClick={done ? undefined : onClick}
            disabled={done || disabled}
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
  };

  const list = (
    <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-onboarding-dock__list">
      {rows.map((step, index) =>
        renderRow(step, index, () => onStepAction(step.id), false),
      )}
      {isGuest ? (
        <div className="proto-onboarding-dock__row" style={{ '--proto-onboarding-index': rows.length } as React.CSSProperties}>
          <div className="proto-onboarding-dock__row-inner">
            <PrototypeHomeRow
              icon="circle-user"
              title="Create a free account"
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

  const customizePanel =
    customizeRows.length === 0 ? null : (
      <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-feed-part__panel">
        {customizeRows.map((step, index) =>
          renderRow(
            step,
            index,
            () => pressCustomizeRow(step.id as OnboardingCustomizeId),
            false,
          ),
        )}
      </div>
    );

  if (variant === 'popover') {
    return (
      <>
        {list}
        {customizePanel ? (
          <>
            <p className="proto-caption proto-feed-part__eyebrow">Make it yours</p>
            {customizePanel}
          </>
        ) : null}
      </>
    );
  }

  const tourOpen = rows.length > 0 || isGuest;

  return (
    <>
      {tourOpen ? (
        <section className="proto-home-section proto-onboarding-dock" aria-label="Getting started">
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
              aria-label="Hide getting started"
              onClick={dismissAll}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          </div>
          {list}
        </section>
      ) : null}

      {customizePanel ? (
        <section className="proto-feed-part proto-onboarding-dock--customize" aria-label="Make it yours">
          <p className="proto-caption proto-feed-part__eyebrow">Make it yours</p>
          {customizePanel}
        </section>
      ) : null}
    </>
  );
}

export function onboardingStepCopy(id: OnboardingStepId): OnboardingStepCopy | undefined {
  return COPY_BY_ID.get(id);
}
