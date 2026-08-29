/**
 * The Library's "All" tab — everything you have, newest first.
 *
 * One row per *thing*, not per event. That is the distinction from the study feed, which
 * answers "what did I do" and therefore shows the same note three times as created,
 * updated, and revisited. This answers "what have I got", so a note is one row no matter
 * how many times it has been touched.
 *
 * Pure and structural on purpose: it takes plain shapes rather than `SpaceNoteRow` /
 * `StudyThreadCluster` / `LibraryItem`, so it can be reasoned about and tested without a
 * query client, and so a change to any of those row types cannot silently change what the
 * tab shows.
 */

export type LibraryAllItemKind = 'note' | 'highlight' | 'thread' | 'scriptureBook' | 'resource';

export type LibraryAllItem = {
  /**
   * `${kind}:${sourceId}` — both the dedup key and the React key.
   *
   * The prefix is load-bearing rather than decorative: a personal thread cluster's id
   * *is* the id of its representative note, so keying on the bare id would have one of
   * the two silently swallow the other.
   */
  id: string;
  kind: LibraryAllItemKind;
  /** The id to look the real row back up by when rendering. */
  sourceId: string;
  recencyMs: number;
  title: string;
  subtitle?: string;
  /** Scripture opens at a book rather than by id, so the ordinal rides along. */
  scriptureBookOrder?: number;
  /** Highlights carry their entry kind through to the row's glyph. */
  highlightEntryKind?: string | null;
};

/** Fixed order for the tie-break, so equal timestamps never reshuffle between renders. */
const KIND_ORDER: LibraryAllItemKind[] = [
  'note',
  'highlight',
  'thread',
  'scriptureBook',
  'resource',
];

type Timestamped = string | Date | null | undefined;

function toMs(value: Timestamped): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** The newest of several candidate timestamps, or null when none parse. */
function newestMs(...values: Timestamped[]): number | null {
  let best: number | null = null;
  for (const value of values) {
    const ms = toMs(value);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best;
}

export type LibraryAllInput = {
  notes: readonly {
    id: string;
    title?: string | null;
    updatedAt?: Timestamped;
    createdAt?: Timestamped;
  }[];
  highlights: readonly {
    id: string;
    title: string;
    subtitle?: string;
    entryKind?: string | null;
    /** Already resolved by `prototypeHighlightRecencyIso` at the call site. */
    recencyIso?: Timestamped;
  }[];
  threads: readonly {
    id: string;
    title: string;
    subtitle?: string;
    updatedAt?: Timestamped;
  }[];
  scriptureBooks: readonly {
    bookOrder: number;
    title: string;
    subtitle?: string;
    /** A book carries no timestamp of its own — it inherits its passages' newest note. */
    passages: readonly {
      notes: readonly { updatedAt?: Timestamped; createdAt?: Timestamped }[];
    }[];
  }[];
  resources: readonly {
    id: string;
    title: string;
    subtitle?: string;
    updatedAt?: Timestamped;
    createdAt?: Timestamped;
  }[];
  /** Applied after sorting. Omit to return everything. */
  limit?: number;
};

export function buildLibraryAllItems(input: LibraryAllInput): LibraryAllItem[] {
  const items: LibraryAllItem[] = [];

  const push = (item: LibraryAllItem | null) => {
    if (item) items.push(item);
  };

  for (const note of input.notes) {
    /*
     * Deliberately not `sortNotesByLastUpdated`, which puts pinned notes first. A pinned
     * note from March heading a list that claims to be recent is exactly the lie this tab
     * must not tell — pinning is an opinion about importance, not about recency.
     */
    const recencyMs = newestMs(note.updatedAt, note.createdAt);
    if (recencyMs === null) continue;
    push({
      id: `note:${note.id}`,
      kind: 'note',
      sourceId: note.id,
      recencyMs,
      title: note.title?.trim() || 'Untitled note',
    });
  }

  for (const highlight of input.highlights) {
    const recencyMs = newestMs(highlight.recencyIso);
    if (recencyMs === null) continue;
    push({
      id: `highlight:${highlight.id}`,
      kind: 'highlight',
      sourceId: highlight.id,
      recencyMs,
      title: highlight.title,
      subtitle: highlight.subtitle,
      highlightEntryKind: highlight.entryKind ?? null,
    });
  }

  for (const thread of input.threads) {
    const recencyMs = newestMs(thread.updatedAt);
    if (recencyMs === null) continue;
    push({
      id: `thread:${thread.id}`,
      kind: 'thread',
      sourceId: thread.id,
      recencyMs,
      title: thread.title,
      subtitle: thread.subtitle,
    });
  }

  for (const book of input.scriptureBooks) {
    let recencyMs: number | null = null;
    for (const passage of book.passages) {
      for (const note of passage.notes) {
        const ms = newestMs(note.updatedAt, note.createdAt);
        if (ms !== null && (recencyMs === null || ms > recencyMs)) recencyMs = ms;
      }
    }
    if (recencyMs === null) continue;
    push({
      id: `scriptureBook:${book.bookOrder}`,
      kind: 'scriptureBook',
      sourceId: String(book.bookOrder),
      recencyMs,
      title: book.title,
      subtitle: book.subtitle,
      scriptureBookOrder: book.bookOrder,
    });
  }

  for (const resource of input.resources) {
    const recencyMs = newestMs(resource.updatedAt, resource.createdAt);
    if (recencyMs === null) continue;
    push({
      id: `resource:${resource.id}`,
      kind: 'resource',
      sourceId: resource.id,
      recencyMs,
      title: resource.title,
      subtitle: resource.subtitle,
    });
  }

  /*
   * Dedup within a kind only. Across kinds is wrong: a note and a highlight that lives on
   * it are two destinations, and collapsing them would hide the highlight behind the note
   * it annotates.
   */
  const byId = new Map<string, LibraryAllItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || item.recencyMs > existing.recencyMs) byId.set(item.id, item);
  }

  const sorted = [...byId.values()].sort((a, b) => {
    if (b.recencyMs !== a.recencyMs) return b.recencyMs - a.recencyMs;
    /* Stable on ties, so the list does not reshuffle between memo runs. */
    const kindDelta = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (kindDelta !== 0) return kindDelta;
    return a.sourceId.localeCompare(b.sourceId);
  });

  /* After sorting, never before — a truncation applied first would drop the newest rows
     of whichever kind happened to be longest. */
  return typeof input.limit === 'number' ? sorted.slice(0, input.limit) : sorted;
}
