import { describe, expect, it } from 'vitest';
import {
  MENTION_ITEMS_PER_KIND,
  dedupeNoteItemsById,
  foldersToItems,
  notesToItems,
  threadsToItems,
} from '../mention-picker-source';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import type { StudyThreadCluster } from '../../../hooks/queries/usePrototypeStudyThreads';
import type { FolderBucket } from '../sidebar-universal-search';
import type { MentionPickerItem } from '@/components/react/mention-pill-types';

function note(id: string, title: string, updatedAt?: string): SpaceNoteRow {
  return { id, title, updatedAt };
}

function thread(id: string, title: string, noteCount = 1): StudyThreadCluster {
  return {
    id,
    title,
    suggestedTitle: null,
    hasCustomTitle: true,
    noteCount,
    updatedAt: null,
    memberIds: [],
  };
}

describe('notesToItems / threadsToItems / foldersToItems — space scoping', () => {
  it('every note item carries exactly the requested spaceId, never the note author scope', () => {
    const notes = [note('note_1', 'Romans Study'), note('note_2', 'Genesis Study')];
    const items = notesToItems(notes, '', 'space_shared_1');
    expect(items.every((i) => i.spaceId === 'space_shared_1')).toBe(true);
  });

  it('every thread item carries exactly the requested spaceId', () => {
    const threads = [thread('note_1', 'Romans Study')];
    const items = threadsToItems(threads, '', 'space_shared_1');
    expect(items.every((i) => i.spaceId === 'space_shared_1')).toBe(true);
  });

  it('every folder item carries exactly the requested spaceId', () => {
    const folders: FolderBucket[] = [{ name: 'Sermon Notes', count: 3 }];
    const items = foldersToItems(folders, '', 'space_shared_1');
    expect(items.every((i) => i.spaceId === 'space_shared_1')).toBe(true);
  });

  it('excludes the null-named (Unsorted) folder bucket — nothing to mention against', () => {
    const folders: FolderBucket[] = [{ name: null, count: 5 }, { name: 'Sermon Notes', count: 3 }];
    const items = foldersToItems(folders, '', 'space_1');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Sermon Notes');
  });
});

describe('grouping / caps', () => {
  it('caps notes to MENTION_ITEMS_PER_KIND', () => {
    const notes = Array.from({ length: 20 }, (_, i) => note(`note_${i}`, `Note ${i}`));
    const items = notesToItems(notes, '', 'space_1');
    expect(items.length).toBe(MENTION_ITEMS_PER_KIND);
  });

  it('fuzzy-filters by title when a query is given', () => {
    const notes = [note('note_1', 'Romans Study'), note('note_2', 'Genesis Study')];
    const items = notesToItems(notes, 'romans', 'space_1');
    expect(items.map((i) => i.entityId)).toEqual(['note_1']);
  });

  it('adds a relative-date subtitle for notes and a note-count subtitle for threads', () => {
    const noteItems = notesToItems(
      [note('note_1', 'Romans Study', '2026-07-28T12:00:00.000Z')],
      '',
      'space_1',
    );
    expect(noteItems[0]?.subtitle).toBeTruthy();
    expect(threadsToItems([thread('t1', 'Joy', 3)], '', 'space_1')[0]?.subtitle).toBe('3 notes');
    expect(threadsToItems([thread('t2', 'Peace', 1)], '', 'space_1')[0]?.subtitle).toBe('1 note');
  });
});

describe('dedupeNoteItemsById', () => {
  it('keeps the first occurrence and drops later duplicates by entityId', () => {
    const items: MentionPickerItem[] = [
      { kind: 'note', entityId: 'note_1', spaceId: 'space_1', title: 'From client list' },
      { kind: 'note', entityId: 'note_1', spaceId: 'space_1', title: 'From FTS (duplicate)' },
      { kind: 'note', entityId: 'note_2', spaceId: 'space_1', title: 'Other note' },
    ];
    const result = dedupeNoteItemsById(items);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('From client list');
    expect(result.map((i) => i.entityId)).toEqual(['note_1', 'note_2']);
  });
});
