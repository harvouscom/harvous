/**
 * "One of these" — the panel's switch, wherever a tab narrows to exactly one kind.
 *
 * A switch rather than the chip row the sidebar filters highlights with, because each list
 * that uses this is a *partition*: exactly one segment is on at any moment, always, and
 * "All" is a member of the list rather than the absence of a choice. A chip row says "none,
 * some or all of these", which is true of the search scope chips it borrows its look from
 * and not true here.
 *
 * The same `.proto-seg-track` thumb every other segmented control rides, joined the way that
 * rule asks — a button class and an index, no restyle. Keep the option lists short: the thumb
 * divides the track by the number of segments, so a sixth one is a sixth of the width, and
 * these sit in a panel that is 640px at its widest and a phone at its narrowest.
 */
import Icon from '@/components/react/Icon';
import type { CSSProperties } from 'react';

export type LibrarySegmentedOption<T extends string> = {
  id: T;
  label: string;
  iconName?: string;
};

export default function PrototypeLibrarySegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly LibrarySegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the choice for a screen reader — "Highlight kind", "Testament". */
  label: string;
}) {
  /*
   * `Math.max(0, …)` because `findIndex` answers -1 for a value the list does not hold, and
   * the thumb translates by whole segment widths — so a miss would park it one full step off
   * the left end rather than doing nothing visible.
   */
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );

  return (
    <div
      className="proto-library-kinds proto-seg-track"
      role="tablist"
      aria-label={label}
      style={
        {
          '--proto-seg-count': options.length,
          '--proto-seg-index': index,
        } as CSSProperties
      }
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-active={selected}
            className="proto-library-kinds__btn"
            /* The label ellipsises at narrow widths, so the full word has to reach the
               pointer and the screen reader some other way. */
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            {option.iconName ? (
              <Icon name={option.iconName as never} size={11} aria-hidden />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
