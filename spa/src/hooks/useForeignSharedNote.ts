import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNote } from './queries/useNote';
import { useNavigation } from './queries/useNavigation';
import { useSpaceMembers } from './queries/useSpace';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import { normalizePrototypeApiSpaceId } from '../utils/prototype-space-api-id';
import { resolveNoteAudience } from '../lib/note-audience';

/**
 * True when viewing another member's note inside a shared space (read-only).
 *
 * Pen opts come from the caller's useNoteEditLease. When co-edit is on,
 * `note.canEdit` plus either holding the pen or the pen being free (claim by
 * typing) makes a foreign note writable.
 */
export function useForeignSharedNote(
  noteId: string | null | undefined,
  contextSpaceId?: string | null,
  opts?: { holdsPen?: boolean; penFree?: boolean },
) {
  const { userId: authUserId } = useAuth();
  const routeContextSpaceId =
    typeof window !== 'undefined'
      ? normalizePrototypeApiSpaceId(new URLSearchParams(window.location.search).get('space'))
      : undefined;
  const explicitContextSpaceId =
    normalizePrototypeApiSpaceId(contextSpaceId) ?? routeContextSpaceId ?? null;
  const { data: note } = useNote(noteId ?? '', explicitContextSpaceId);
  const { data: nav } = useNavigation();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  // Deliberately does NOT read useActiveSpace: the switcher's selection must not
  // decide whether *this note* is in a shared space. Only `?space=` and the note's
  // own associations do.

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread =
    (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;
  const effectiveSpaceId = noteId
    ? explicitContextSpaceId ??
      (resolvedSpaceFromNote != null
        ? resolvedSpaceFromNote
        : resolvedSpaceFromThread) ??
      // Never fall back to the switcher's space: that made a My Home note adopt
      // whichever space happened to be selected. Home is the honest default.
      homeSpaceId ??
      ''
    : '';

  /**
   * True only when this note is genuinely being read inside one of its own shared
   * spaces. Previously any active shared space made this true, so switching the
   * switcher flipped a private note into shared mode (scoped @-mentions, shared
   * annotations, read-only checks) with no association behind it.
   */
  const noteInSharedSpace = useMemo(() => {
    if (!effectiveSpaceId) return false;
    const normalized = effectiveSpaceId.startsWith('space_')
      ? effectiveSpaceId
      : `space_${effectiveSpaceId}`;
    // The note's own associations are authoritative once loaded.
    if (note?.spaces) {
      return note.spaces.some(
        (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized,
      );
    }
    // Associations not loaded yet — fall back to "is this a shared space at all",
    // which is what an explicit `?space=` context implies.
    if (!explicitContextSpaceId || !nav) return Boolean(explicitContextSpaceId);
    const owned = (nav.spaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized && s.type === 'shared',
    );
    const memberOf = (nav.memberOfSpaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized,
    );
    return owned || memberOf;
  }, [explicitContextSpaceId, effectiveSpaceId, nav, note?.spaces]);

  const membersQuery = useSpaceMembers(noteInSharedSpace && effectiveSpaceId ? effectiveSpaceId : '');

  const isOwnNoteConfirmed = useMemo((): boolean | null => {
    if (!note) return null;
    if (note.isOwnNote === true) return true;
    if (note.isOwnNote === false) return false;
    if (!authUserId) return null;
    const authorUserId = note.authorUserId ?? note.userId;
    if (authorUserId) return authorUserId === authUserId;
    return null;
  }, [note, authUserId]);

  const holdsPen = opts?.holdsPen === true;
  const penFree = opts?.penFree === true;

  /**
   * The `Notes.coEditEnabled` OR-mirror across every shared association.
   *
   * Kept as-is because the plumbing depends on it: it gates the presence lease
   * and the offline-queue bypass in useUpdateNote. Render from
   * `coEditEnabledInContext` instead — this flag has no space context, so using
   * it for UI is what made My Home show co-editing chrome.
   */
  const isCoEditable = useMemo(() => note?.coEditEnabled === true, [note?.coEditEnabled]);

  const audience = useMemo(
    () =>
      resolveNoteAudience({
        // Only a space the note actually belongs to counts as its context.
        contextSpaceId: noteInSharedSpace ? effectiveSpaceId : null,
        spaces: note?.spaces,
        noteCoEditEnabled: note?.coEditEnabled,
      }),
    [noteInSharedSpace, effectiveSpaceId, note?.spaces, note?.coEditEnabled],
  );

  /**
   * Read-only in shared space until ownership is confirmed, or — for a co-edited
   * note — until this viewer may write and either holds the pen or the pen is
   * free (interaction claims it). Fail-closed at every step.
   */
  const readOnlyInSharedSpace = useMemo(() => {
    if (!noteInSharedSpace || !noteId || !note) return false;
    if (isOwnNoteConfirmed === true) return false;
    if (note.canEdit !== true) return true;
    return !(holdsPen || penFree);
  }, [noteInSharedSpace, noteId, note, isOwnNoteConfirmed, holdsPen, penFree]);

  const isForeignSharedNote = useMemo(
    () => noteInSharedSpace && !!note && isOwnNoteConfirmed === false,
    [noteInSharedSpace, note, isOwnNoteConfirmed],
  );

  const foreignNoteAuthor = useMemo(() => {
    const authorUserId = note?.authorUserId ?? note?.userId;
    if (!isForeignSharedNote || !authorUserId) return null;
    return membersQuery.data?.members.find((m) => m.userId === authorUserId) ?? null;
  }, [isForeignSharedNote, note?.authorUserId, note?.userId, membersQuery.data?.members]);

  return {
    isForeignSharedNote,
    readOnlyInSharedSpace,
    foreignNoteAuthor,
    noteInSharedSpace,
    effectiveSpaceId,
    isCoEditable,
    /** Server's verdict that this viewer may write the body if they take the pen. */
    canCoEdit: note?.canEdit === true && isCoEditable,
    contributors: note?.contributors ?? [],
    /** Per-space co-edit — render from this, not `isCoEditable`. */
    coEditEnabledInContext: audience.coEditEnabledInContext,
    /** `'home' | 'space' | 'unknown'`; `'unknown'` until associations load. */
    audienceScope: audience.scope,
    audience,
  };
}
