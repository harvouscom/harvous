import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNote } from './queries/useNote';
import { useNavigation } from './queries/useNavigation';
import { useSpaceMembers } from './queries/useSpace';
import { useActiveSpace } from './useActiveSpace';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';

/** True when viewing another member's note inside a shared space (read-only). */
export function useForeignSharedNote(noteId: string | null | undefined) {
  const { userId: authUserId } = useAuth();
  const { data: note } = useNote(noteId ?? '');
  const { data: nav } = useNavigation();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const { isSharedSpace, activeSpaceId } = useActiveSpace();

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread =
    (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;
  const effectiveSpaceId = noteId
    ? (resolvedSpaceFromNote != null
        ? resolvedSpaceFromNote
        : resolvedSpaceFromThread) ??
      (isSharedSpace ? activeSpaceId : homeSpaceId) ??
      ''
    : '';

  const noteInSharedSpace = useMemo(() => {
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
  }, [isSharedSpace, effectiveSpaceId, nav]);

  const membersQuery = useSpaceMembers(noteInSharedSpace && effectiveSpaceId ? effectiveSpaceId : '');

  const isOwnNoteConfirmed = useMemo((): boolean | null => {
    if (!note || !authUserId) return null;
    if (note.isOwnNote === true) return true;
    if (note.isOwnNote === false) return false;
    if (note.userId) return note.userId === authUserId;
    return null;
  }, [note, authUserId]);

  /** Read-only in shared space until ownership is confirmed as the viewer's own note. */
  const readOnlyInSharedSpace = useMemo(() => {
    if (!noteInSharedSpace || !noteId || !note) return false;
    return isOwnNoteConfirmed !== true;
  }, [noteInSharedSpace, noteId, note, isOwnNoteConfirmed]);

  const isForeignSharedNote = useMemo(
    () => readOnlyInSharedSpace && isOwnNoteConfirmed === false,
    [readOnlyInSharedSpace, isOwnNoteConfirmed],
  );

  const foreignNoteAuthor = useMemo(() => {
    if (!readOnlyInSharedSpace || !note?.userId) return null;
    return membersQuery.data?.members.find((m) => m.userId === note.userId) ?? null;
  }, [readOnlyInSharedSpace, note?.userId, membersQuery.data?.members]);

  return {
    isForeignSharedNote,
    readOnlyInSharedSpace,
    foreignNoteAuthor,
    noteInSharedSpace,
    effectiveSpaceId,
  };
}
