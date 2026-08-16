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
 * Presentational on purpose — every piece of state arrives as a prop. That is what lets the
 * design gallery render all five states side by side without a profile, a network or a
 * pack store, and it is why this row can be looked at rather than only reasoned about.
 */
import Icon from '@/components/react/Icon';

export type TranslationRowState =
  /** No copy, and room to make one. */
  | { kind: 'available' }
  /** No copy, and the pack limit is already spent. */
  | { kind: 'blocked' }
  /** Saving now. */
  | { kind: 'saving'; booksSaved: number; booksTotal: number }
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
          className="proto-note-row proto-translation-row__choose"
          data-active={selected ? 'true' : undefined}
          onClick={onChoose}
        >
          <span className="proto-settings-list-row__main">
            {/*
              The abbreviation and, beside it, whether this one is on the device.

              On the title line because that is the line you scan. It used to be said only
              in a caption under the row — easy to miss, and impossible to compare down a
              list of eleven translations. Which ones you can read on a plane is the
              question this page exists to answer, so it is answered where the eye is.
            */}
            <span className="proto-translation-row__name">
              <span className="pds-list-title">{abbreviation}</span>
              {state.kind === 'offline' ? (
                <span className="proto-offline-badge" data-state="ready">
                  <Icon name="check" size={9} aria-hidden />
                  Offline
                </span>
              ) : state.kind === 'partial' ? (
                <span className="proto-offline-badge" data-state="partial">
                  Part-saved
                </span>
              ) : null}
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
          {state.kind === 'saving' ? (
            <button type="button" className="proto-translation-row__action" onClick={onStop}>
              Stop
            </button>
          ) : state.kind === 'offline' ? (
            <button type="button" className="proto-translation-row__action" onClick={onRemove}>
              Remove
            </button>
          ) : state.kind === 'partial' ? (
            /* Finish leads: a half-saved pack is one someone meant to have. Remove is the
               quieter neighbour rather than an equal. */
            <>
              <button type="button" className="proto-translation-row__action" onClick={onSave}>
                Finish
              </button>
              <button
                type="button"
                className="proto-translation-row__action proto-translation-row__action--quiet"
                onClick={onRemove}
              >
                Remove
              </button>
            </>
          ) : state.kind === 'available' ? (
            <button type="button" className="proto-translation-row__action" onClick={onSave}>
              Save offline
            </button>
          ) : (
            /* Not an action — why there isn't one. Stays in the trailing slot so the column
               of controls does not develop a hole. */
            <span className="pds-caption proto-translation-row__status">Remove one first</span>
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
