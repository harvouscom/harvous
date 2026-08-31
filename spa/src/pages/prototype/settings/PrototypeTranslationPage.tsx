import { useEffect, useRef } from 'react';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { useBiblePacks } from '../../../hooks/useBiblePacks';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';
import PrototypeTranslationRow from './PrototypeTranslationRow';

/**
 * Bytes as something a person can picture.
 *
 * Whole megabytes above 10 and one decimal below, because "4.6 MB" is the difference between
 * two translations and "14 MB" versus "14.2 MB" is not — precision where it changes a
 * decision, and none where it is only noise.
 */
function formatPackStorage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return 'under 0.1 MB';
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

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
  const { packs, storageBytes, loading, downloading, queue, download, cancel, remove, atLimit, maxPacks } =
    useBiblePacks();

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
   *
   * Gated on `loading`: `packs` starts as `[]` and only becomes real once `useBiblePacks`'s own
   * `listPacks()` read resolves. Checking against it before then made every guard below pass
   * vacuously — `packs.some(...)` is always false and `!packs.length` is always true on an
   * empty array — so this fired `download()` on every single mount of this page, even for a
   * translation already fully saved, replaying the whole "Saving X of 66" progress UI for
   * nothing. Worse, `autoStartedRef` was set from that first, wrong pass, so the effect's
   * later re-run against the real `packs` never got a chance to correct it.
   */
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !selected || downloading) return;
    if (autoStartedRef.current === selected) return;
    if (packs.some((p) => p.translationId === selected)) return;
    if (!packs.length || !atLimit) {
      autoStartedRef.current = selected;
      void download(selected);
    }
  }, [loading, selected, packs, downloading, atLimit, download]);

  /* Complete copies only. A pack halfway through is not yet something you can read on a
     plane, and counting it here would promise otherwise. */
  const savedCount = packs.filter((p) => p.complete).length;

  return (
    <SettingsShell>
      <SettingsIntro>
        Scripture you read appears in this translation. Keep up to {maxPacks} available offline —
        your default is saved automatically, and any chapter you read is kept as you go.
        {/*
          The size, once there is one.

          "3 of 3" is a limit to take on trust; "3 saved · 14 MB" is a fact someone can weigh
          against their own device, which is the only way to have an opinion about whether the
          limit is the right one. Appended to the paragraph rather than given a line of its own
          — it is a footnote to the promise above it, not a second statement.
        */}
        {savedCount > 0 ? (
          <>
            {' '}
            <span className="proto-translation-usage">
              {savedCount} saved · {formatPackStorage(storageBytes)} on this device.
            </span>
          </>
        ) : null}
      </SettingsIntro>

      <SettingsGroup>
        {TRANSLATION_ORDER.map((id) => {
          const t = getTranslation(id);
          const isSelected = id === selected;
          const pack = packs.find((p) => p.translationId === id);
          const isDownloading = downloading?.translationId === id;
          /* Asked for, but another pack is still transferring — `queue` includes the one in
             flight, so the head is excluded rather than shown twice. */
          const isQueued = !isDownloading && queue.includes(id);
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

          /* One shape for the six states, resolved here so the row stays presentational
             and the gallery can render every one of them without a pack store. */
          const state = isDownloading
            ? ({
                kind: 'saving',
                booksSaved: downloading.booksSaved,
                booksTotal: downloading.booksTotal,
              } as const)
            : isQueued
              ? ({ kind: 'queued' } as const)
              : pack?.complete
                ? ({ kind: 'offline' } as const)
                : pack
                  ? ({
                      kind: 'partial',
                      booksSaved: pack.booksSaved,
                      booksTotal: pack.booksTotal,
                    } as const)
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
              onStop={() => cancel(id)}
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
