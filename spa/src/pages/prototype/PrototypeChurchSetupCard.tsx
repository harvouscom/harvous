/**
 * "Get your church set up" — the first-run order for a new pastor or staff member.
 *
 * Until this, a new pastor met empty lanes and a tools list and had to work out
 * the order on their own. Ambient, like Home's own checklist (no tour, no
 * wizard): rows tick themselves from what the church already has, each undone
 * row takes you to the place that does it, and the card leaves once every row
 * is done or someone puts it away. Dismissal rides the account's onboarding
 * state, so putting it away on the laptop puts it away on the phone.
 */
import { useSyncExternalStore } from 'react';
import Icon from '@/components/react/Icon';
import {
  getOnboardingServerSnapshot,
  getOnboardingSnapshot,
  subscribeOnboardingState,
  updateOnboardingState,
} from '../../lib/proto-onboarding-sync';
import { dismissChurchSetup } from '@/utils/onboarding-state';
import {
  shouldShowChurchSetup,
  type ChurchSetupStep,
  type ChurchSetupStepId,
} from '../../lib/church-setup-steps';

/* The same glyph each step's destination wears in Church tools, so the row and the
   place it leads to look like one thing. */
const STEP_ICON: Record<ChurchSetupStepId, 'gear' | 'rss' | 'list-check' | 'calendar-week' | 'note-sticky'> = {
  times: 'gear',
  channel: 'rss',
  starter: 'list-check',
  plan: 'calendar-week',
  publish: 'note-sticky',
};

export default function PrototypeChurchSetupCard({
  steps,
  onSelect,
}: {
  steps: ChurchSetupStep[];
  onSelect: (id: ChurchSetupStepId) => void;
}) {
  const snapshot = useSyncExternalStore(
    subscribeOnboardingState,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  );
  const dismissed = Boolean(snapshot.state?.churchSetupDismissedAt);
  // Until the account's state has loaded, "not dismissed" is a guess — don't flash the card.
  if (!snapshot.hydrated || !shouldShowChurchSetup(steps, dismissed)) return null;

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">
        {`Get your church set up · ${doneCount} of ${steps.length}`}
      </p>
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            className="proto-church-tools__row"
            data-setup-step={step.id}
            disabled={step.done}
            aria-label={step.done ? `${step.title}, done` : step.title}
            onClick={() => onSelect(step.id)}
          >
            <span className="proto-church-tools__row-icon" aria-hidden>
              <Icon name={STEP_ICON[step.id]} size={13} />
            </span>
            <span className="proto-church-tools__row-text">
              <span className="pds-list-title proto-church-tools__row-title">{step.title}</span>
              <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                {step.meta}
              </span>
            </span>
            <span className="proto-church-tools__row-chevron" aria-hidden>
              <Icon name={step.done ? 'check' : 'caret-right'} size={11} />
            </span>
          </button>
        ))}
        <button
          type="button"
          className="proto-sheet-quiet-action"
          onClick={() =>
            updateOnboardingState((state) => dismissChurchSetup(state, new Date().toISOString()))
          }
        >
          Put this away
        </button>
      </div>
    </div>
  );
}
