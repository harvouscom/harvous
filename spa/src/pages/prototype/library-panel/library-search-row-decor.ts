/**
 * The extra things a search row can say once it has room to say them: where the item lives,
 * a right-hand meta (time for things you wrote, a count for places you go), and an excerpt
 * cut around the matched word rather than the item's first line.
 *
 * Pure, and built only from data the panel already holds: the loaded note list, the server's
 * full-text hits and the highlight rows. Nothing here fetches. Drawn by `LibrarySearchRowBody`
 * in the Library panel's search results; the sidebar's search does not use it.
 */
import type { SearchResult } from '@/hooks/useSearch';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { excerptAroundMatch } from '@/utils/search-match-parts';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { SearchRowParts } from '../PrototypeSidebarSearchResultItem';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import { isScripturePassageHighlightRow } from '../proto-highlight-subtitle';
import type { SidebarSearchResultKind } from '../sidebar-search-types';

export type SearchRowDecorContext = {
  query: string;
  notesById: ReadonlyMap<string, SpaceNoteRow>;
  highlightsById: ReadonlyMap<string, PrototypeHighlightStudyThreadRow>;
  /** Server full-text hits by note id — the only source for a note the list has not loaded. */
  ftsHitsById?: ReadonlyMap<string, SearchResult>;
};

export type SearchRowDecor = {
  /** Where it lives: the folder, or the note a highlight was made in. */
  context?: string;
  /** Right-hand meta. */
  meta?: string;
  /** The line under the title. */
  excerpt?: string;
  /** A place you go (folder, Thread, book, passage, resource) rather than something you wrote. */
  place: boolean;
};

/** Kinds that are destinations — the "places" half of direction E. */
const PLACE_KINDS: ReadonlySet<SidebarSearchResultKind> = new Set([
  'folder',
  'threadCluster',
  'scriptureBook',
  'scripturePassage',
  'scriptureReference',
  'resource',
]);

export function isPlaceKind(kind: SidebarSearchResultKind): boolean {
  return PLACE_KINDS.has(kind);
}

/** How much of a body is searched for the match. List content is capped server-side anyway. */
const EXCERPT_SOURCE_CHARS = 2000;

function joinContext(...parts: Array<string | null | undefined>): string | undefined {
  const kept = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(' › ') : undefined;
}

function noteDecor(parts: SearchRowParts, ctx: SearchRowDecorContext): SearchRowDecor {
  const noteId = parts.result.noteId;
  const loaded = noteId ? ctx.notesById.get(noteId) : undefined;
  const hit = noteId ? ctx.ftsHitsById?.get(noteId) : undefined;
  const meta = parts.rel || protoRelativeCaptionAbbrev(hit?.lastUpdated) || undefined;
  /* Somebody else's note in a shared room is told apart by who wrote it, first. */
  const author = loaded?.isOwnNote === false ? loaded.authorDisplayName : undefined;
  const context = joinContext(
    author,
    loaded?.primaryCollection ?? hit?.primaryCollection,
  );
  if (parts.locked) return { context, meta, excerpt: 'Locked', place: false };
  const body = loaded?.content ?? hit?.content ?? '';
  const text = body ? stripHtmlForListPreview(body, EXCERPT_SOURCE_CHARS) : '';
  const excerpt = (text && excerptAroundMatch(text, ctx.query)) || parts.preview;
  return { context, meta, excerpt, place: false };
}

function highlightDecor(parts: SearchRowParts, ctx: SearchRowDecorContext): SearchRowDecor {
  const row = parts.result.highlightId ? ctx.highlightsById.get(parts.result.highlightId) : undefined;
  if (!row) return { meta: parts.rel, excerpt: parts.preview, place: false };
  const context =
    row.entryKind === 'linkedNote' && row.linkedNoteTitle
      ? joinContext(row.parentNoteTitle, row.linkedNoteTitle)
      : isScripturePassageHighlightRow(row)
        ? joinContext(row.scriptureReference, row.parentNoteTitle)
        : joinContext(row.parentNoteTitle);
  /* The annotation you wrote on it, which is the part a quote-title cannot show. */
  const mini = (row.miniNoteBody ?? '').trim();
  const excerpt = mini ? (excerptAroundMatch(mini, ctx.query) ?? mini) : undefined;
  return { context, meta: parts.rel, excerpt, place: false };
}

export function buildSearchRowDecor(parts: SearchRowParts, ctx: SearchRowDecorContext): SearchRowDecor {
  switch (parts.result.kind) {
    case 'note':
      return noteDecor(parts, ctx);
    case 'highlight':
      return highlightDecor(parts, ctx);
    case 'resource':
      /* Its subtitle is the site, which is where it lives rather than how big it is. */
      return { context: parts.preview, place: true };
    case 'folder':
    case 'threadCluster':
    case 'scriptureBook':
    case 'scripturePassage':
    case 'scriptureReference':
      /* "12 notes", "3 passages · 8 notes", "Read passage" — a count or a verb, not prose. */
      return { meta: parts.preview, place: true };
    default:
      return { excerpt: parts.preview, place: false };
  }
}
