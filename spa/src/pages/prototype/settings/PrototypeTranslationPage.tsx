import { useEffect, useRef } from 'react';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { useBiblePacks } from '../../../hooks/useBiblePacks';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';
import PrototypeTranslationRow from './PrototypeTranslationRow';

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

          /*
            How far the copy has got, in words, for the meta line.

            Books, not bytes: a count that moves 66 times says more about how far along
            this is than a percentage that creeps. Complete says nothing here — the badge
            on the title line already did, and saying it twice was the old design's habit.
          */
          const offlineStatus = isDownloading
            ? `Saving ${downloading.booksSaved} of ${downloading.booksTotal}`
            : pack && !pack.complete
              ? `${pack.booksSaved} of ${pack.booksTotal} saved`
              : null;

          /* A fraction only while there is something in flight or half-done. A full bar
             under a finished pack would be a widget reporting a fact the badge already
             states. */
          const offlineFraction = isDownloading
            ? downloading.booksTotal > 0
              ? downloading.booksSaved / downloading.booksTotal
              : 0
            : pack && !pack.complete && pack.booksTotal > 0
              ? pack.booksSaved / pack.booksTotal
              : null;

          /* One shape for the five states, resolved here so the row stays presentational
             and the gallery can render every one of them without a pack store. */
          const state = isDownloading
            ? ({ kind: 'saving', booksSaved: downloading.booksSaved, booksTotal: downloading.booksTotal } as const)
            : pack?.complete
              ? ({ kind: 'offline' } as const)
              : pack
                ? ({ kind: 'partial', booksSaved: pack.booksSaved, booksTotal: pack.booksTotal } as const)
                : canDownload
                  ? ({ kind: 'available' } as const)
                  : ({ kind: 'blocked' } as const);

          return (
            <PrototypeTranslationRow
              key={id}
              abbreviation={t?.abbreviation ?? id}
              name={t?.name ?? null}
              selected={isSelected}
              state={state}
              onChoose={() => {
                if (updateTranslation.isPending || isSelected) return;
                updateTranslation.mutate(id);
              }}
              onSave={() => void download(id)}
              onStop={cancel}
              onRemove={() => void remove(id)}
            />
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
