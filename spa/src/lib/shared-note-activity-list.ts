import type { NoteActivityWireGroup, NoteActivityWireItem } from '../hooks/queries/useNoteActivity';

export type NoteActivityKind = 'highlight' | 'response' | 'connection';

/** Inspector display model. This intentionally stays separate from the API wire shape. */
export type NoteActivityItem = {
  id: string;
  kind: NoteActivityKind;
  entryKind: string;
  actorDisplayName: string;
  actorUserId: string;
  actorColor: string;
  actorFirstName: string | null;
  actorProfileImageUrl: string | null;
  isSelf: boolean;
  timestamp: string;
  subject: string;
  preview: string | null;
  context: string | null;
  statusLabel: string | null;
  highlightAccentRaw: string;
  focusTitle: string;
  notesBody: string;
  miniNoteBody: string;
  anchor: {
    quote: string | null;
    prefixContext: string;
    suffixContext: string;
    status: string;
    start: number | null;
    end: number | null;
  };
};

export type NoteActivityGroup = {
  spaceId: string;
  spaceTitle: string;
  associationStatus: 'active' | 'archived';
  items: NoteActivityItem[];
};

export function noteActivityKindLabel(kind: NoteActivityKind): string {
  switch (kind) {
    case 'response':
      return 'Response';
    case 'connection':
      return 'Connection';
    case 'highlight':
    default:
      return 'Highlight';
  }
}

function activityKindFromEntry(entryKind: string): NoteActivityKind {
  if (entryKind === 'linkedNote') return 'connection';
  if (entryKind === 'miniNote') return 'response';
  return 'highlight';
}

function activityPreview(
  item: NoteActivityWireItem,
  stripHtml: (html: string, max: number) => string,
): string | null {
  const body = item.miniNoteBody || item.notesBody || item.focusTitle || '';
  const text = body.includes('<') ? stripHtml(body, 120) : body.trim();
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

type ActivityAnchorSource = {
  id: string;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  anchorTextSnapshot?: string | null;
  sourceSnippet?: string | null;
};

function anchorKey(entry: ActivityAnchorSource): string {
  const quote = (entry.anchorTextSnapshot ?? entry.sourceSnippet ?? '').trim();
  if (quote) return `quote:${quote}`;
  if (entry.anchorLocation != null && entry.anchorLength) {
    return `range:${entry.anchorLocation}:${entry.anchorLength}`;
  }
  return `id:${entry.id}`;
}

/** The single legacy-anchor matcher retained for overlay/list compatibility tests. */
export function sharedNoteAnchorsMatch(left: ActivityAnchorSource, right: ActivityAnchorSource): boolean {
  return anchorKey(left) === anchorKey(right);
}

/**
 * Adapts grouped server Activity into inspector rows without re-sorting or
 * recomputing overlap/detached state. The server owns order and grouping.
 */
export function buildSharedNoteActivityGroups(
  groups: NoteActivityWireGroup[] | undefined,
  options: {
    noteAuthorUserId?: string | null;
    viewerUserId?: string | null;
    noteAuthorDisplayName?: string | null;
    stripHtml: (html: string, max: number) => string;
  },
): NoteActivityGroup[] {
  const authorLabel = options.noteAuthorDisplayName?.trim() || 'The author';
  const viewerIsAuthor =
    Boolean(options.viewerUserId) &&
    Boolean(options.noteAuthorUserId) &&
    options.viewerUserId === options.noteAuthorUserId;
  const authorOverlapCopy = viewerIsAuthor
    ? 'You also highlighted this passage'
    : `${authorLabel} also highlighted this passage`;

  return (groups ?? [])
    .map((group) => ({
      spaceId: group.spaceId,
      spaceTitle: group.spaceTitle,
      associationStatus: group.associationStatus,
      items: group.items.map((item) => {
        const quote = item.anchor.quote?.trim() || null;
        return {
          id: item.id,
          kind: activityKindFromEntry(item.entryKind),
          entryKind: item.entryKind,
          actorDisplayName: item.actorDisplayName.trim() || 'Former member',
          actorUserId: item.actorUserId,
          actorColor: item.actorColor,
          actorFirstName: item.actorFirstName ?? null,
          actorProfileImageUrl: item.actorProfileImageUrl ?? null,
          isSelf: Boolean(options.viewerUserId && item.actorUserId === options.viewerUserId),
          timestamp: item.updatedAt ?? item.createdAt,
          subject: quote || item.focusTitle.trim() || 'Highlighted passage',
          preview: activityPreview(item, options.stripHtml),
          context: item.overlapsAuthorResponseIds.length > 0 ? authorOverlapCopy : null,
          statusLabel: item.anchor.status === 'detached' ? 'Passage changed' : null,
          highlightAccentRaw: item.highlightAccentRaw,
          focusTitle: item.focusTitle,
          notesBody: item.notesBody,
          miniNoteBody: item.miniNoteBody,
          anchor: {
            quote,
            prefixContext: item.anchor.prefixContext,
            suffixContext: item.anchor.suffixContext,
            status: item.anchor.status,
            start: item.anchor.start,
            end: item.anchor.end,
          },
        };
      }),
    }))
    .filter((group) => group.items.length > 0);
}
