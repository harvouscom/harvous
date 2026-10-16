import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { isCatholicEdition, type Tradition } from '@/utils/tradition';
import { useTradition } from '../../../hooks/useTradition';
import { useUpdateTradition } from '../../../hooks/mutations/useUpdateTradition';
import { SettingsShell } from './SettingsShell';
import { formatPackStorage, useTranslationSettings } from './useTranslationSettings';
import type { TranslationRowState } from './PrototypeTranslationRow';

const CHOICES: { value: Tradition; label: string; detail: string }[] = [
  { value: 'protestant', label: 'Protestant', detail: 'The 66 books' },
  {
    value: 'catholic',
    label: 'Catholic',
    detail: 'The 73 books and daily Mass readings',
  },
];

function offlineWords(state: TranslationRowState): string {
  switch (state.kind) {
    case 'offline':
      return 'Saved offline';
    case 'saving':
      return `Saving ${state.booksSaved} of ${state.booksTotal}`;
    case 'queued':
      return 'Waiting to save';
    case 'partial':
      return `${state.booksSaved} of ${state.booksTotal} saved offline`;
    default:
      return 'Not saved offline';
  }
}

/**
 * Settings › My Bible — the Bible you read, in one place (src/utils/tradition.ts).
 *
 * Three parts, top to bottom (Oct 2026, layout "D" of four mocked):
 * - **The card:** the translation you read in, whether it's on this device, and Change. The
 *   full list stays folded behind Change — you pick a translation rarely, and a dozen rows
 *   was most of what made the old Translations page feel heavy.
 * - **Books:** Protestant or Catholic, as peers. Choosing never changes the translation; a
 *   Catholic finds the Catholic editions listed first behind Change, which is the offer.
 * - **Kept offline:** only what's on the device, so the clouds sit where they mean something.
 *
 * Translations used to be its own settings page; /settings/translation now redirects here.
 */
export default function PrototypeYourBiblePage() {
  const tradition = useTradition();
  const updateTradition = useUpdateTradition();
  const selectedTradition =
    (updateTradition.isPending ? updateTradition.variables : undefined) ?? tradition;
  const catholic = selectedTradition === 'catholic';

  const [choosing, setChoosing] = useState(false);
  const { selected, selectedState, renderRow, keptIds, savedCount, maxPacks, storageBytes, saveError } =
    useTranslationSettings({ onChosen: () => setChoosing(false) });
  const current = getTranslation(selected);

  const catholicEditions = TRANSLATION_ORDER.filter(isCatholicEdition);
  const otherTranslations = TRANSLATION_ORDER.filter((id) => !isCatholicEdition(id));

  return (
    <SettingsShell>
      <div className="proto-my-bible">
        <div className="proto-my-bible__card">
          <div className="proto-my-bible__card-text">
            <span className="pds-list-title">{current?.abbreviation ?? selected}</span>
            <span className="pds-list-preview proto-my-bible__card-meta">
              {current?.name ? `${current.name} · ` : ''}
              {offlineWords(selectedState)}
            </span>
          </div>
          <button
            type="button"
            className="proto-translation-row__action proto-my-bible__change"
            aria-expanded={choosing}
            onClick={() => setChoosing((open) => !open)}
          >
            {choosing ? 'Done' : 'Change'}
          </button>
        </div>

        {choosing ? (
          catholic ? (
            /* A Catholic reads the Church's editions first; the rest stay one tap away, labelled
               for what they are rather than hidden. */
            <>
              <p className="proto-caption proto-my-bible__label">Catholic editions</p>
              <div className="proto-my-bible__group">{catholicEditions.map((id) => renderRow(id))}</div>
              <p className="proto-caption proto-my-bible__label">Other translations</p>
              <div className="proto-my-bible__group">{otherTranslations.map((id) => renderRow(id))}</div>
            </>
          ) : (
            <div className="proto-my-bible__group proto-my-bible__group--list">
              {TRANSLATION_ORDER.map((id) => renderRow(id))}
            </div>
          )
        ) : null}

        <p className="proto-caption proto-my-bible__label">Books</p>
        <div className="proto-my-bible__group" role="radiogroup" aria-label="Books">
          {CHOICES.map((choice) => {
            const isSelected = selectedTradition === choice.value;
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
        </div>

        <p className="proto-caption proto-my-bible__label">Kept offline</p>
        {keptIds.length ? (
          /* No check here: which one you read in is the card's job, and two checks on one
             page would ask which list is the choice. */
          <div className="proto-my-bible__group">{keptIds.map((id) => renderRow(id, { showSelected: false }))}</div>
        ) : null}
        <p className="proto-caption proto-my-bible__usage">
          {savedCount} of {maxPacks} saved{savedCount > 0 ? ` · ${formatPackStorage(storageBytes)}` : ''}. Keep
          another from its <Icon name="cloud-arrow-down" size={11} aria-label="cloud" /> under Change.
        </p>

        {updateTradition.isError || saveError ? (
          <p className="proto-caption proto-tradition-control__error">Couldn't save. Please try again.</p>
        ) : null}
      </div>
    </SettingsShell>
  );
}
