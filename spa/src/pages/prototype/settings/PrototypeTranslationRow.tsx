/**
 * One translation: which one you read in, and whether you keep a copy of it.
 *
 * **Two controls, one row.** The body picks the default translation; the control on the
 * trailing edge manages the offline copy. They are siblings and only the body is a button —
 * nesting would make "Remove" a way to change your default by accident, and a button cannot
 * hold a button anyway.
 *
 * They sit *beside* each other. The offline control used to be a full-width strip
 * underneath, which gave a secondary action the footprint of a row, ended the selection band
 * halfway down the thing being selected, and made a translation that was merely saving look
 * like a different and broken kind of row.
 *
 * Progress is a 2px rule along the foot rather than a sentence, and it is absolutely
 * positioned so a row starting or finishing a download never reflows the list.
 *
 * **Offline is a glyph, not a button on every row (Oct 2026).** A dozen "Save offline" pills
 * down the page made the list read as a store, and "Remove" beside the checkmark read as removing
 * your translation. Now: a muted download cloud, a filled cloud once saved (press it once to
 * reveal Remove, so a stray tap never deletes), a stop while saving. The selection is the check
 * alone — no grey band, which competed with the clouds for "this one is different".
 *
 * Presentational on purpose — every piece of state arrives as a prop. That is what lets the
 * design gallery render all six states side by side without a profile, a network or a
 * pack store, and it is why this row can be looked at rather than only reasoned about.
 */
import { useEffect, useId, useState } from 'react';
import Icon from '@/components/react/Icon';
import { MAX_OFFLINE_TRANSLATIONS } from '@/utils/bible-pack-store';

export type TranslationRowState =
  /** No copy, and room to make one. */
  | { kind: 'available' }
  /** No copy, and the pack limit is already spent — the save control is present but off. */
  | { kind: 'blocked' }
  /** Saving now. */
  | { kind: 'saving'; booksSaved: number; booksTotal: number }
  /** Asked for, waiting behind another download. Packs transfer one at a time. */
  | { kind: 'queued' }
  /** Stopped or interrupted part-way — why some chapters open on a plane and others don't. */
  | { kind: 'partial'; booksSaved: number; booksTotal: number }
  /** The whole thing is on the device. */
  | { kind: 'offline' };

export type PrototypeTranslationRowProps = {
  abbreviation: string;
  name?: string | null;
  selected: boolean;
  state: TranslationRowState;
  onChoose: () => void;
  onSave: () => void;
  onStop: () => void;
  onRemove: () => void;
};

/**
 * How far the copy has got, in words, for the meta line.
 *
 * Books, not bytes: a count that moves 66 times says more about how far along this is than
 * a percentage that creeps. A finished pack says nothing here — the badge on the title line
 * already did, and saying it twice was the old design's habit.
 */
function statusLabel(state: TranslationRowState): string | null {
  if (state.kind === 'saving') return `Saving ${state.booksSaved} of ${state.booksTotal}`;
  /* Says why nothing is moving. A queued row with no word for it looks like a download that
     started and stalled — which is the reading the old single-slot flicker also invited. */
  if (state.kind === 'queued') return 'Waiting to save';
  if (state.kind === 'partial') return `${state.booksSaved} of ${state.booksTotal} saved`;
  return null;
}

/** A fraction only while something is in flight or half-done. A full bar under a finished
 *  pack would be a widget reporting a fact the badge already states. */
function fraction(state: TranslationRowState): number | null {
  if (state.kind !== 'saving' && state.kind !== 'partial') return null;
  if (state.booksTotal <= 0) return 0;
  return Math.min(1, Math.max(0, state.booksSaved / state.booksTotal));
}

const CLOUD_PATH =
  'M0 336c0 79.5 64.5 144 144 144l304 0c70.7 0 128-57.3 128-128 0-51.6-30.5-96.1-74.5-116.3 6.7-13.1 10.5-28 10.5-43.7 0-53-43-96-96-96-17.7 0-34.2 4.8-48.4 13.1-24.1-45.8-72.2-77.1-127.6-77.1-79.5 0-144 64.5-144 144 0 8 .7 15.9 1.9 23.5-56.9 19.2-97.9 73.1-97.9 136.5z';

/**
 * Saved offline: the cloud with a check cut through it, so it reads apart from the download
 * cloud at a glance. Cut with a mask rather than drawn in a colour, because the list sits on
 * whatever paper or hover tint is behind it. The mask id is `useId`'s: a page draws a dozen of
 * these, and a shared id lets one row's mask hide every other row's cloud.
 */
