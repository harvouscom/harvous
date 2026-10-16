import { useTradition } from '../../../hooks/useTradition';
import { useUpdateTradition } from '../../../hooks/mutations/useUpdateTradition';
import { markOnboardingStep } from '../../../lib/proto-onboarding-sync';
import { playSound } from '@/utils/sounds';
import { SettingsGroup, SettingsToggleRow } from './SettingsShell';

const LABEL = 'Catholic Bible';
const SUBLABEL = 'The 73 books, daily Mass readings, Catholic editions first';

type Props = {
  /**
   * `settings` — the Translations page: one switch row, above the list it reorders.
   * `onboarding` — the "Make it yours" row: the same switch, small, under the row's question.
   */
  variant: 'settings' | 'onboarding';
};

/**
 * The Catholic switch: one on/off setting for every Catholic difference (src/utils/tradition.ts).
 *
 * A switch, not a question. "Which Bible do you read?" with "66 books | 73 books (Catholic)" asked
 * people to think in book counts on a page about translations; a labelled switch is the most
 * familiar shape a setting has. It never changes the translation — turning it on lists the
 * Catholic editions first, right below, which is the offer.
 */
export default function TraditionControl({ variant }: Props) {
  const tradition = useTradition();
  const updateTradition = useUpdateTradition();
  const on = ((updateTradition.isPending ? updateTradition.variables : undefined) ?? tradition) === 'catholic';
  const set = (next: boolean) => updateTradition.mutate(next ? 'catholic' : 'protestant');

  if (variant === 'onboarding') {
    return (
      <div className="proto-tradition-control">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className="proto-tradition-control__switch"
          onClick={() => {
            playSound('nav.toggle');
            // Already on (set in Settings): pressing it is the answer, so the row ticks off.
            if (on) markOnboardingStep('tradition');
            else set(true);
          }}
        >
          <span className="proto-fte-switch" data-on={on ? 'true' : 'false'} aria-hidden>
            <span className="proto-fte-switch__thumb" />
          </span>
          <span>{LABEL}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="proto-tradition-control proto-tradition-control--settings">
      <SettingsGroup>
        <SettingsToggleRow label={LABEL} sublabel={SUBLABEL} checked={on} onChange={set} />
      </SettingsGroup>
      {updateTradition.isError ? (
        <p className="proto-caption proto-tradition-control__error">Couldn't save. Please try again.</p>
      ) : null}
    </div>
  );
}
