/**
 * Everything you have shared, as one list.
 *
 * Four kinds of sharing that do not look alike from the inside — a public link on a note, a note
 * added to a shared space, the shared spaces themselves, and what you have offered to Discover —
 * and each used to be answerable only from where it was done. This merges them for
 * Settings › Sharing: one list, newest first, narrowed by kind.
 *
 * Pure and structural, like `library-panel/library-all-items.ts`: plain rows in, typed items out,
 * no fetching and no rendering, so the ordering and the filter rules are tested rather than
 * eyeballed.
 */
import type { SharedNoteItem } from '../../../hooks/queries/useMySharing';
import type { OwnedSharedSpaceItem } from '../../../hooks/queries/useMySharedSpaces';
import type { MySharedSpaceNoteItem } from '../../../hooks/queries/useMySharedSpaceNotes';
import type { MyDiscoverSubmission } from '../../../hooks/queries/useDiscoverListings';
import type { ProtoChipOption } from '../components/ProtoChipBar';

export type SharingFilter = 'all' | 'link' | 'space' | 'discover';

type Base = { id: string; title: string; recencyMs: number };

export type SharingItem =
  | (Base & { kind: 'link'; note: SharedNoteItem })
  | (Base & { kind: 'space'; space: OwnedSharedSpaceItem; role: 'owner' | 'member' })
  | (Base & { kind: 'space-note'; spaceNote: MySharedSpaceNoteItem })
  | (Base & { kind: 'discover'; submission: MyDiscoverSubmission });

export type SharingItemKind = SharingItem['kind'];

export const SHARING_FILTERS: ProtoChipOption<SharingFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'link', label: 'Public links' },
  { id: 'space', label: 'Shared spaces' },
  { id: 'discover', label: 'Discover' },
];

/** Tie-break for rows stamped in the same instant — stable, so the list does not shuffle. */
const KIND_ORDER: Record<SharingItemKind, number> = {
  link: 0,
  'space-note': 1,
  space: 2,
  discover: 3,
};

function timeOf(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isoOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function buildSharingItems(input: {
  links?: readonly SharedNoteItem[];
  spaces?: { owned?: readonly OwnedSharedSpaceItem[]; memberOf?: readonly OwnedSharedSpaceItem[] };
  spaceNotes?: readonly MySharedSpaceNoteItem[];
  discover?: readonly MyDiscoverSubmission[];
}): SharingItem[] {
  const items: SharingItem[] = [];

  for (const note of input.links ?? []) {
    items.push({
      id: `link:${note.id}`,
      kind: 'link',
      title: note.title || 'Untitled note',
      recencyMs: timeOf(note.sharedAt ?? note.updatedAt ?? note.createdAt),
      note,
    });
  }

  for (const [role, list] of [
    ['owner', input.spaces?.owned ?? []],
    ['member', input.spaces?.memberOf ?? []],
  ] as const) {
    for (const space of list) {
      items.push({
        id: `space:${space.id}`,
        kind: 'space',
        title: space.title || 'Untitled space',
        recencyMs: timeOf(space.createdAt),
        space,
        role,
      });
    }
  }

  /* Prefixed ids, so a note that is both public and in a space is two rows: they are two
     different things you did, and each has its own way to undo it. */
  for (const spaceNote of input.spaceNotes ?? []) {
    items.push({
      id: `space-note:${spaceNote.spaceId}:${spaceNote.noteId}`,
      kind: 'space-note',
      title: spaceNote.title || 'Untitled note',
      recencyMs: timeOf(spaceNote.addedAt),
      spaceNote,
    });
  }

  for (const submission of input.discover ?? []) {
    /* A superseded row is an older copy a newer submission replaced — the newer row already
       stands for it, and listing both would show one thing twice. */
    if (submission.status === 'superseded') continue;
    items.push({
      id: `discover:${submission.id}`,
      kind: 'discover',
      title: submission.title,
      recencyMs: timeOf(submission.reviewedAt ?? submission.createdAt),
      submission,
    });
  }

  return items.sort(
    (a, b) =>
      b.recencyMs - a.recencyMs ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

/** The Shared spaces chip holds the spaces and the notes you put in them — both are the room. */
export function filterSharingItems(items: readonly SharingItem[], filter: SharingFilter): SharingItem[] {
  switch (filter) {
    case 'all':
      return [...items];
    case 'link':
      return items.filter((item) => item.kind === 'link');
    case 'space':
      return items.filter((item) => item.kind === 'space' || item.kind === 'space-note');
    case 'discover':
      return items.filter((item) => item.kind === 'discover');
  }
}

const DISCOVER_STATUS_LABEL: Record<MyDiscoverSubmission['status'], string> = {
  submitted: 'Waiting',
  listed: 'Shared with everyone',
  declined: 'Not added',
  withdrawn: 'Taken back',
  delisted: 'Removed',
  superseded: 'Replaced',
};

export function discoverStatusLabel(status: MyDiscoverSubmission['status']): string {
  return DISCOVER_STATUS_LABEL[status] ?? status;
}

/**
 * What can still be undone about a submission.
 *
 * Withdrawable while it waits *and* once it is listed — sharing something should be as reversible
 * as it was voluntary. After that there is nothing left to take back.
 */
export function discoverActionFor(status: MyDiscoverSubmission['status']): 'withdraw' | 'stop' | null {
  if (status === 'submitted') return 'withdraw';
  if (status === 'listed') return 'stop';
  return null;
}

/**
 * A row's second line, leading with what kind of sharing it is.
 *
 * The kind comes first because the list mixes four of them, and "Owner · 5 members" or
 * "Waiting" only means something once you know it is a space or a Discover submission.
 */
export function sharingItemMeta(
  item: SharingItem,
  relative: (iso: string | null) => string | null | undefined,
): string[] {
  const parts: Array<string | null | undefined> = (() => {
    switch (item.kind) {
      case 'link':
        return ['Public link', relative(isoOf(item.note.sharedAt ?? item.note.updatedAt ?? item.note.createdAt))];
      case 'space': {
        const count = item.space.memberCount;
        return [
          'Shared space',
          item.role === 'owner' ? 'Owner' : 'Member',
          `${count} ${count === 1 ? 'member' : 'members'}`,
        ];
      }
      case 'space-note':
        return [`In ${item.spaceNote.spaceTitle}`, relative(isoOf(item.spaceNote.addedAt))];
      case 'discover': {
        const { submission } = item;
        return [
          'Discover',
          discoverStatusLabel(submission.status),
          submission.status === 'listed' && submission.installCount > 0
            ? `saved by ${submission.installCount}`
            : null,
          relative(isoOf(submission.reviewedAt ?? submission.createdAt)),
        ];
      }
    }
  })();
  return parts.filter((part): part is string => Boolean(part));
}

export function sharingEmptyCopy(filter: SharingFilter): string {
  switch (filter) {
    case 'all':
      return 'Nothing shared yet. Public links, shared spaces and what you offer to Discover all show up here.';
    case 'link':
      return 'No public links. Use Share on a note to make one.';
    case 'space':
      return 'No shared spaces yet, and no notes added to one.';
    case 'discover':
      return 'Nothing offered to Discover yet. Use Share with others on a note, template or Thread.';
  }
}
