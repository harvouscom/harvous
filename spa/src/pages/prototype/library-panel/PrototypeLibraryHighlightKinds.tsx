/**
 * Which kind of highlight the panel is showing.
 *
 * A switch rather than the chip row the sidebar uses, because these five are a *partition*:
 * exactly one is on at any moment, always, and "All" is a member of the list rather than the
 * absence of a choice. A chip row says "none, some or all of these" — true of the search
 * scope chips it borrows its look from, and not true here. The switch says "one of these",
 * which is the real shape, and it is the control this app already uses for that question.
 *
 * The same `.proto-seg-track` thumb every other segmented control rides, joined the way that
 * rule asks — a button class and an index, no restyle.
 */
import Icon from '@/components/react/Icon';
import { HIGHLIGHT_KIND_OPTIONS, type HighlightKindFilter } from '../sidebar-search-types';
import type { CSSProperties } from 'react';

export default function PrototypeLibraryHighlightKinds({
  value,
  onChange,
}: {
  value: HighlightKindFilter;
  onChange: (next: HighlightKindFilter) => void;
}) {
  const index = Math.max(
    0,
    HIGHLIGHT_KIND_OPTIONS.findIndex((option) => option.id === value),
  );

  return (
    <div
      className="proto-library-kinds proto-seg-track"
      role="tablist"
      aria-label="Highlight kind"
      style={
        {
          '--proto-seg-count': HIGHLIGHT_KIND_OPTIONS.length,
          '--proto-seg-index': index,
        } as CSSProperties
      }
    >
      {HIGHLIGHT_KIND_OPTIONS.map((option) => {
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
