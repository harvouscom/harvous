import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import type { StudyThreadResponse } from '../hooks/queries/usePrototypeStudyThread';

/** Client display title — mirrors server `resolveStudyThreadDisplayTitle` rules. */
export function studyThreadDisplayTitle(thread: StudyThreadResponse): string {
  const suggested =
    stripServerAutoUntitledNoteTitleForDisplay(thread.suggestedTitle)?.trim() || 'Thread';
  if (thread.studyThreadUserOverride) {
    const manual = stripServerAutoUntitledNoteTitleForDisplay(thread.threadTitle)?.trim();
    return manual || suggested;
  }
  return suggested;
}
