/**
 * "In the Bible" — verses whose words match the query, from the whole text rather than from
 * notes.
 *
 * Its own row rather than a new `SidebarSearchResultKind`: a verse hit is not something in the
 * library, it has no id the builders could exclude or rank, and the sidebar's search has no
 * place for it. The row borrows the note row's markup so it reads as one list with the rest.
 *
 * The matched words are drawn by splitting the snippet on its markers, never through innerHTML
 * — see `src/utils/verse-search-snippet.ts`.
 */
import Icon from '@/components/react/Icon';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { plainVerseSnippet, splitVerseSnippet } from '@/utils/verse-search-snippet';
import type { VerseSearchHit } from '../../../hooks/queries/useScriptureVerseSearch';

function VerseSnippet({ snippet }: { snippet: string }) {
  return (
    <>
      {splitVerseSnippet(snippet).map((part, i) =>
        part.match ? (
          <mark key={i} className="proto-verse-hit__match">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function VerseHitRow({ hit, onOpen }: { hit: VerseSearchHit; onOpen: (hit: VerseSearchHit) => void }) {
  const translation = getTranslationAbbreviationDisplay(hit.translation);
  return (
    <li className="proto-note-row-item" data-active="false">
      <button
        type="button"
        className="proto-note-row__main proto-note-row__main--lead proto-verse-hit"
        onClick={() => onOpen(hit)}
        aria-label={`${hit.reference} (${translation}): ${plainVerseSnippet(hit.snippet)}`}
      >
        <span className="proto-note-row__lead-icon" aria-hidden>
          <Icon name="quote-left" size={12} />
        </span>
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{hit.reference}</span>
        </div>
        <div className="pds-list-preview proto-note-row__preview proto-verse-hit__text">
          <VerseSnippet snippet={hit.snippet} />
        </div>
      </button>
    </li>
  );
}

export default function LibraryVerseResults({
  hits,
  onOpen,
  moreLabel,
  onMore,
}: {
  hits: readonly VerseSearchHit[];
  onOpen: (hit: VerseSearchHit) => void;
  /** A last row that widens the list — "Show more verses" on the All tab. */
  moreLabel?: string;
  onMore?: () => void;
}) {
  return (
    <ul className="proto-note-list">
      {hits.map((hit) => (
        <VerseHitRow key={`${hit.translation}:${hit.reference}`} hit={hit} onOpen={onOpen} />
      ))}
      {moreLabel && onMore ? (
        <li className="proto-note-row-item">
          {/* In the lead column like the rows, so its label starts on their edge. */}
          <button
            type="button"
            className="proto-note-row__main proto-note-row__main--lead proto-verse-hit__more"
            onClick={onMore}
          >
            <span className="proto-note-row__lead-icon" aria-hidden>
              <Icon name="arrow-right" size={12} />
            </span>
            <span className="proto-verse-hit__more-label">{moreLabel}</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}
