import { api } from '../../lib/api';
import type { ChildNote } from './types';

export type ChildExportFormat = 'text' | 'backup';

type NotebookExport = {
  displayName: string;
  notes: ChildNote[];
  scriptureReferences: { noteId: string; reference: string; translation: string }[];
};

export async function downloadChildNotebook(childId: string, format: ChildExportFormat) {
  const notebook = await api.get<NotebookExport>(`/api/family/children/${encodeURIComponent(childId)}/export`);
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
    ].filter(Boolean).join('\n'))
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
