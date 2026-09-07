import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { invalidateDiscoverQueries } from '../queries/useDiscoverListings';
import { invalidateNoteTemplatesQueries } from '../queries/useNoteTemplates';

/**
 * Discover writes.
 *
 * Grouped in one file rather than split per-mutation like the note-template
 * hooks, because all four share the same two invalidations and splitting them
 * would copy that pairing four times. The pairing is the part worth keeping in
 * one place: an install changes both the catalog (its count) and the viewer's
 * own template list (the copy), and forgetting either leaves a stale row.
 */

export interface InstallDiscoverListingResponse {
  success: boolean;
  alreadyInstalled: boolean;
  kind: string;
  /**
   * What the install produced. One key per kind — a pack reports its thread and
   * the notes under it; the `alreadyInstalled` branch can only report the one
   * ref the install row recorded, which is the thing worth opening.
   */
  createdIds: {
    templateId?: string | null;
    noteId?: string | null;
    threadId?: string | null;
    noteIds?: string[];
    libraryItemId?: string | null;
  };
  warnings: string[];
}

/** Take a copy of a listing. Safe to call twice — the server says `alreadyInstalled`. */
export function useInstallDiscoverListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      api.post<InstallDiscoverListingResponse>('/api/discover/install', { slug }),
    onSuccess: () => {
      // The copy lands in the viewer's own templates, so the browse sheet's
      // Saved tab has to refetch as well as the catalog's install count.
      void invalidateNoteTemplatesQueries(queryClient);
      void invalidateDiscoverQueries(queryClient);
    },
  });
}

export interface SubmitToDiscoverBody {
  /** `resource` is phase 3; the server refuses anything it cannot snapshot. */
  kind?: 'template' | 'note' | 'pack';
  sourceId: string;
  description?: string | null;
}

/** Offer something of your own to everyone. Goes to the queue, not the catalog. */
export function useSubmitToDiscover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitToDiscoverBody) =>
      api.post<{ success: boolean }>('/api/discover/submit', {
        kind: body.kind ?? 'template',
        sourceId: body.sourceId,
        description: body.description ?? null,
      }),
    onSuccess: () => {
      void invalidateDiscoverQueries(queryClient);
    },
  });
}

/** Take it back — while it waits, or after it is listed. */
export function useWithdrawDiscoverSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      api.post<{ success: boolean }>('/api/discover/withdraw', { listingId }),
    onSuccess: () => {
      void invalidateDiscoverQueries(queryClient);
    },
  });
}

export interface ReviewDiscoverSubmissionBody {
  listingId: string;
  action: 'approve' | 'decline';
  /** Required to approve — the reviewer files it, not the submitter. */
  category?: string | null;
  title?: string | null;
  description?: string | null;
  reviewNote?: string | null;
}

/** Approve or decline. Admin only; the server gates it regardless of what the UI shows. */
export function useReviewDiscoverSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewDiscoverSubmissionBody) =>
      api.post<{ success: boolean; status: string }>('/api/admin/discover/review', body),
    onSuccess: () => {
      void invalidateDiscoverQueries(queryClient);
    },
  });
}
