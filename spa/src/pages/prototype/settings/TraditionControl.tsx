import { useTradition } from '../../../hooks/useTradition';
import { useUpdateTradition } from '../../../hooks/mutations/useUpdateTradition';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { useProfile } from '../../../hooks/queries/useProfile';
import { isCatholicEdition } from '@/utils/tradition';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import type { Tradition } from '@/utils/tradition';
import { SegmentedControl } from './SettingsShell';
import { markOnboardingStep } from '../../../lib/proto-onboarding-sync';

/*
 * Asked by canon, not by label: "66 books" names the Bible someone reads without asking a
 * non-denominational reader to call themselves Protestant. The values stay the tradition.
 */
const OPTIONS: { value: Tradition; label: string }[] = [
  { value: 'protestant', label: '66 books' },
  { value: 'catholic', label: '73 books (Catholic)' },
];

/** What each side turns on, said under the control so nobody has to switch to find out. */
const SUMMARY: Record<Tradition, string> = {
  protestant: 'The Protestant canon, and a verse each day.',
  catholic: 'Catholic editions first, daily Mass readings, Catholic book names and numbering.',
};

type Props = {
  /**
   * `settings` — the Translations page: summary, then the NABRE offer when it applies.
   * `onboarding` — the "Make it yours" row: the control alone; the row's own meta says the rest.
   */
  variant: 'settings' | 'onboarding';
};

/**
 * Protestant | Catholic. One switch for every Catholic difference (src/utils/tradition.ts).
 *
 * Choosing Catholic never changes the translation; on the settings page it offers the NABRE
 * instead, and only while the reader is in a translation without the Catholic books.
 */
export default function TraditionControl({ variant }: Props) {
  const tradition = useTradition();
  const updateTradition = useUpdateTradition();
  const updateTranslation = useUpdateTranslation();
  const { data: profile } = useProfile();

  const shown = (updateTradition.isPending ? updateTradition.variables : undefined) ?? tradition;
  const translation =
    (updateTranslation.isPending ? updateTranslation.variables : undefined) ??
    profile?.defaultTranslation ??
    getEffectiveDefaultTranslation();
  const offerNabre =
    variant === 'settings' && shown === 'catholic' && !isCatholicEdition(translation);

  const control = (
    <SegmentedControl
      ariaLabel="Which Bible do you read?"
      options={OPTIONS}
      value={shown}
      onChange={(next) => {
        if (next !== shown) updateTradition.mutate(next);
        // Keeping Protestant is an answer too: the onboarding row ticks off either way.
        else markOnboardingStep('tradition');
      }}
    />
  );

  if (variant === 'onboarding') return <div className="proto-tradition-control">{control}</div>;

  return (
    <div className="proto-tradition-control proto-tradition-control--settings">
      <p className="proto-caption proto-tradition-control__label">Which Bible do you read?</p>
      {control}
      <p className="proto-caption proto-tradition-control__summary">{SUMMARY[shown]}</p>
      {offerNabre ? (
        <div className="proto-tradition-control__offer">
          <span>Read in the NABRE?</span>
          <button
            type="button"
            className="proto-translation-row__action"
            disabled={updateTranslation.isPending}
            onClick={() => updateTranslation.mutate('NABRE')}
          >
            Use NABRE
          </button>
        </div>
      ) : null}
      {updateTradition.isError ? (
        <p className="proto-caption proto-tradition-control__error">Couldn't save. Please try again.</p>
      ) : null}
    </div>
  );
}
