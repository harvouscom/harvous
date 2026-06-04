import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  pickStudyThreadRepresentativeNoteId,
  resolveStudyThreadDisplayTitle,
  suggestStudyThreadTitleFromNodes,
  type StudyThreadSuggestNode,
} from '@/utils/suggest-study-thread-title';
import type { StudyThreadNoteRow } from './study-thread-note-rows';

export type StudyThreadClusterNaming = {
  repNoteId: string;
  suggestedTitle: string;
  threadTitle: string;
  studyThreadUserOverride: boolean;
  studyThreadPinned: boolean;
};

/**
 * One display name for the whole connection cluster. Manual titles on any member
 * (e.g. saved before rep selection was unified) still win for list + panel parity.
 */
export function resolveStudyThreadClusterNaming(
  memberRows: StudyThreadNoteRow[],
  suggestNodes: StudyThreadSuggestNode[],
  repNoteId: string,
): StudyThreadClusterNaming {
  const rep = memberRows.find((m) => m.id === repNoteId);
  const suggestedTitle = suggestStudyThreadTitleFromNodes(suggestNodes, repNoteId);
  const suggestedTrimmed = suggestedTitle.trim();

  const manualCarrier =
    memberRows.find(
      (m) =>
        m.studyThreadUserOverride &&
        Boolean(stripServerAutoUntitledNoteTitleForDisplay(m.studyThreadTitle)?.trim()),
    ) ??
    memberRows.find((m) => {
      const manual = stripServerAutoUntitledNoteTitleForDisplay(m.studyThreadTitle)?.trim();
      return Boolean(manual && manual !== suggestedTrimmed);
    });

  if (manualCarrier) {
    return {
      repNoteId,
      suggestedTitle,
      threadTitle: resolveStudyThreadDisplayTitle({
        studyThreadTitle: manualCarrier.studyThreadTitle,
        studyThreadUserOverride: true,
        suggestedTitle,
      }),
      studyThreadUserOverride: true,
      studyThreadPinned: Boolean(rep?.studyThreadPinned ?? manualCarrier.studyThreadPinned),
    };
  }

  const studyThreadUserOverride = Boolean(rep?.studyThreadUserOverride);
  return {
    repNoteId,
    suggestedTitle,
    threadTitle: resolveStudyThreadDisplayTitle({
      studyThreadTitle: rep?.studyThreadTitle ?? null,
      studyThreadUserOverride,
      suggestedTitle,
    }),
    studyThreadUserOverride,
    studyThreadPinned: Boolean(rep?.studyThreadPinned),
  };
}

export function pickRepresentativeFromMemberRows(
  memberRows: StudyThreadNoteRow[],
  edges: { fromId: string; toId: string }[],
): string | null {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.fromId, (degree.get(e.fromId) ?? 0) + 1);
    degree.set(e.toId, (degree.get(e.toId) ?? 0) + 1);
  }
  const ids = memberRows.map((m) => m.id);
  return pickStudyThreadRepresentativeNoteId(ids, degree);
}