function CloudCheckIcon({ size }: { size: number }) {
  const mask = `cloud-check-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 576 512" aria-hidden style={{ display: 'block' }}>
      <mask id={mask}>
        <rect width="576" height="512" fill="#fff" />
        <path d="M190 318l66 62 132-136" fill="none" stroke="#000" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path d={CLOUD_PATH} fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}

export default function PrototypeTranslationRow({
  abbreviation,
  name,
  selected,
  state,
  onChoose,
  onSave,
  onStop,
  onRemove,
}: PrototypeTranslationRowProps) {
  const status = statusLabel(state);
  const progress = fraction(state);
  const percent = progress === null ? null : Math.floor(progress * 100);

  /* Remove is two presses: the saved cloud arms it, the revealed word does it. Disarms after
     a few seconds, so a row left armed does not wait for an accidental second tap. */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  useEffect(() => {
    if (state.kind !== 'offline') setArmed(false);
  }, [state.kind]);

  return (
    <div
      className="proto-translation-row"
      /* The whole row carries the selection — title line, meta and trailing control
         together. Painting only the button left the rest stranded below a grey band it
         clearly belonged to. */
      data-active={selected ? 'true' : undefined}
    >
      <div className="proto-translation-row__main">
        <button
          type="button"
          className="proto-translation-row__choose"
          data-active={selected ? 'true' : undefined}
          onClick={onChoose}
        >
          <span className="proto-settings-list-row__main">
            {/*
              The abbreviation and, beside it, whether this one is on the device.

              On the title line because that is the line you scan. It used to be said only
              in a caption under the row — easy to miss, and impossible to compare down a
              list of a dozen translations. Which ones you can read on a plane is the
              question this page exists to answer, so it is answered where the eye is.
            */}
            <span className="proto-translation-row__name">
              <span className="pds-list-title">{abbreviation}</span>
            </span>
            {/*
              The name, and — while there is one — how far the copy has got. On the meta
              line rather than a strip of its own: how far along is a fact *about this
              translation*, so it belongs on the line that already describes it, in the
              dot-separated shape meta takes everywhere else.
            */}
            {name || status ? (
              <span className="pds-list-preview proto-translation-row__meta">
                {name ? <span>{name}</span> : null}
                {name && status ? (
                  <span className="proto-translation-row__meta-sep" aria-hidden>
                    ·
                  </span>
                ) : null}
                {status ? <span>{status}</span> : null}
              </span>
            ) : null}
          </span>
          <span
            className="proto-settings-list-row__trailing proto-settings-list-row__trailing--orb"
            aria-hidden
          >
            {selected ? (
              <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                <Icon name="check" size={11} />
              </span>
            ) : null}
          </span>
        </button>

        <div className="proto-translation-row__offline">
          {state.kind === 'saving' || state.kind === 'queued' ? (
            /* One control for both: leaving the queue and stopping the transfer are the same
               intent. The meta line says which ("Saving 12 of 66", "Waiting to save"). */
            <button
              type="button"
              className="proto-translation-row__icon"
              onClick={onStop}
              aria-label={`Stop saving ${abbreviation}`}
              title="Stop saving"
            >
              <Icon name="circle-stop" size={15} aria-hidden />
            </button>
          ) : state.kind === 'offline' ? (
            armed ? (
              <button
                type="button"
                className="proto-translation-row__action proto-translation-row__action--quiet"
                onClick={() => {
                  setArmed(false);
                  onRemove();
                }}
                onBlur={() => setArmed(false)}
                autoFocus
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="proto-translation-row__icon"
                data-state="saved"
                onClick={() => setArmed(true)}
                aria-label={`${abbreviation} is saved offline. Remove the offline copy`}
                title="Saved offline"
              >
                <CloudCheckIcon size={16} />
              </button>
            )
          ) : state.kind === 'partial' ? (
            /* Finish leads; removing a half-saved copy is the quieter neighbour. */
            <>
              <button
                type="button"
                className="proto-translation-row__icon"
                onClick={onSave}
                aria-label={`Finish saving ${abbreviation} offline`}
                title="Finish saving"
              >
                <Icon name="cloud-arrow-down" size={15} aria-hidden />
              </button>
              <button
                type="button"
                className="proto-translation-row__icon"
                onClick={onRemove}
                aria-label={`Remove the part-saved ${abbreviation}`}
                title="Remove"
              >
                <Icon name="xmark" size={12} aria-hidden />
              </button>
            </>
          ) : (
            /*
             * The same control either way — blocked only disables it, and the reason moves to
             * its title, so one download never restyles every other row.
             */
            <button
              type="button"
              className="proto-translation-row__icon"
              onClick={onSave}
              disabled={state.kind === 'blocked'}
              aria-label={`Save ${abbreviation} offline`}
              title={
                state.kind === 'blocked'
                  ? `Remove another translation first — ${MAX_OFFLINE_TRANSLATIONS} can be kept offline at once`
                  : 'Save offline'
              }
            >
              <Icon name="cloud-arrow-down" size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {percent !== null ? (
        <div
          className="proto-translation-row__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${abbreviation} offline copy`}
        >
          <span className="proto-translation-row__progress-fill" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}
