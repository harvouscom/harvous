import { api } from '../../lib/api';
import type { ChildFamilyReading, ChildFamilyThought } from '../../../../shared/child-notebook';
import { verseStickerLabel } from '../../../../shared/child-verse-stickers';
import { verseHighlightLabel } from '../../../../shared/child-verse-highlights';
import type { ChildConsent, ChildNote } from './types';

export type ChildExportFormat = 'text' | 'backup';

type NotebookExport = {
  displayName: string;
  notes: ChildNote[];
  familyBible?: (ChildFamilyReading & { thoughts: ChildFamilyThought[] })[];
  verseStickers?: { book: string; chapter: number; verse: number; sticker: string }[];
  verseHighlights?: { book: string; chapter: number; verse: number; color: string }[];
  consentHistory?: ChildConsent[];
  scriptureReferences: { noteId: string; reference: string; translation: string }[];
};

export async function downloadChildNotebook(childId: string, format: ChildExportFormat) {
  const notebook = await api.get<NotebookExport>(`/api/child-accounts/children/${encodeURIComponent(childId)}/export`);
  const references = new Map<string, Set<string>>();
  for (const { noteId, reference, translation } of notebook.scriptureReferences) {
    const labels = references.get(noteId) ?? new Set<string>();
    labels.add([reference, translation].filter(Boolean).join(' · '));
    references.set(noteId, labels);
  }
  const text = format === 'backup' ? JSON.stringify(notebook, null, 2) : [
    `${notebook.displayName}’s notebook`,
    ...notebook.notes.map(note => [
      note.title || 'Untitled note',
      note.content,
      [...(references.get(note.id) ?? [])].join('\n')
    ].filter(Boolean).join('\n')),
    ...(notebook.familyBible ?? []).flatMap(reading => reading.thoughts.map(thought =>
      `${reading.book} ${reading.chapter}:${thought.verse} · ${reading.translation}\n${thought.text}`)),
    ...(notebook.verseStickers?.length ? [['Bible stickers', ...notebook.verseStickers.map(item =>
      `${item.book} ${item.chapter}:${item.verse} · ${verseStickerLabel(item.sticker)}`)].join('\n')] : []),
    ...(notebook.verseHighlights?.length ? [['Bible highlights', ...notebook.verseHighlights.map(item =>
      `${item.book} ${item.chapter}:${item.verse} · ${verseHighlightLabel(item.color)}`)].join('\n')] : []),
    ...(notebook.consentHistory?.length ? [['Parent consent', ...notebook.consentHistory.map(item =>
      `${new Date(item.consentedAt).toLocaleDateString()} · ${item.kind === 'renewed' ? 'Renewed' : 'Given'} · notice ${item.noticeVersion}`)].join('\n')] : [])
  ].join('\n\n');
  const objectUrl = URL.createObjectURL(new Blob([text], {
    type: format === 'backup' ? 'application/json' : 'text/plain;charset=utf-8'
  }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = format === 'backup' ? 'harvous-child-notebook.json' : 'harvous-child-notebook.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
