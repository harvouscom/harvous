import { useTradition } from '../../../hooks/useTradition';
import { useUpdateTradition } from '../../../hooks/mutations/useUpdateTradition';
import { markOnboardingStep } from '../../../lib/proto-onboarding-sync';
import { playSound } from '@/utils/sounds';

/**
 * The onboarding "Reading a Catholic Bible?" row's switch (src/utils/tradition.ts).
 *
 * Settings has the full choice on its own page, Settings › My Bible
 * (PrototypeYourBiblePage), so Translations stays about translations. Here it is one switch,
 * answered in the row; the row's title opens that page.
 */
export default function TraditionControl() {
  const tradition = useTradition();
  const updateTradition = useUpdateTradition();
  const on = ((updateTradition.isPending ? updateTradition.variables : undefined) ?? tradition) === 'catholic';

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
          else updateTradition.mutate('catholic');
        }}
      >
        <span className="proto-fte-switch" data-on={on ? 'true' : 'false'} aria-hidden>
          <span className="proto-fte-switch__thumb" />
        </span>
        <span>Catholic Bible</span>
      </button>
    </div>
  );
}
