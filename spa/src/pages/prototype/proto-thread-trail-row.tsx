import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import type { StudyThreadNodeFlat } from '../../hooks/queries/usePrototypeStudyThread';

const PREVIEW_MAX = 80;

export function threadTrailRowTitle(
  node: Pick<StudyThreadNodeFlat, 'title' | 'noteType' | 'resourceTitle' | 'simpleNoteId'>,
): string {
  return (
    (node.noteType === 'resource' && node.resourceTitle ? node.resourceTitle : null) ??
    stripServerAutoUntitledNoteTitleForDisplay(node.title) ??
    `Note N${node.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

export function threadTrailRowPreview(
  node: Pick<StudyThreadNodeFlat, 'content' | 'noteType' | 'resourceDescription'>,
): string {
  const raw =
    node.noteType === 'resource' && node.resourceDescription
      ? node.resourceDescription
      : node.content ?? '';
  if (!raw.trim()) return '';
  return stripHtmlForListPreview(raw, PREVIEW_MAX);
}

export function threadTrailRowUpdatedAt(node: Pick<StudyThreadNodeFlat, 'updatedAt'>): string | null {
  return node.updatedAt ?? null;
}

/** Single-line recency + excerpt — same markup as sidebar note list rows. */
export function ProtoThreadTrailRecencyLine({ rel, preview }: { rel?: string; preview?: string }) {
  if (!rel && !preview) return null;
  return (
    <div className="pds-list-preview proto-note-row__preview">
      {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
      {rel && preview ? '  ' : null}
      {preview ? <span>{preview}</span> : null}
    </div>
  );
}
