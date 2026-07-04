import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNote } from './queries/useNote';
import { useNavigation } from './queries/useNavigation';
import { useSpaceMembers } from './queries/useSpace';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';

/** True when viewing another member's note inside a shared space (read-only). */
export function useForeignSharedNote(noteId: string | null | undefined) {
  const { userId: authUserId } = useAuth();
  const { data: note } = useNote(noteId ?? '');
  const { data: nav } = useNavigation();
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread =
    (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;
  const effectiveSpaceId = noteId
    ? (resolvedSpaceFromNote != null ? resolvedSpaceFromNote : resolvedSpaceFromThread) ?? homeSpaceId ?? ''
    : '';

  const noteInSharedSpace = useMemo(() => {
    if (!effectiveSpaceId || !nav) return false;
    const normalized = effectiveSpaceId.startsWith('space_') ? effectiveSpaceId : `space_${effectiveSpaceId}`;
    const owned = (nav.spaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized && s.type === 'shared',
    );
    const memberOf = (nav.memberOfSpaces ?? []).some(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === normalized,
    );
    return owned || memberOf;
  }, [effectiveSpaceId, nav]);

  const membersQuery = useSpaceMembers(noteInSharedSpace && effectiveSpaceId ? effectiveSpaceId : '');

  const isForeignSharedNote = useMemo(
    () =>
      noteInSharedSpace &&
      Boolean(note?.userId && authUserId && note.userId !== authUserId),
    [noteInSharedSpace, note?.userId, authUserId],
  );

  const foreignNoteAuthor = useMemo(() => {
    if (!isForeignSharedNote || !note?.userId) return null;
    return membersQuery.data?.members.find((m) => m.userId === note.userId) ?? null;
  }, [isForeignSharedNote, note?.userId, membersQuery.data?.members]);

  return {
    isForeignSharedNote,
    foreignNoteAuthor,
    noteInSharedSpace,
    effectiveSpaceId,
  };
}
