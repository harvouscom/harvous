/**
 * Where an install put the thing.
 *
 * `POST /api/discover/install` has always answered this — `createdIds` carries one
 * key per kind — and the panel threw it away, so four different destinations
 * arrived as a single toast that named none of them.
 *
 * A resolver rather than a callback so the mapping can be tested without a router
 * or a shell: the caller turns a descriptor into navigation, and the rule for which
 * descriptor is the part worth pinning down. `PublicDiscoverListingPage` reads the
 * same field and reaches the same conclusion for a note.
 */

/** The subset of the install response this reads. */
export interface DiscoverCreatedIds {
  templateId?: string | null;
  noteId?: string | null;
  threadId?: string | null;
  noteIds?: string[];
  libraryItemId?: string | null;
}

export type DiscoverInstallDestination =
  | { kind: 'note'; noteId: string }
  /** A Thread is a drill inside the Library panel, not a route of its own. */
  | { kind: 'thread'; threadId: string }
  /** A link lands on the shelf; the shelf is the destination, not the row. */
  | { kind: 'resources' };

/**
 * Null for a template, and that is an answer rather than a gap.
 *
 * A template has no page — it is now in the picker, which is where the reader was
 * heading when they found it. Offering to "open" one would have to invent a
 * destination, and the public page states the same reasoning for why it stays put.
 *
 * Checked in the order the kinds actually produce ids: a pack reports `threadId`
 * *and* `noteIds`, and the Thread is the thing to open, so `noteId` — which only a
 * note install sets — is safe to test first.
 */
export function discoverInstallDestination(
  createdIds: DiscoverCreatedIds | null | undefined,
): DiscoverInstallDestination | null {
  if (!createdIds) return null;
  if (createdIds.noteId) return { kind: 'note', noteId: createdIds.noteId };
  if (createdIds.threadId) return { kind: 'thread', threadId: createdIds.threadId };
  if (createdIds.libraryItemId) return { kind: 'resources' };
  return null;
}
