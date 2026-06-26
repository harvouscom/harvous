/**
 * Supabase Realtime Broadcast listener — debounced React Query + IndexedDB refresh.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient, isSupabaseRealtimeConfigured, syncChannelName } from '@/lib/supabase-client';
import { isRealtimeInvalidationPayload, type RealtimeInvalidationPayload } from '@/lib/realtime-invalidation';
import { isPrototypeShellRoute } from '@/utils/sync-init';
import { syncNow } from '@/utils/sync-manager';
import { matchPrototypeNoteId } from '@/lib/prototype-path';

const CLERK_SUPABASE_JWT_TEMPLATE = 'supabase';
const DEBOUNCE_MS = 600;

/** True when the open prototype note editor has focus (skip detail refetch mid-edit). */
function isPrototypeOpenNoteEditorFocused(noteId: string): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const slug = matchPrototypeNoteId(window.location.pathname);
  if (!slug) return false;
  const openId = slug.startsWith('note_') ? slug : `note_${slug}`;
  if (openId !== noteId) return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el.closest('.ProseMirror')) return true;
  if (el.tagName === 'TEXTAREA' && el.closest('[data-note-id]')) return true;
  return false;
}

export type UseRealtimeSyncOptions = {
  /** Home space for `/prototype` list refresh (optional). */
  homeSpaceId?: string | null;
};

/**
 * Patch React Query caches directly from a Realtime note payload — no detail
 * refetch, no list refetch, no syncNow round trip. The prototype home list and
 * the sidebar share the `['space', id, 'notes', …]` infinite cache, and
 * navigation data is sidebar *structure* (unaffected by a note's title/content),
 * so an in-place patch keeps everything in sync without a network hop.
 */
async function patchNoteInCaches(
  queryClient: QueryClient,
  id: string,
  note: NonNullable<RealtimeInvalidationPayload['note']>,
): Promise<void> {
  // Don't touch content while the user is actively editing this note on this
  // device (rare cross-device race); still safe to refresh title/tags.
  const editorFocused = isPrototypeOpenNoteEditorFocused(id);

  queryClient.setQueryData(['note', id], (prev: unknown) => {
    if (!prev || typeof prev !== 'object') return prev;
    const next = { ...(prev as Record<string, unknown>) };
    if (typeof note.title !== 'undefined') next.title = note.title;
    if (!editorFocused && typeof note.content === 'string') {
      next.content = note.content;
      next.__contentIsPreview = false;
    }
    if (note.updatedAt) next.updatedAt = note.updatedAt;
    return next;
  });

  if (Array.isArray(note.tags)) {
    const { mergeNoteTagsInCache } = await import('../../spa/src/lib/note-tags-cache');
    mergeNoteTagsInCache(queryClient, id, note.tags as Parameters<typeof mergeNoteTagsInCache>[2]);
  }

  if (note.spaceId) {
    const { updateSpaceNoteInCache } = await import('../../spa/src/lib/space-notes-cache');
    const rowPatch: Record<string, unknown> = {};
    if (typeof note.title !== 'undefined') rowPatch.title = note.title;
    if (!editorFocused && typeof note.content === 'string') rowPatch.content = note.content;
    if (note.updatedAt) rowPatch.updatedAt = note.updatedAt;
    if (Object.keys(rowPatch).length > 0) {
      updateSpaceNoteInCache(queryClient, note.spaceId, id, rowPatch as Parameters<typeof updateSpaceNoteInCache>[3]);
    }
  }
}

