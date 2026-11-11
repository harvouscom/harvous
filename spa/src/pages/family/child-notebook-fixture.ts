// Development fixture loaded only from the isolated entry's dev-only preview branch.
import { defaultChildPreferences, type ChildFamilyThought, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
import type { ChildSearchResult, ChildSearchScope } from './types';
import type { Notebook } from './child-main';
import verses from './child-preview-psalm.json';

const reading = { id: 'preview-psalm', book: 'Psalms', chapter: 23, translation: 'BSB' as const };
const thoughts: ChildFamilyThought[] = [{ id: 'preview-thought', verse: 1, role: 'parent', text: 'Which words would you like to remember?' }];
const notebook: Notebook = {
  displayName: 'Sam', preferences: { ...defaultChildPreferences }, translations: ['BSB'], readings: [reading],
  notes: [
    { id: 'preview-1', title: 'What I want to remember', content: 'I want to talk with my family about what we read together today.', updatedAt: null },
    { id: 'preview-2', title: 'A question for Sunday', content: 'What did you notice in this week’s reading?', updatedAt: null }
  ],
  materials: [{ id: 'preview-reading', spaceId: 'preview-ministry', title: 'This week’s reading', content: 'What’s one kind thing you could do for someone this week?', spaceTitle: 'Kids ministry', updatedAt: null }]
};
export function previewRequest(path: string, method: string, body: unknown): unknown {
  if (path === 'redeem') return { token: 'preview' };
  if (path === 'notebook') return structuredClone(notebook);
  if (path === 'session') return { success: true };
  if (path === 'preferences') {
    notebook.preferences = body as ChildNotebookPreferences;
    return { preferences: notebook.preferences };
  }
  if (path === 'search') {
    const { query, scope, offset } = body as { query: string; scope: ChildSearchScope; offset: number };
    const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
    const all: ChildSearchResult[] = [];
    if (scope !== 'family') for (const note of notebook.notes) {
      if (matches(`${note.title} ${note.content}`)) all.push({ kind: 'note', id: note.id, title: note.title ?? 'Untitled note', source: 'My notebook' });
    }
    if (scope !== 'notebook') {
      if (matches('Psalms 23 Family Bible BSB')) all.push({ kind: 'reading', id: reading.id, title: 'Psalms 23', source: 'Family Bible · BSB' });
      for (const material of notebook.materials) if (matches(`${material.title} ${material.content} ${material.spaceTitle}`)) {
        all.push({ ...material, kind: 'material', title: material.title ?? 'Reading', source: material.spaceTitle });
      }
    }
    return { results: all.slice(offset, offset + 20), total: all.length };
  }
  if (path === 'bible/chapter') {
    const passage = body as { book: string; chapter: number };
    if (passage.book !== 'Psalms' || passage.chapter !== 23) throw new Error('Psalm 23 is available in this design preview.');
    return { verses };
  }
  if (path === `bible/readings/${reading.id}`) return { ...reading, verses, thoughts: [...thoughts] };
  if (path === `bible/readings/${reading.id}/thoughts`) {
    const thought: ChildFamilyThought = { ...(body as { verse: number; text: string }), id: crypto.randomUUID(), role: 'child' };
    thoughts.push(thought);
    return { thought };
  }
  if (path.startsWith('materials/')) return { material: notebook.materials.find(item => path === `materials/${item.spaceId}/${item.id}`) };
  if (path.startsWith('notes/') && method === 'GET') return { note: notebook.notes.find(note => note.id === path.slice(6)) };
  if (path === 'notes' || path.startsWith('notes/')) {
    const note = { ...(body as { title: string; content: string }), id: path === 'notes' ? `preview-${crypto.randomUUID()}` : path.slice(6), updatedAt: new Date().toISOString() };
    notebook.notes = [note, ...notebook.notes.filter(item => item.id !== note.id)];
    return { note };
  }
  throw new Error('This action is unavailable in the design preview.');
}
