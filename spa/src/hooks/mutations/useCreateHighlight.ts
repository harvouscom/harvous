import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import { runOfflineFirst } from './withOfflineQueue';
import { createStudyThreadEntryOffline } from '@/utils/offline-mutations';

export type StudyThreadEntryKind =
  | 'workspace'
  | 'miniNote'
  | 'linkedNote'
  | 'scriptureLink'
  | 'reference';

interface CreateHighlightInput {
  parentNoteId: string;
  spaceId: string;
  entryKind?: StudyThreadEntryKind;
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
  scriptureReference?: string | null;
  scripturePassageTranslation?: string | null;
  scripturePassageExcerpt?: string | null;
}

interface CreateHighlightResponse {
  success?: boolean;
  studyThread?: StudyThreadEntryDetail | null;
  error?: string;
}

function offlineHighlightStub(
  localId: string,
  input: CreateHighlightInput,
): CreateHighlightResponse {
  const now = new Date().toISOString();
  return {
    success: true,
    studyThread: {
      id: localId,
      parentNoteId: input.parentNoteId,
      spaceId: normalizePrototypeApiSpaceId(input.spaceId),
      entryKind: input.entryKind ?? 'miniNote',
      highlightAccentRaw: input.highlightAccentRaw ?? 'warmAmber',
      sourceSnippet: input.sourceSnippet ?? null,
      focusTitle: input.focusTitle ?? null,
      notesBody: input.notesBody ?? null,
      miniNoteBody: input.miniNoteBody ?? null,
      linkedNoteId: input.linkedNoteId ?? null,
      linkedNoteTitle: input.linkedNoteTitle ?? null,
      anchorLocation: input.anchorLocation ?? null,
      anchorLength: input.anchorLength ?? null,
      anchorTextSnapshot: input.anchorTextSnapshot ?? null,
      scriptureReference: input.scriptureReference ?? null,
      scripturePassageTranslation: input.scripturePassageTranslation ?? null,
      scripturePassageExcerpt: input.scripturePassageExcerpt ?? null,
      isArchived: false,
      highlightListEditedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function useCreateHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateHighlightInput) => {
      const { parentNoteId, spaceId: _spaceId, ...rest } = input;
      const outcome = await runOfflineFirst({
        online: () =>
          api.post<CreateHighlightResponse>(
            `/api/notes/${encodeURIComponent(parentNoteId)}/study-threads`,
            { entryKind: 'miniNote', ...rest },
          ),
        offline: (userId) => createStudyThreadEntryOffline(userId, { parentNoteId, ...rest }),
      });
      if (outcome.queued && outcome.localId) {
        return offlineHighlightStub(outcome.localId, input);
      }
      return outcome.online!;
    },
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
      });
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
      });
      queryClient.invalidateQueries({ queryKey: ['note', variables.parentNoteId] });
    },
  });
}
