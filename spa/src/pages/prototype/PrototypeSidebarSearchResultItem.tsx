import Icon from '@/components/react/Icon';
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

export type PrototypeSidebarSearchResultItemProps = {
  result: SidebarSearchResult;
  active?: boolean;
  onActivate: () => void;
  notesById: Map<string, SpaceNoteRow>;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  /* Only notes and highlights answer this. A folder or a book result is a
     place you go, not a thing you act on in bulk from here. */
  selection?: SearchResultSelection;
};

export default function PrototypeSidebarSearchResultItem({
  result,
  active = false,
  onActivate,
  notesById,
  highlightsById,
  selection,
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
        />
      );
    case 'folder':
    case 'threadCluster':
    case 'scriptureBook':
    case 'scriptureReference':
      return (
        <InlineKindSearchResultItem result={result} active={active} onActivate={onActivate} />
      );
    case 'scripturePassage':
      return <ScripturePassageSearchResultItem result={result} active={active} onActivate={onActivate} />;
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
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  notesById: Map<string, SpaceNoteRow>;
  selection?: SearchResultSelection;
}) {
  const loaded = result.noteId ? notesById.get(result.noteId) : undefined;
  const title =
    stripServerAutoUntitledNoteTitleForDisplay(loaded?.title ?? result.title) || 'New Note';
  const iso = loaded?.updatedAt ?? loaded?.createdAt ?? null;
  const rel = iso ? protoRelativeCaptionAbbrev(iso) : undefined;
  const preview =
    result.ftsExcerpt ??
    (loaded?.content ? stripHtmlForListPreview(loaded.content, 80) : result.subtitle) ??
    undefined;
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
    >
      {pick ? <ProtoRowSelectCheckbox {...pick.checkbox} /> : null}
      <button
        type="button"
        className="proto-note-row__main"
        onClick={(e) => {
          if (pick && (e.metaKey || e.ctrlKey)) return pick.checkbox.onToggle();
          if (pick?.selectMode) return pick.checkbox.onToggle();
          onActivate();
        }}
      >
        <div className="proto-note-row__title-line">
          {pinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={12} />
            </span>
          ) : null}
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <SearchRecencyPreview rel={rel} preview={preview || undefined} />
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
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  selection?: SearchResultSelection;
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
    >
      {pick ? <ProtoRowSelectCheckbox {...pick.checkbox} /> : null}
      <button
        type="button"
        className="proto-note-row__main"
        onClick={(e) => {
          if (pick && (e.metaKey || e.ctrlKey)) return pick.checkbox.onToggle();
          if (pick?.selectMode) return pick.checkbox.onToggle();
          onActivate();
        }}
        aria-label={`${highlightEntryKindAriaLabel(entryKind)}: ${title}`}
      >
        <div className="proto-note-row__title-line">
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name={kindIcon} size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <SearchRecencyPreview rel={rel} preview={preview} />
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
    default:
      return 'folder';
  }
}

function InlineKindSearchResultItem({
  result,
  active,
  onActivate,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
}) {
  const iconName = collectionIconName(result.kind);
  return (
    <li className="proto-note-row-item" data-active={active ? 'true' : 'false'}>
      <button type="button" className="proto-note-row__main" onClick={onActivate}>
        <div className="proto-note-row__title-line">
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name={iconName} size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{result.title}</span>
        </div>
        {result.subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">{result.subtitle}</div>
        ) : null}
      </button>
    </li>
  );
}

function ScripturePassageSearchResultItem({
  result,
  active,
  onActivate,
}: {
  result: SidebarSearchResult;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <li className="proto-note-row-item" data-active={active ? 'true' : 'false'}>
      <button type="button" className="proto-note-row__main" onClick={onActivate}>
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{result.title}</span>
        </div>
        {result.subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">{result.subtitle}</div>
        ) : null}
      </button>
    </li>
  );
}