async function applyInvalidation(
  queryClient: QueryClient,
  payload: RealtimeInvalidationPayload,
  userId: string,
  homeSpaceId?: string | null,
): Promise<void> {
  const { type, id } = payload;

  // Fast path: a note:updated carrying its changed fields patches caches in place.
  // Broadcasts exclude the sender, so only other devices reach here.
  if (type === 'note:updated' && id && payload.note) {
    await patchNoteInCaches(queryClient, id, payload.note);
    return;
  }

  if (type === 'userMetadata:updated') {
    if (isPrototypeShellRoute()) {
      const { fetchAndHydrateAppearanceFromProfile } = await import(
        '../../spa/src/lib/prototype-background'
      );
      void fetchAndHydrateAppearanceFromProfile();
    } else {
      try { await syncNow(userId); } catch { /* non-fatal */ }
    }
    return;
  }

  if (type === 'sync:batch') {
    if (isPrototypeShellRoute()) {
      const { refreshPrototypeLists } = await import('../../spa/src/lib/refresh-client-data');
      await refreshPrototypeLists(queryClient, homeSpaceId);
    } else {
      await invalidateMainAppQueries(queryClient, { type: 'note:updated', id });
      if (!isPrototypeShellRoute()) {
        try {
          await syncNow(userId);
        } catch (err) {
          console.error('[useRealtimeSync] syncNow after batch:', err);
        }
      }
    }
    return;
  }

  if (isPrototypeShellRoute()) {
    const { refreshPrototypeLists } = await import('../../spa/src/lib/refresh-client-data');
    await refreshPrototypeLists(queryClient, homeSpaceId);
    if (id && type.startsWith('note:')) {
      if (type === 'note:deleted') {
        const { clearCachedNoteDetail, clearNoteParentThreadLocalCache } = await import(
          '../../spa/src/hooks/queries/useNote'
        );
        queryClient.removeQueries({ queryKey: ['note', id] });
        clearCachedNoteDetail(id);
        clearNoteParentThreadLocalCache(id);
        try {
          window.dispatchEvent(
            new CustomEvent('noteDeleted', { detail: { noteId: id, threadId: 'thread_unorganized' } }),
          );
        } catch {
          /* ignore */
        }
      } else if (type === 'note:updated' && isPrototypeOpenNoteEditorFocused(id)) {
        const { fetchAndMergeNoteTagsInCache } = await import('../../spa/src/lib/note-tags-cache');
        await fetchAndMergeNoteTagsInCache(queryClient, id);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['note', id] });
      }
    }
    return;
  }

  await invalidateMainAppQueries(queryClient, payload);

  if (!isPrototypeShellRoute()) {
    try {
      await syncNow(userId);
    } catch (err) {
      console.error('[useRealtimeSync] syncNow:', err);
    }
  }
}

async function invalidateMainAppQueries(
  queryClient: QueryClient,
  payload: RealtimeInvalidationPayload,
): Promise<void> {
  const { type, id } = payload;

  if (type.startsWith('note:') || type === 'sync:batch') {
    await queryClient.invalidateQueries({ queryKey: ['navigation'] });
    await queryClient.invalidateQueries({
      queryKey: ['space'],
      predicate: (q) => q.queryKey[2] === 'notes' || q.queryKey[2] === 'bootstrap',
    });
    if (id) {
      await queryClient.invalidateQueries({ queryKey: ['note', id] });
    } else {
      await queryClient.invalidateQueries({ queryKey: ['note'] });
    }
  }

  if (type.startsWith('thread:')) {
    await queryClient.invalidateQueries({ queryKey: ['navigation'] });
    if (id) {
      await queryClient.invalidateQueries({ queryKey: ['thread', id] });
      await queryClient.invalidateQueries({ queryKey: ['thread', id, 'notes'] });
    } else {
      await queryClient.invalidateQueries({ queryKey: ['thread'] });
    }
  }

  if (type.startsWith('space:')) {
    await queryClient.invalidateQueries({ queryKey: ['navigation'] });
    if (id) {
      await queryClient.invalidateQueries({ queryKey: ['space', id] });
    } else {
      await queryClient.invalidateQueries({ queryKey: ['space'] });
    }
  }
}

export function useRealtimeSync(userId: string | undefined, options?: UseRealtimeSyncOptions): void {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeSpaceId = options?.homeSpaceId;

  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(null);

  useEffect(() => {
    if (!userId || !isSignedIn || !isSupabaseRealtimeConfigured()) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    const setup = async () => {
      try {
        const token = await getToken({ template: CLERK_SUPABASE_JWT_TEMPLATE });
        if (token && !cancelled) {
          await supabase.realtime.setAuth(token);
        }
      } catch (err) {
        console.warn('[useRealtimeSync] Clerk Supabase JWT unavailable; Realtime may not connect:', err);
      }

      if (cancelled) return;

      const channel = supabase.channel(syncChannelName(userId));
      channelRef.current = channel;

      channel.on('broadcast', { event: 'invalidate' }, ({ payload }) => {
        if (!isRealtimeInvalidationPayload(payload)) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          void applyInvalidation(queryClient, payload, userId, homeSpaceId);
        }, DEBOUNCE_MS);
      });

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useRealtimeSync] channel error for', syncChannelName(userId));
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        void supabase.removeChannel(ch);
      }
    };
  }, [userId, isSignedIn, getToken, queryClient, homeSpaceId]);
}
