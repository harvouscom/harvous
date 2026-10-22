/**
 * The pieces a Library search result list is assembled from — a titled group, the glyph each
 * kind leads with, and the verb / destination row with its chord.
 *
 * Lifted out of `PrototypeLibrarySearchResults` so the design gallery can draw the same groups
 * without that component's data hooks.
 */
import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoKbdChord from '../ProtoKbdChord';
import type { SidebarSearchResult } from '../sidebar-search-types';

/**
 * A titled group of results.
 *
 * The heading is sticky and carries its own rule, because a result list can run past a
 * screen and a label that scrolls away leaves you reading rows with no idea which group
 * they belong to — the exact question two groups exist to answer.
 *
 * It took `.proto-sidebar-search-section__header` when this was first ported, which was a
 * misnomer twice over: the sidebar had stopped rendering that class, and the treatment
 * (11px uppercase, letter-spaced) was a louder voice than anything else on the surface.
 */
export function ResultGroup({
  heading,
  meta,
  children,
  alwaysLabelled = false,
  count,
}: {
  heading: string;
  /** A small tag after the label — the verse group's translation, which is also its picker. */
  meta?: ReactNode;
  children: ReactNode;
  /** Keep the heading on screen even as the only group — for a heading that says more than
      "these are the results" (the verse group's translation). */
  alwaysLabelled?: boolean;
  /** How many rows the group holds, after the label. */
  count?: number;
}) {
  return (
    <div
      className={`proto-library-results__group${alwaysLabelled ? ' proto-library-results__group--labelled' : ''}`}
    >
      <h3 className="proto-library-results__heading">
        <span className="proto-library-results__heading-text">{heading}</span>
        {/* Hidden from the heading's name: "My Home", not "My Home 3" — the list itself says how
            many rows follow. Nothing on an empty group, which has its own empty state. */}
        {count ? (
          <span className="proto-library-results__heading-count" aria-hidden>
            {count}
          </span>
        ) : null}
        {typeof meta === 'string' ? (
          <span className="proto-library-results__heading-meta">{meta}</span>
        ) : (
          meta ?? null
        )}
      </h3>
      {children}
    </div>
  );
}

/**
 * The glyph each kind leads with — the browse list's own table (`PrototypeLibraryAllView`),
 * so a row looks the same before and after you type. Search used to draw a smaller glyph
 * inline with the title, and only for some kinds, so the list had no left edge: folders were
 * marked, notes were not, and the text started at three different places.
 */
export function resultLeadIcon(result: SidebarSearchResult): IconName {
  switch (result.kind) {
    case 'note':
      return 'note-sticky';
    case 'folder':
      return 'folder';
    case 'threadCluster':
      return 'arrow-right-arrow-left';
    case 'highlight':
      return 'highlighter';
    case 'scriptureBook':
      return 'book';
    case 'scripturePassage':
    case 'scriptureReference':
      return 'book-open';
    case 'resource':
      return 'newspaper';
    default:
      return 'note-sticky';
  }
}

/** A row that runs a verb or goes somewhere, with its chord printed on the right. */
export function ChordRow({
  icon,
  label,
  keys,
  onActivate,
  kind = 'command',
}: {
  icon: string;
  label: string;
  keys?: string;
  onActivate: () => void;
  /** A verb that acts here, or a destination that takes you somewhere. */
  kind?: 'command' | 'destination';
}) {
  return (
    <li className="proto-note-row-item" data-kind={kind}>
      <button type="button" className="proto-note-row__main proto-note-row__main--lead" onClick={onActivate}>
        <span className="proto-note-row__lead-icon" aria-hidden>
          {/* Commands and navigation items both carry their glyph as a plain string —
              `PrototypeCommand.icon` is a table entry, not a typed name. */}
          <Icon name={icon as IconName} size={13} />
        </span>
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{label}</span>
          {keys ? <ProtoKbdChord keys={keys} compact /> : null}
        </div>
      </button>
    </li>
  );
}

