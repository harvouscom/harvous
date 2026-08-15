import { useEffect, useRef } from 'react';
import Icon from '@/components/react/Icon';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { useBiblePacks } from '../../../hooks/useBiblePacks';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';

/**
 * Translations — which one you read in, and which ones you keep.
 *
 * This page used to be a list of radio buttons for the default translation. It now also owns
 * offline copies, because the two questions are the same question asked twice: the translation
 * someone reads in is the one they need when the connection goes, and a separate "Offline"
 * page would have listed the identical seven names for them to pick from again.
 */
export default function PrototypeTranslationPage() {
  const { data: profile } = useProfile();
  const updateTranslation = useUpdateTranslation();
  const { packs, downloading, download, cancel, remove, atLimit, maxPacks } = useBiblePacks();

  // Optimistic selection: pending value if mutating, else server value, else NET.
  const selected =
    (updateTranslation.isPending ? updateTranslation.variables : undefined) ??
    profile?.defaultTranslation ??
    'NET';

  /*
   * The translation someone reads in is offline-ready without being asked. It is the one they
   * will want on a plane, and making them find a second control to say so would mean the
   * default answer to "is my Bible available offline" is no.
   *
   * Fires once per default, not once per render, and never while another download is running —
   * a background pack must not interrupt one the reader started themselves.
   */
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || downloading) return;
    if (autoStartedRef.current === selected) return;
    if (packs.some((p) => p.translationId === selected)) return;
    if (!packs.length || !atLimit) {
      autoStartedRef.current = selected;
      void download(selected);
    }
  }, [selected, packs, downloading, atLimit, download]);

  return (
    <SettingsShell>
      <SettingsIntro>
        Scripture you read appears in this translation. Keep up to {maxPacks} available offline —
        your default is saved automatically, and any chapter you read is kept as you go.
      </SettingsIntro>

      <SettingsGroup>
        {TRANSLATION_ORDER.map((id) => {
          const t = getTranslation(id);
          const isSelected = id === selected;
          const pack = packs.find((p) => p.translationId === id);
          const isDownloading = downloading?.translationId === id;
          const canDownload = !pack?.complete && !isDownloading && (!atLimit || !!pack);

          return (
            <div key={id} className="proto-translation-row">
              <button
                type="button"
                className="proto-note-row proto-translation-row__choose"
                data-active={isSelected ? 'true' : undefined}
                onClick={() => {
                  if (updateTranslation.isPending || isSelected) return;
                  updateTranslation.mutate(id);
                }}
              >
                <span className="proto-settings-list-row__main">
                  <span className="pds-list-title" style={{ display: 'block' }}>
                    {t?.abbreviation ?? id}
                  </span>
                  {t?.name ? (
                    <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
                      {t.name}
                    </span>
                  ) : null}
                </span>
                <span
                  className="proto-settings-list-row__trailing proto-settings-list-row__trailing--orb"
                  aria-hidden
                >
                  {isSelected ? (
                    <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                      <Icon name="check" size={11} />
                    </span>
                  ) : null}
                </span>
              </button>

              <div className="proto-translation-row__offline">
                {isDownloading ? (
                  <>
                    {/* Books, not bytes: a count that moves 66 times says more about how far
                        along this is than a percentage that creeps. */}
                    <span className="pds-caption proto-translation-row__status">
                      Saving {downloading.booksSaved} of {downloading.booksTotal} books
                    </span>
                    <button type="button" className="proto-translation-row__action" onClick={cancel}>
                      Stop
                    </button>
                  </>
                ) : pack?.complete ? (
                  <>
                    <span className="pds-caption proto-translation-row__status" data-state="ready">
                      <Icon name="check" size={10} aria-hidden /> Available offline
                    </span>
                    <button
                      type="button"
                      className="proto-translation-row__action"
                      onClick={() => void remove(id)}
                    >
                      Remove
                    </button>
                  </>
                ) : pack ? (
                  <>
                    {/* A partial pack is worth naming rather than hiding: it is why some
                        chapters open on a plane and others do not. */}
                    <span className="pds-caption proto-translation-row__status">
                      {pack.booksSaved} of {pack.booksTotal} books saved
                    </span>
                    <button
                      type="button"
                      className="proto-translation-row__action"
                      onClick={() => void download(id)}
                    >
                      Finish
                    </button>
                    <button
                      type="button"
                      className="proto-translation-row__action"
                      onClick={() => void remove(id)}
                    >
                      Remove
                    </button>
                  </>
                ) : canDownload ? (
                  <button
                    type="button"
                    className="proto-translation-row__action"
                    onClick={() => void download(id)}
                  >
                    Save offline
                  </button>
                ) : (
                  <span className="pds-caption proto-translation-row__status">
                    Remove one to save another
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </SettingsGroup>

      {updateTranslation.isError ? (
        <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', padding: '0 12px' }}>
          Couldn't save. Please try again.
        </p>
      ) : null}
    </SettingsShell>
  );
}
