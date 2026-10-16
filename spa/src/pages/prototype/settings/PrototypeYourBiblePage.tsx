import Icon from '@/components/react/Icon';
import type { Tradition } from '@/utils/tradition';
import { useTradition } from '../../../hooks/useTradition';
import { useUpdateTradition } from '../../../hooks/mutations/useUpdateTradition';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';

const CHOICES: { value: Tradition; label: string; detail: string }[] = [
  { value: 'protestant', label: 'Protestant', detail: 'The 66 books' },
  {
    value: 'catholic',
    label: 'Catholic',
    detail: 'The 73 books and daily Mass readings',
  },
];

/**
 * Settings › Your Bible — Protestant or Catholic (src/utils/tradition.ts).
 *
 * Its own page so Translations stays about translations: a Catholic switch at the top of that
 * list singled one tradition out on a page everyone opens. Here the two are peers, each saying
 * what it changes. Choosing never changes the translation — a Catholic reader finds the Catholic
 * editions listed first on Translations, which is the offer.
 */
export default function PrototypeYourBiblePage() {
  const tradition = useTradition();
  const updateTradition = useUpdateTradition();
  const selected = (updateTradition.isPending ? updateTradition.variables : undefined) ?? tradition;

  return (
    <SettingsShell>
      <SettingsIntro>The books Harvous shows you, and what each day brings.</SettingsIntro>
      <SettingsGroup>
        {CHOICES.map((choice) => {
          const isSelected = selected === choice.value;
          return (
            <div key={choice.value} className="proto-translation-row" data-active={isSelected ? 'true' : undefined}>
              <div className="proto-translation-row__main">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className="proto-translation-row__choose"
                  onClick={() => {
                    if (!isSelected) updateTradition.mutate(choice.value);
                  }}
                >
                  <span className="proto-settings-list-row__main">
                    <span className="pds-list-title">{choice.label}</span>
                    <span className="pds-list-preview proto-translation-row__meta">{choice.detail}</span>
                  </span>
                  <span className="proto-settings-list-row__trailing proto-settings-list-row__trailing--orb" aria-hidden>
                    {isSelected ? (
                      <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                        <Icon name="check" size={11} />
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </SettingsGroup>
      {updateTradition.isError ? (
        <p className="proto-caption proto-tradition-control__error">Couldn't save. Please try again.</p>
      ) : null}
    </SettingsShell>
  );
}
