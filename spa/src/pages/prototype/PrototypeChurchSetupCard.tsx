/**
 * "Get your church set up" — the first-run order for a new pastor or staff member.
 *
 * Until this, a new pastor met empty lanes and a tools list and had to work out
 * the order on their own. Ambient, like Home's own checklist (no tour, no
 * wizard): rows tick themselves from what the church already has, each undone
 * row takes you to the place that does it, and the card leaves once every row
 * is done or someone puts it away. Dismissal rides the account's onboarding
 * state, so putting it away on the laptop puts it away on the phone.
 *
 * Put away is not gone (Derek, Nov 27 2026: "when I put away setup I can't find it
 * again"). While steps are left, the hub lists "Get set up" first in Tools, which
 * opens the same rows as a pane (`mode="pane"`). Reopening never clears the
 * dismissal: that state merges earliest-wins across devices, so an undo would not
 * stick, and the card coming back on its own was the thing being put away.
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
import { toast } from '@/utils/toast';
import {
  shouldShowChurchSetup,
  type ChurchSetupStep,
  type ChurchSetupStepId,
} from '../../lib/church-setup-steps';

/* The same glyph each step's destination wears in Church tools, so the row and the
   place it leads to look like one thing. */
const STEP_ICON: Record<ChurchSetupStepId, 'gear' | 'rss' | 'list-check' | 'calendar-week' | 'note-sticky' | 'link'> = {
  times: 'gear',
  channel: 'rss',
  starter: 'list-check',
  plan: 'calendar-week',
  publish: 'note-sticky',
  invite: 'link',
};

/** Whether this account put the setup card away. `null` until the account's state loads. */
export function useChurchSetupDismissed(): boolean | null {
  const snapshot = useSyncExternalStore(
    subscribeOnboardingState,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  );
  if (!snapshot.hydrated) return null;
  return Boolean(snapshot.state?.churchSetupDismissedAt);
}

export default function PrototypeChurchSetupCard({
  steps,
  onSelect,
  mode = 'card',
}: {
  steps: ChurchSetupStep[];
  onSelect: (id: ChurchSetupStepId) => void;
  /** `pane`: opened from Tools after it was put away — always shown, nothing to put away. */
  mode?: 'card' | 'pane';
}) {
  const dismissed = useChurchSetupDismissed();
  // Until the account's state has loaded, "not dismissed" is a guess — don't flash the card.
  if (mode === 'card' && (dismissed === null || !shouldShowChurchSetup(steps, dismissed))) return null;

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">
        {mode === 'pane'
          ? `${doneCount} of ${steps.length} done`
          : `Get your church set up · ${doneCount} of ${steps.length}`}
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
        {mode === 'card' ? (
          <button
            type="button"
            className="proto-sheet-quiet-action"
            onClick={() => {
              updateOnboardingState((state) => dismissChurchSetup(state, new Date().toISOString()));
              toast.success('Put away. Find it again under Tools.');
            }}
          >
            Put this away
          </button>
        ) : null}
      </div>
    </div>
  );
}
