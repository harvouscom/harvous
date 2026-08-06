import { describe, expect, it } from 'vitest';
import {
  MENTION_ITEMS_PER_KIND,
  dedupeNoteItemsById,
  foldersToItems,
  libraryItemsToItems,
  notesToItems,
  threadsToItems,
} from '../mention-picker-source';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import type { StudyThreadCluster } from '../../../hooks/queries/usePrototypeStudyThreads';
import type { FolderBucket } from '../sidebar-universal-search';
import type { MentionPickerItem } from '@/components/react/mention-pill-types';
import type { LibraryItem } from '../../../hooks/queries/useLibrary';
import {
  cycleMentionKindFilter,
  mentionKindFilterOrderFor,
  mentionKindTabsFor,
} from '@/components/react/MentionPickerPanel';

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

function libItem(id: string, title: string, siteName: string | null = null): LibraryItem {
  return {
    id,
    libraryId: 'lib_1',
    kind: 'link',
    title,
    description: null,
    sourceUrl: `https://example.com/${id}`,
    sourceDomain: 'example.com',
    sourceSiteName: siteName,
    sourceImage: null,
    fileName: null,
    fileMime: null,
    fileBytes: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: null,
  };
}

describe('libraryItemsToItems', () => {
  it('carries no spaceId — library items belong to an owner, not a space', () => {
    const [item] = libraryItemsToItems([libItem('libi_1', 'Epistle to the Romans')], '');
    expect(item.kind).toBe('library');
    expect(item.entityId).toBe('libi_1');
    // A non-empty spaceId here would make the pill claim a space it can't be
    // resolved against; resolution goes through /api/library/items/:id instead.
    expect(item.spaceId).toBe('');
  });

  it('subtitles with the bare domain, not the mangled site name', () => {
    // The metadata endpoint derives siteName from the host when a page has no
    // og:site_name, which turns "en.wikipedia.org" into "En Wikipedia". The
    // domain is the honest signal for where a tap goes.
    const withSite = libraryItemsToItems([libItem('a', 'A', 'En Wikipedia')], '');
    expect(withSite[0].subtitle).toBe('example.com');

    const withoutSite = libraryItemsToItems([libItem('b', 'B')], '');
    expect(withoutSite[0].subtitle).toBe('example.com');
  });

  it('fuzzy-matches on title', () => {
    const items = [libItem('a', 'Epistle to the Romans'), libItem('b', 'Gospel of Mark')];
    const matched = libraryItemsToItems(items, 'Epis');
    expect(matched).toHaveLength(1);
    expect(matched[0].entityId).toBe('a');
  });

  it('fuzzy-matches on the source domain too', () => {
    const items = [
      { ...libItem('a', 'Untitled'), sourceDomain: 'en.wikipedia.org' },
      { ...libItem('b', 'Other'), sourceDomain: 'desiringgod.org' },
    ];
    const matched = libraryItemsToItems(items, 'wikipedia');
    expect(matched).toHaveLength(1);
    expect(matched[0].entityId).toBe('a');
  });

  it('returns everything when the query is empty', () => {
    const items = [libItem('a', 'A'), libItem('b', 'B')];
    expect(libraryItemsToItems(items, '')).toHaveLength(2);
  });

  it('caps at the per-kind limit', () => {
    const items = Array.from({ length: MENTION_ITEMS_PER_KIND + 4 }, (_, i) =>
      libItem(`libi_${i}`, `Resource ${i}`),
    );
    expect(libraryItemsToItems(items, '')).toHaveLength(MENTION_ITEMS_PER_KIND);
  });
});

describe('mention kind tabs', () => {
  it('offers Resources only where the kind is available', () => {
    // Personal notes get every kind; a shared space omits 'library' because a
    // personal item can't resolve for other members.
    const personal = mentionKindTabsFor(['note', 'thread', 'folder', 'library']).map((t) => t.id);
    expect(personal).toContain('library');

    const shared = mentionKindTabsFor(['note', 'thread', 'folder']).map((t) => t.id);
    expect(shared).not.toContain('library');
    // 'All' survives either way.
    expect(shared[0]).toBe('all');
  });

  it('cycles only through the tabs the context actually shows', () => {
    const order = mentionKindFilterOrderFor(['note', 'thread', 'folder']);
    expect(order).toEqual(['all', 'note', 'folder', 'thread']);
    // Wrapping from the last tab must land on 'all', never on the hidden library tab.
    expect(cycleMentionKindFilter('thread', 1, order)).toBe('all');
  });
});
