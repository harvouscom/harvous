import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNote } from './queries/useNote';
import { useNavigation } from './queries/useNavigation';
import { useSpaceMembers } from './queries/useSpace';
import { useActiveSpace } from './useActiveSpace';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import { normalizePrototypeApiSpaceId } from '../utils/prototype-space-api-id';

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
  const { isSharedSpace, activeSpaceId } = useActiveSpace();

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread =
    (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;
  const effectiveSpaceId = noteId
    ? explicitContextSpaceId ??
      (resolvedSpaceFromNote != null
        ? resolvedSpaceFromNote
        : resolvedSpaceFromThread) ??
      (isSharedSpace ? activeSpaceId : homeSpaceId) ??
      ''
    : '';

  const noteInSharedSpace = useMemo(() => {
    if (explicitContextSpaceId) return true;
    if (isSharedSpace) return true;
    if (!effectiveSpaceId || !nav) return false;
    const normalized = effectiveSpaceId.startsWith('space_') ? effectiveSpaceId : `space_${effectiveSpaceId}`;
    const owned = (nav.spaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized && s.type === 'shared',
    );
    const memberOf = (nav.memberOfSpaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized,
    );
    return owned || memberOf;
  }, [explicitContextSpaceId, isSharedSpace, effectiveSpaceId, nav]);

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

  /** True once the author has opened this note to its shared spaces. */
  const isCoEditable = useMemo(() => note?.coEditEnabled === true, [note?.coEditEnabled]);

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
  };
}
