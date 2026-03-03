import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

/**
 * Fire-and-forget mutation for recording thread visits.
 * Silently swallows errors — visit tracking should never block the UI.
 */
export function useRecordThreadVisit() {
  return useMutation({
    mutationFn: (threadId: string) => api.post(`/api/threads/${threadId}/visit`),
    // No cache invalidation needed — this is a background tracking call.
  });
}

/**
 * Fire-and-forget mutation for recording note visits.
 * Silently swallows errors — visit tracking should never block the UI.
 */
export function useRecordNoteVisit() {
  return useMutation({
    mutationFn: (noteId: string) => api.post(`/api/notes/${noteId}/visit`),
  });
}
