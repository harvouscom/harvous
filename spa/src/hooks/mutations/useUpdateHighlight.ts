import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import type { StudyThreadEntryKind } from './useCreateHighlight';
import { withStudyThreadContext } from '@/utils/study-dock-stack';
import { invalidatePrototypeStudyThreadListQueries } from '@/utils/prototype-study-thread-list-sync';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { updateGuestHighlight } from '../../lib/guest-store';
import { markOnboardingStep } from '../../lib/proto-onboarding-sync';

export interface UpdateHighlightInput {
  id: string;
  spaceId: string;
  contextSpaceId?: string | null;
  parentNoteId?: string;
  highlightAccentRaw?: string;
  sourceSnippet?: string;
  focusTitle?: string;
  notesBody?: string;
  miniNoteBody?: string;
  linkedNoteId?: string | null;
  linkedNoteTitle?: string | null;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  anchorTextSnapshot?: string | null;
  scriptureReference?: string;
  scripturePassageTranslation?: string;
  scripturePassageExcerpt?: string;
  isArchived?: boolean;
  entryKind?: StudyThreadEntryKind;
}

export function buildUpdateHighlightRequest(input: UpdateHighlightInput): {
  url: string;
  body: Record<string, unknown>;
} {
  const {
    id,
    spaceId: _spaceId,
    contextSpaceId,
    parentNoteId: _parentNoteId,
    ...patch
  } = input;
  return {
    url: `/api/study-threads/${encodeURIComponent(id)}`,
    body: withStudyThreadContext(patch, contextSpaceId),
  };
}

interface UpdateHighlightResponse {
  success?: boolean;
  studyThread?: StudyThreadEntryDetail | null;
  error?: string;
}

export function useUpdateHighlight() {
  const queryClient = useQueryClient();
  const { isGuest } = useHarvousIdentity();

  return useMutation({
    mutationFn: (input: UpdateHighlightInput) => {
      /*
       * The annotate dock's "Note (optional)" is the one way a guest can write, and it is worth
       * having: the full editor needs a space and a server, a thought on a verse needs neither.
       * Same field either way, so adoption carries it up with the highlight rather than needing
       * a path of its own.
       */
      if (isGuest) {
        const updated = updateGuestHighlight(input.id, {
          ...(input.highlightAccentRaw
            ? { accent: input.highlightAccentRaw as never }
            : {}),
          ...(input.miniNoteBody === undefined ? {} : { miniNoteBody: input.miniNoteBody }),
        });
        if (input.miniNoteBody?.trim()) markOnboardingStep('note');
        return Promise.resolve({ success: Boolean(updated) } as UpdateHighlightResponse);
      }
      const request = buildUpdateHighlightRequest(input);
      return api.patch<UpdateHighlightResponse>(request.url, request.body);
    },
    /* The shared helper rather than a copy of its keys — see `useCreateHighlight`. */
    onSuccess: (_data, variables) => {
      invalidatePrototypeStudyThreadListQueries(
        queryClient,
        variables.spaceId,
        variables.parentNoteId,
      );
      if (variables.parentNoteId) {
        queryClient.invalidateQueries({
          queryKey: ['noteActivity', variables.parentNoteId, variables.contextSpaceId?.trim() || null],
        });
      }
    },
  });
}
