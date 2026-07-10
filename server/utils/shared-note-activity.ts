export type SharedNoteActivityAssociation = {
  spaceId: string;
  removedAt: Date | null;
};

export type SharedNoteActivitySpace = {
  id: string;
  title: string;
  type: string;
};

export type SharedNoteActivityEntry = {
  id: string;
  userId: string;
  parentNoteId: string;
  spaceId: string | null;
  entryKindRaw: string;
  highlightAccentRaw: string;
  focusTitle: string;
  notesBody: string;
  miniNoteBody: string;
  anchorQuote: string | null;
  anchorPrefixContext: string | null;
  anchorSuffixContext: string | null;
  anchorStatus: string;
  resolvedAnchorStart: number | null;
  resolvedAnchorEnd: number | null;
  anchorDetachedAt: Date | null;
  actorDisplayNameSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export type SharedNoteActivityAuthor = {
  displayName: string;
  userColor: string;
  firstName?: string | null;
  profileImageUrl?: string | null;
};

export type SharedNoteActivityItem = {
  id: string;
  actorUserId: string;
  actorDisplayName: string;
  actorColor: string;
  actorFirstName: string | null;
  actorProfileImageUrl: string | null;
  entryKind: string;
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
    detachedAt: Date | null;
  };
  overlapsAuthorResponseIds: string[];
  createdAt: Date;
  updatedAt: Date | null;
};

export type SharedNoteActivityGroup = {
  spaceId: string;
  spaceTitle: string;
  associationStatus: 'active' | 'archived';
  items: SharedNoteActivityItem[];
};

function rangesOverlap(
  left: Pick<SharedNoteActivityEntry, 'resolvedAnchorStart' | 'resolvedAnchorEnd'>,
  right: Pick<SharedNoteActivityEntry, 'resolvedAnchorStart' | 'resolvedAnchorEnd'>,
): boolean {
  if (
    left.resolvedAnchorStart == null ||
    left.resolvedAnchorEnd == null ||
    right.resolvedAnchorStart == null ||
    right.resolvedAnchorEnd == null
  ) {
    return false;
  }
  return left.resolvedAnchorStart < right.resolvedAnchorEnd && right.resolvedAnchorStart < left.resolvedAnchorEnd;
}

/**
 * Builds a body-free activity view. The note author's own responses are overlap
 * context only; they never become primary activity items.
 */
export function buildSharedNoteActivity(input: {
  noteId: string;
  noteAuthorId: string;
  contextSpaceId: string | null;
  associations: SharedNoteActivityAssociation[];
  spaces: SharedNoteActivitySpace[];
  entries: SharedNoteActivityEntry[];
  authors: Record<string, SharedNoteActivityAuthor>;
}): SharedNoteActivityGroup[] {
  const associationBySpace = new Map(input.associations.map((row) => [row.spaceId, row]));
  const spaceById = new Map(input.spaces.map((row) => [row.id, row]));
  const relevantSpaceIds = input.contextSpaceId
    ? new Set([input.contextSpaceId])
    : new Set(input.associations.map((row) => row.spaceId));
  const entries = input.entries.filter(
    (row) =>
      row.parentNoteId === input.noteId &&
      row.spaceId != null &&
      relevantSpaceIds.has(row.spaceId) &&
      associationBySpace.has(row.spaceId),
  );
  const authorEntriesBySpace = new Map<string, SharedNoteActivityEntry[]>();
  for (const row of entries) {
    if (row.userId !== input.noteAuthorId || !row.spaceId) continue;
    const list = authorEntriesBySpace.get(row.spaceId) ?? [];
    list.push(row);
    authorEntriesBySpace.set(row.spaceId, list);
  }

  const groups = new Map<string, SharedNoteActivityGroup>();
  for (const row of entries) {
    if (!row.spaceId || row.userId === input.noteAuthorId) continue;
    const association = associationBySpace.get(row.spaceId);
    const space = spaceById.get(row.spaceId);
    if (!association || !space) continue;
    if (input.contextSpaceId && association.removedAt !== null) continue;

    let group = groups.get(row.spaceId);
    if (!group) {
      group = {
        spaceId: row.spaceId,
        spaceTitle: space.title,
        associationStatus: association.removedAt === null ? 'active' : 'archived',
        items: [],
      };
      groups.set(row.spaceId, group);
    }

    const liveAuthor = input.authors[row.userId];
    group.items.push({
      id: row.id,
      actorUserId: row.userId,
      actorDisplayName: liveAuthor?.displayName ?? row.actorDisplayNameSnapshot?.trim() ?? 'Former member',
      actorColor: liveAuthor?.userColor ?? 'blue',
      actorFirstName: liveAuthor?.firstName ?? null,
      actorProfileImageUrl: liveAuthor?.profileImageUrl ?? null,
      entryKind: row.entryKindRaw,
      highlightAccentRaw: row.highlightAccentRaw,
      focusTitle: row.focusTitle,
      notesBody: row.notesBody,
      miniNoteBody: row.miniNoteBody,
      anchor: {
        quote: row.anchorQuote,
        prefixContext: row.anchorPrefixContext ?? '',
        suffixContext: row.anchorSuffixContext ?? '',
        status: row.anchorStatus,
        start: row.resolvedAnchorStart,
        end: row.resolvedAnchorEnd,
        detachedAt: row.anchorDetachedAt,
      },
      overlapsAuthorResponseIds: (authorEntriesBySpace.get(row.spaceId) ?? [])
        .filter((authorRow) => rangesOverlap(row, authorRow))
        .map((authorRow) => authorRow.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort(
        (left, right) =>
          (right.updatedAt ?? right.createdAt).getTime() - (left.updatedAt ?? left.createdAt).getTime(),
      ),
    }))
    .sort((left, right) => {
      if (left.associationStatus !== right.associationStatus) return left.associationStatus === 'active' ? -1 : 1;
      return left.spaceTitle.localeCompare(right.spaceTitle);
    });
}
