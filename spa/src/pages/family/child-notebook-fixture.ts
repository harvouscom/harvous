// Development fixture loaded only from the isolated entry's dev-only preview branch.
import { defaultChildPreferences, type ChildBibleTranslation, type ChildFamilyThought, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
import type { ChildSearchResult, ChildSearchScope } from './types';
import { initialNotes, initialCatalog } from '../prototype/ChildNotebookView';
import type { Notebook } from './child-main';
import chapters from './child-preview-chapters.json';
import type { ReviewItemView } from '../../hooks/queries/useReview';
const verses = chapters.BSB['Psalms:23'];

const reading = { id: 'preview-psalm', book: 'Psalms', chapter: 23, translation: 'BSB' as const };
// Sample verse stickers, so the margin shows one before the child has placed any.
const stickers = new Map<string, string>([['Psalms:23:1', 'star'], ['John:1:5', 'sun']]);
// Sample highlights, kept for the preview session like the real ones are on the server.
const highlights = new Map<string, string>([['John:1:4', 'mintGreen']]);
const thoughts: ChildFamilyThought[] = [{ id: 'preview-thought', verse: 1, role: 'parent', text: 'Which words would you like to remember?' }];
const notebook: Notebook = {
  displayName: 'Sam', privacyUrl: '#preview-privacy-policy', preferences: { ...defaultChildPreferences }, translations: ['BSB', 'NIV', 'NLT'], readings: [reading],
  catalog: structuredClone(initialCatalog),
  notes: initialNotes.map(({ date, ...note }) => ({ ...note, updatedAt: date })),
  materials: [{ id: 'preview-reading', spaceId: 'preview-ministry', title: 'This week’s reading', content: 'What’s one kind thing you could do for someone this week?', spaceTitle: 'Kids ministry', updatedAt: null }]
};
// A sample Look back sitting: one choice, one note to think back on, one verse to put in order.
// Marked here the way the server marks it, so the dock can be tried without an account.
const lookBackItem = (id: string, kind: 'verse' | 'note', prompt: string, extra: Partial<ReviewItemView>): ReviewItemView => ({
  id, kind, prompt, task: prompt, exercise: null, framing: null, promptKey: `${kind}.preview`, recallState: 'new', status: 'active',
  origin: 'user', dueAt: new Date().toISOString(), reviewCount: 0, ladderStep: 0, noteTitle: null, secondaryNoteTitle: null,
  noteLabel: null, noteContext: null, noteWrittenAt: null, scriptureReference: null, noteId: null, challengeId: null,
  sourceLabel: null, sourceAt: null, cue: null, translation: 'BSB', ...extra,
});
const lookBackItems = [
  lookBackItem('lb-verse', 'verse', 'Which words finish this verse?', { scriptureReference: 'Psalms 23:1' }),
  lookBackItem('lb-note', 'note', 'What did you notice in this note?', { noteTitle: 'A little kindness', noteId: 'sample-3' }),
  lookBackItem('lb-order', 'verse', 'Put the verse back in order', { scriptureReference: 'John 1:5' }),
];
const lookBackAnswers: Record<string, unknown> = { 'lb-verse': 'I shall not want.', 'lb-order': [0, 1, 2] };
const lookBackReveals = {
  'lb-verse': { choice: { options: ['I shall not want.', 'I will fear no evil.', 'He restores my soul.'], opening: false }, verseText: 'The LORD is my shepherd; I shall not want.' },
  'lb-order': { sequence: { phrases: ['The Light shines in the darkness,', 'and the darkness', 'has not overcome it.'] }, verseText: 'The Light shines in the darkness, and the darkness has not overcome it.' },
};
let lookBackAttempts: Record<string, number> = {};

export function previewRequest(path: string, method: string, body: unknown): unknown {
  if (path.startsWith('look-back')) {
    if (path.startsWith('look-back?')) { lookBackAttempts = {}; return { items: lookBackItems, reveals: lookBackReveals }; }
    const [, id, action] = path.split('/');
    if (action === 'reveal') return (lookBackReveals as Record<string, unknown>)[id] ?? { verseText: null };
    const answer = (body as { outcome?: string; answer?: { option?: string; order?: number[] } }) ?? {};
    const key = lookBackAnswers[id];
    const tries = (lookBackAttempts[id] = (lookBackAttempts[id] ?? 0) + 1);
    const verseText = (lookBackReveals as Record<string, { verseText?: string }>)[id]?.verseText;
    if (key === undefined) return { finalized: true, outcome: answer.outcome, next: { label: 'Back in a few days' } };
    const correct = Array.isArray(key) ? JSON.stringify(answer.answer?.order) === JSON.stringify(key) : answer.answer?.option === key;
    if (!correct && tries < 2) return { finalized: false, correct: false, attemptsLeft: 1, hint: 'Have another look at how it starts.' };
    return { finalized: true, correct, outcome: correct ? 'recalled' : 'revealed', ...(correct ? {} : { correctAnswer: Array.isArray(key) ? undefined : key }),
      truth: verseText ? { verseText } : undefined, next: { label: correct ? 'Back in about two weeks' : 'Back tomorrow' } };
  }
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
    const { book, chapter, translation } = body as { book: string; chapter: number; translation: ChildBibleTranslation };
    const available = (chapters as Partial<Record<ChildBibleTranslation, Record<string, { verse: number; text: string }[]>>>)[translation];
    const passage = available?.[`${book}:${chapter}`];
    if (!passage?.length) throw new Error('John 1, John 2, Luke 24, and Psalm 23 are available in this design preview.');
    const prefix = `${book}:${chapter}:`;
    return { verses: passage, stickers: [...stickers].filter(([key]) => key.startsWith(prefix))
      .map(([key, sticker]) => ({ verse: Number(key.slice(prefix.length)), sticker })),
      highlights: [...highlights].filter(([key]) => key.startsWith(prefix))
        .map(([key, color]) => ({ verse: Number(key.slice(prefix.length)), color })) };
  }
  if (path === 'bible/highlights') {
    const { book, chapter, verse, color } = body as { book: string; chapter: number; verse: number; color: string | null };
    if (color) highlights.set(`${book}:${chapter}:${verse}`, color); else highlights.delete(`${book}:${chapter}:${verse}`);
    return { highlight: { verse, color } };
  }
  if (path === 'bible/stickers') {
    const { book, chapter, verse, sticker } = body as { book: string; chapter: number; verse: number; sticker: string | null };
    if (sticker) stickers.set(`${book}:${chapter}:${verse}`, sticker); else stickers.delete(`${book}:${chapter}:${verse}`);
    return { sticker: { verse, sticker } };
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
    const input = body as { title: string; content: string; details?: {
      folder: string | null; tags: string[]; threads: string[];
      scripture: { book: string; chapter: number; verse: number; translation: string }[];
      resources: { spaceId: string; noteId: string }[];
    } };
    const details = input.details;
    const catalog = notebook.catalog!;
    const tagIds = details?.tags.map(name => {
      const tag = catalog.tags.find(item => item.name === name) ?? { id: crypto.randomUUID(), name };
      if (!catalog.tags.includes(tag)) catalog.tags.push(tag);
      return tag.id;
    });
    const threadIds = details?.threads.map(title => {
      const thread = catalog.threads.find(item => item.title === title) ?? { id: crypto.randomUUID(), title };
      if (!catalog.threads.includes(thread)) catalog.threads.push(thread);
      return thread.id;
    });
    if (details?.folder && !catalog.folders.includes(details.folder)) catalog.folders.push(details.folder);
    const note = { title: input.title, content: input.content, primaryCollection: details?.folder, tagIds, threadIds,
      attachments: details && [
        ...details.scripture.map(item => ({ ...item, kind: 'scripture' as const, reference: `${item.book} ${item.chapter}:${item.verse}` })),
        ...details.resources.map(item => ({ kind: 'resource' as const, resourceId: JSON.stringify([item.spaceId, item.noteId]) }))
      ],
      id: path === 'notes' ? `preview-${crypto.randomUUID()}` : path.slice(6), updatedAt: 'Today'
    };
    notebook.notes = [note, ...notebook.notes.filter(item => item.id !== note.id)];
    return { note, catalog: structuredClone(catalog) };
  }
  throw new Error('This action is unavailable in the design preview.');
}
