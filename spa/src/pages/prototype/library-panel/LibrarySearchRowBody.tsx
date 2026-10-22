/**
 * The inside of a Library panel search row: lead glyph (drawn as a tile), title with the
 * matched words marked, meta, context and excerpt — always in that order, with the same
 * classes. `prototype-shell.css` ("Library search rows") lays the slots out.
 *
 * Secondary slots reuse the `pds-*` roles the route overrides already colour (`pds-caption`,
 * `pds-list-timestamp`, `pds-list-preview`) rather than introducing new ones to fight.
 */
import Icon from '@/components/react/Icon';
import { splitQueryMatches } from '@/utils/search-match-parts';
import type { SearchRowParts } from '../PrototypeSidebarSearchResultItem';
import MatchText from './MatchText';
import {
  buildSearchRowDecor,
  type SearchRowDecor,
  type SearchRowDecorContext,
} from './library-search-row-decor';

export function LibrarySearchRowBody({
  parts,
  decor,
  query,
}: {
  parts: SearchRowParts;
  decor: SearchRowDecor;
  query: string;
}) {
  return (
    <>
      {parts.leadIcon ? (
        <span className="proto-note-row__lead-icon" aria-hidden>
          <Icon name={parts.leadIcon} size={13} />
        </span>
      ) : null}
      <div className="proto-note-row__title-line">
        {parts.pinned ? (
          <span className="proto-note-row__pin" aria-hidden>
            <Icon name="thumbtack" size={12} />
          </span>
        ) : null}
        <span className="pds-list-title proto-note-row__title-text">
          <MatchText parts={splitQueryMatches(parts.title, query)} />
        </span>
        {parts.locked ? (
          <span className="proto-note-row__pin proto-note-row__lock" aria-label="Locked" role="img">
            <Icon name="lock" size={11} aria-hidden />
          </span>
        ) : null}
      </div>
      {decor.meta ? (
        <span className="pds-list-timestamp proto-search-row__meta">{decor.meta}</span>
      ) : null}
      {decor.context ? (
        <span className="pds-caption proto-search-row__context">{decor.context}</span>
      ) : null}
      {decor.excerpt ? (
        <div className="pds-list-preview proto-note-row__preview proto-search-row__excerpt">
          {parts.locked ? decor.excerpt : <MatchText parts={splitQueryMatches(decor.excerpt, query)} />}
        </div>
      ) : null}
    </>
  );
}

/** A `renderBody` for `PrototypeSidebarSearchResultItem`, bound to one group's data. */
export function makeLibrarySearchRowBody(ctx: SearchRowDecorContext) {
  return function renderLibrarySearchRowBody(parts: SearchRowParts) {
    return (
      <LibrarySearchRowBody parts={parts} decor={buildSearchRowDecor(parts, ctx)} query={ctx.query} />
    );
  };
}
