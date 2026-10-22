import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import ProtoRowSelectCheckbox from './ProtoRowSelectCheckbox';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { protoRelativeCaptionAbbrev } from './proto-time';
import {
  highlightEntryKindAriaLabel,
  highlightEntryKindIconName,
  prototypeHighlightRecencyIso,
} from './proto-highlight-subtitle';
import type { SidebarSearchResult } from './sidebar-search-types';

function SearchRecencyPreview({ rel, preview }: { rel?: string; preview?: string }) {
  if (!rel && !preview) return null;
  return (
    <div className="pds-list-preview proto-note-row__preview">
      {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
      {rel && preview ? '  ' : null}
      {preview ? <span>{preview}</span> : null}
    </div>
  );
}

/**
 * What a row has already worked out about itself, handed to `renderBody`.
 *
 * The row keeps everything that makes it a row — the `<li>`, the real `<button>`, the
 * selection orb, the click rules, the accessible name — and lends out only what goes *inside*
 * the button. That is the part the Library panel's design directions differ on.
 */
export type SearchRowParts = {
  result: SidebarSearchResult;
  leadIcon?: IconName;
  title: string;
  /** Relative time, already abbreviated ("2d"). */
  rel?: string;
  /** The preview this row would show today, before any direction re-cuts it. */
  preview?: string;
  pinned: boolean;
  locked: boolean;
};

export type PrototypeSidebarSearchResultItemProps = {
  result: SidebarSearchResult;
  active?: boolean;
  onActivate: () => void;
  notesById: Map<string, SpaceNoteRow>;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  /* Only notes and highlights answer this. A folder or a book result is a
     place you go, not a thing you act on in bulk from here. */
  selection?: SearchResultSelection;
  /**
   * A glyph in a column of its own, left of the text.
   *
   * Off by default, which keeps the sidebar's search results exactly as they were. The
   * library panel's "Everything" tab turns it on: that list interleaves every kind by
   * recency, so a reader needs to know *what* each row is before reading it, and the tabs it
   * mixes together each lead with this glyph on their own screen. A folder that looks like a
   * folder on the Folders tab should not become an unmarked line here.
   */
  leadIcon?: IconName;
  /**
   * Draw the inside of the button some other way — the Library panel's tile rows
   * (`LibrarySearchRowBody`). Without it the markup is the sidebar's own, unchanged.
   */
  renderBody?: (parts: SearchRowParts) => ReactNode;
};

export default function PrototypeSidebarSearchResultItem({
  result,
  active = false,
  onActivate,
  notesById,
  highlightsById,
  selection,
  leadIcon,
  renderBody,
}: PrototypeSidebarSearchResultItemProps) {
  switch (result.kind) {
    case 'note':
      return (
        <NoteSearchResultItem
          result={result}
          active={active}
          onActivate={onActivate}
          notesById={notesById}
          selection={selection}
          leadIcon={leadIcon}
          renderBody={renderBody}
        />
      );
    case 'highlight':
      return (
        <HighlightSearchResultItem
          result={result}
          active={active}
          onActivate={onActivate}
          highlightsById={highlightsById}
          selection={selection}
          leadIcon={leadIcon}
          renderBody={renderBody}
        />
      );
    case 'folder':
    case 'threadCluster':
    case 'scriptureBook':
    case 'scriptureReference':
    /* Only the Library panel's All tab produces one — the sidebar's search has no
       Resources scope — but it renders as the same titled, glyphed row as the rest. */
    case 'resource':
      return (
        <InlineKindSearchResultItem
          result={result}
          active={active}
          onActivate={onActivate}
          leadIcon={leadIcon}
          renderBody={renderBody}
        />
      );
    case 'scripturePassage':
      return (
        <ScripturePassageSearchResultItem
          result={result}
          active={active}
          onActivate={onActivate}
          leadIcon={leadIcon}
          renderBody={renderBody}
        />
      );
    default:
      return null;
  }
}

function NoteSearchResultItem({
  result,
  active,
  onActivate,
  notesById,
  selection,
  leadIcon,
  renderBody,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  notesById: Map<string, SpaceNoteRow>;
  selection?: SearchResultSelection;
  leadIcon?: IconName;
  renderBody?: (parts: SearchRowParts) => ReactNode;
}) {
  const loaded = result.noteId ? notesById.get(result.noteId) : undefined;
  const title =
    stripServerAutoUntitledNoteTitleForDisplay(loaded?.title ?? result.title) || 'New Note';
  const iso = loaded?.updatedAt ?? loaded?.createdAt ?? null;
  const rel = iso ? protoRelativeCaptionAbbrev(iso) : undefined;
  const locked = loaded?.contentEncrypted === true;
  const preview =
    locked
      ? 'Locked'
      : (result.ftsExcerpt ??
        (loaded?.content ? stripHtmlForListPreview(loaded.content, 80) : result.subtitle) ??
        undefined);
  const pinned = loaded?.isPinned === true;

  const pick = result.noteId ? selection?.for('note', result.noteId, title) : null;

  return (
    <li
      className={[
        'proto-note-row-item',
        pick?.selectMode ? 'proto-note-row-item--selectable' : '',
        pick?.selected ? 'proto-note-row-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-active={pick?.selectMode ? (pick.selected ? 'true' : 'false') : active ? 'true' : 'false'}
      data-kind={renderBody ? result.kind : undefined}
    >
      {pick ? <ProtoRowSelectCheckbox {...pick.checkbox} /> : null}
      <button
        type="button"
        className={`proto-note-row__main${leadIcon ? ' proto-note-row__main--lead' : ''}`}
        onClick={(e) => {
          if (pick && (e.metaKey || e.ctrlKey)) return pick.checkbox.onToggle();
          if (pick?.selectMode) return pick.checkbox.onToggle();
          onActivate();
        }}
      >
        {renderBody ? (
          renderBody({ result, leadIcon, title, rel, preview: preview || undefined, pinned, locked })
        ) : (
        <>
        {leadIcon ? (
          <span className="proto-note-row__lead-icon" aria-hidden>
            <Icon name={leadIcon} size={13} />
          </span>
        ) : null}
        <div className="proto-note-row__title-line">
          {pinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={12} />
            </span>
          ) : null}
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
          {locked ? (
            <span className="proto-note-row__pin proto-note-row__lock" aria-label="Locked" role="img">
              <Icon name="lock" size={11} aria-hidden />
            </span>
          ) : null}
        </div>
        <SearchRecencyPreview rel={rel} preview={preview || undefined} />
        </>
        )}
      </button>
    </li>
  );
}

function HighlightSearchResultItem({
  result,
  active,
  onActivate,
  highlightsById,
  selection,
  leadIcon,
  renderBody,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  selection?: SearchResultSelection;
  leadIcon?: IconName;
  renderBody?: (parts: SearchRowParts) => ReactNode;
}) {
  const row = result.highlightId ? highlightsById.get(result.highlightId) : undefined;
  const entryKind = row?.entryKind ?? result.highlightEntryKind;
  const title = result.title;
  const preview = result.subtitle;
  const iso = row ? prototypeHighlightRecencyIso(row) : null;
  const rel = iso ? protoRelativeCaptionAbbrev(iso) : undefined;
  const kindIcon = highlightEntryKindIconName(entryKind);

  const pick = result.highlightId
    ? selection?.for('highlight', result.highlightId, title)
    : null;

  return (
    <li
      className={[
        'proto-note-row-item',
        pick?.selectMode ? 'proto-note-row-item--selectable' : '',
        pick?.selected ? 'proto-note-row-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-active={pick?.selectMode ? (pick.selected ? 'true' : 'false') : active ? 'true' : 'false'}
      data-kind={renderBody ? result.kind : undefined}
    >
      {pick ? <ProtoRowSelectCheckbox {...pick.checkbox} /> : null}
      <button
        type="button"
        className={`proto-note-row__main${leadIcon ? ' proto-note-row__main--lead' : ''}`}
        onClick={(e) => {
          if (pick && (e.metaKey || e.ctrlKey)) return pick.checkbox.onToggle();
          if (pick?.selectMode) return pick.checkbox.onToggle();
          onActivate();
        }}
        aria-label={`${highlightEntryKindAriaLabel(entryKind)}: ${title}`}
      >
        {renderBody ? (
          renderBody({ result, leadIcon, title, rel, preview, pinned: false, locked: false })
        ) : (
        <>
        {leadIcon ? (
          <span className="proto-note-row__lead-icon" aria-hidden>
            <Icon name={leadIcon} size={13} />
          </span>
        ) : null}
        <div className="proto-note-row__title-line">
          {leadIcon ? null : (
            <span className="proto-note-row__kind-icon" aria-hidden>
              <Icon name={kindIcon} size={11} />
            </span>
          )}
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <SearchRecencyPreview rel={rel} preview={preview} />
        </>
        )}
      </button>
    </li>
  );
}

/**
 * How a search result asks whether it may be selected, and how.
 *
 * Passed down rather than read from the shell here so this file stays a
 * presenter: the sidebar owns which kind is selectable and what a range means
 * over the flat result order, and answers `null` for the kinds that only drill.
 */
export type SearchResultSelection = {
  for: (
    kind: 'note' | 'highlight',
    id: string,
    label: string,
  ) => {
    selectMode: boolean;
    selected: boolean;
    checkbox: { selected: boolean; label: string; onToggle: () => void };
  } | null;
};

function collectionIconName(kind: SidebarSearchResult['kind']): string {
  switch (kind) {
    case 'folder':
      return 'folder';
    case 'threadCluster':
      return 'arrow-right-arrow-left';
    case 'scriptureBook':
      return 'book';
    case 'scriptureReference':
      return 'book-open';
    case 'resource':
      /* Matches the sidebar's Resources list mode, so the same shelf wears one glyph. */
      return 'newspaper';
    default:
      return 'folder';
  }
}

function InlineKindSearchResultItem({
  result,
  active,
  onActivate,
  leadIcon,
  renderBody,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  leadIcon?: IconName;
  renderBody?: (parts: SearchRowParts) => ReactNode;
}) {
  const iconName = collectionIconName(result.kind);
  return (
    <li
      className="proto-note-row-item"
      data-active={active ? 'true' : 'false'}
      data-kind={renderBody ? result.kind : undefined}
    >
      <button
        type="button"
        className={`proto-note-row__main${leadIcon ? ' proto-note-row__main--lead' : ''}`}
        onClick={onActivate}
      >
        {renderBody ? (
          renderBody({
            result,
            leadIcon,
            title: result.title,
            preview: result.subtitle,
            pinned: false,
            locked: false,
          })
        ) : (
        <>
        {/* The same glyph, moved out of the sentence and into its own column. Inline it had
            to share the baseline with the title and shrink to 11px to manage it; leading, it
            sits where this kind's own tab puts it. */}
        {leadIcon ? (
          <span className="proto-note-row__lead-icon" aria-hidden>
            <Icon name={leadIcon} size={13} />
          </span>
        ) : null}
        <div className="proto-note-row__title-line">
          {leadIcon ? null : (
            <span className="proto-note-row__kind-icon" aria-hidden>
              <Icon name={iconName} size={11} />
            </span>
          )}
          <span className="pds-list-title proto-note-row__title-text">{result.title}</span>
        </div>
        {result.subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">{result.subtitle}</div>
        ) : null}
        </>
        )}
      </button>
    </li>
  );
}

/**
 * A chapter to open, rather than something already written.
 *
 * Carries the book icon so it reads as a destination among rows that are otherwise notes and
 * folders — this is the one result that is not a thing you own but a place you can go.
 */
function ScripturePassageSearchResultItem({
  result,
  active,
  onActivate,
  leadIcon,
  renderBody,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  leadIcon?: IconName;
  renderBody?: (parts: SearchRowParts) => ReactNode;
}) {
  return (
    <li
      className="proto-note-row-item"
      data-active={active ? 'true' : 'false'}
      data-kind={renderBody ? result.kind : undefined}
    >
      <button
        type="button"
        className={`proto-note-row__main${leadIcon ? ' proto-note-row__main--lead' : ''}`}
        onClick={onActivate}
      >
        {renderBody ? (
          renderBody({
            result,
            leadIcon,
            title: result.title,
            preview: result.subtitle,
            pinned: false,
            locked: false,
          })
        ) : (
        <>
        {leadIcon ? (
          <span className="proto-note-row__lead-icon" aria-hidden>
            <Icon name={leadIcon} size={13} />
          </span>
        ) : null}
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{result.title}</span>
        </div>
        {result.subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">{result.subtitle}</div>
        ) : null}
        </>
        )}
      </button>
    </li>
  );
}
