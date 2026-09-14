/**
 * Settings › Sharing's one list.
 *
 * The page mixes four kinds of sharing, so the rules that decide what a person sees are the order,
 * the filter, and what each row says it is — all pinned here rather than read off a screenshot.
 */
import { describe, expect, it } from 'vitest';
import type { SharedNoteItem } from '../../../../hooks/queries/useMySharing';
import type { OwnedSharedSpaceItem } from '../../../../hooks/queries/useMySharedSpaces';
import type { MySharedSpaceNoteItem } from '../../../../hooks/queries/useMySharedSpaceNotes';
import type { MyDiscoverSubmission } from '../../../../hooks/queries/useDiscoverListings';
import {
  buildSharingItems,
  discoverActionFor,
  discoverStatusLabel,
  filterSharingItems,
  sharingEmptyCopy,
  sharingItemMeta,
  SHARING_FILTERS,
} from '../sharing-items';

function link(id: string, sharedAt: string): SharedNoteItem {
  return { id, title: `Link ${id}`, shareToken: 'tok', shareUrl: 'https://x/shared/note/tok', sharedAt };
}

function space(id: string, createdAt: string, memberCount = 3): OwnedSharedSpaceItem {
  return { id, title: `Space ${id}`, memberCount, createdAt };
}

function spaceNote(noteId: string, spaceId: string, addedAt: string): MySharedSpaceNoteItem {
  return { noteId, title: `Note ${noteId}`, spaceId, spaceTitle: 'Family', addedAt };
}

function submission(
  id: string,
  status: MyDiscoverSubmission['status'],
  createdAt: string,
): MyDiscoverSubmission {
  return {
    id,
    slug: null,
    kind: 'note',
    title: `Offer ${id}`,
    description: null,
    category: null,
    status,
    reviewNote: null,
    installCount: 0,
    createdAt,
    reviewedAt: null,
    listedAt: null,
  };
}

describe('buildSharingItems', () => {
  it('merges every kind into one list, newest first', () => {
    const items = buildSharingItems({
      links: [link('n1', '2026-09-01T00:00:00Z')],
      spaces: { owned: [space('s1', '2026-09-03T00:00:00Z')], memberOf: [space('s2', '2026-08-01T00:00:00Z')] },
      spaceNotes: [spaceNote('n2', 's1', '2026-09-04T00:00:00Z')],
      discover: [submission('d1', 'submitted', '2026-09-02T00:00:00Z')],
    });
    expect(items.map((item) => item.id)).toEqual([
      'space-note:s1:n2',
      'space:s1',
      'discover:d1',
      'link:n1',
      'space:s2',
    ]);
  });

  it('keeps a note that is both public and in a space as two rows', () => {
    // Two different things you did, each with its own way to undo it.
    const items = buildSharingItems({
      links: [link('n1', '2026-09-01T00:00:00Z')],
      spaceNotes: [spaceNote('n1', 's1', '2026-09-01T00:00:00Z')],
    });
    expect(items.map((item) => item.kind).sort()).toEqual(['link', 'space-note']);
  });

  it('marks which spaces you own and which you joined', () => {
    const items = buildSharingItems({
      spaces: { owned: [space('s1', '2026-09-03T00:00:00Z')], memberOf: [space('s2', '2026-09-02T00:00:00Z')] },
    });
    expect(items.map((item) => (item.kind === 'space' ? item.role : null))).toEqual(['owner', 'member']);
  });

  it('leaves out a submission a newer one replaced', () => {
    const items = buildSharingItems({
      discover: [
        submission('old', 'superseded', '2026-09-01T00:00:00Z'),
        submission('new', 'listed', '2026-09-02T00:00:00Z'),
      ],
    });
    expect(items.map((item) => item.id)).toEqual(['discover:new']);
  });

  it('sorts a row with no timestamp last rather than crashing on an older response', () => {
    const items = buildSharingItems({
      links: [link('n1', '2026-09-01T00:00:00Z')],
      spaces: { owned: [{ id: 's1', title: 'No date', memberCount: 1 }] },
    });
    expect(items.map((item) => item.id)).toEqual(['link:n1', 'space:s1']);
  });
});

describe('filterSharingItems', () => {
  const items = buildSharingItems({
    links: [link('n1', '2026-09-01T00:00:00Z')],
    spaces: { owned: [space('s1', '2026-09-02T00:00:00Z')] },
    spaceNotes: [spaceNote('n2', 's1', '2026-09-03T00:00:00Z')],
    discover: [submission('d1', 'waiting' as never, '2026-09-04T00:00:00Z')],
  });

  it('offers All, Public links, Shared spaces and Discover', () => {
    expect(SHARING_FILTERS.map((option) => option.label)).toEqual([
      'All',
      'Public links',
      'Shared spaces',
      'Discover',
    ]);
  });

  it('keeps notes you put in a space under Shared spaces, with the spaces', () => {
    expect(filterSharingItems(items, 'space').map((item) => item.kind).sort()).toEqual([
      'space',
      'space-note',
    ]);
  });

  it('narrows to one kind for links and for Discover', () => {
    expect(filterSharingItems(items, 'link').map((item) => item.id)).toEqual(['link:n1']);
    expect(filterSharingItems(items, 'discover').map((item) => item.id)).toEqual(['discover:d1']);
    expect(filterSharingItems(items, 'all')).toHaveLength(4);
  });
});

describe('Discover submissions', () => {
  it('can be withdrawn while waiting and stopped once listed, and nothing after that', () => {
    // Sharing should be as reversible as it was voluntary.
    expect(discoverActionFor('submitted')).toBe('withdraw');
    expect(discoverActionFor('listed')).toBe('stop');
    for (const status of ['declined', 'withdrawn', 'delisted', 'superseded'] as const) {
      expect(discoverActionFor(status)).toBeNull();
    }
  });

  it('says where each one stands in plain words', () => {
    expect(discoverStatusLabel('submitted')).toBe('Waiting');
    expect(discoverStatusLabel('withdrawn')).toBe('Taken back');
  });
});

describe('sharingItemMeta', () => {
  const relative = (iso: string | null) => (iso ? '2d' : null);

  it('leads every row with what kind of sharing it is', () => {
    const [linkItem, spaceItem, noteItem, discoverItem] = [
      buildSharingItems({ links: [link('n1', '2026-09-01T00:00:00Z')] })[0],
      buildSharingItems({ spaces: { owned: [space('s1', '2026-09-01T00:00:00Z', 5)] } })[0],
      buildSharingItems({ spaceNotes: [spaceNote('n2', 's1', '2026-09-01T00:00:00Z')] })[0],
      buildSharingItems({ discover: [submission('d1', 'submitted', '2026-09-01T00:00:00Z')] })[0],
    ];
    expect(sharingItemMeta(linkItem, relative)).toEqual(['Public link', '2d']);
    expect(sharingItemMeta(spaceItem, relative)).toEqual(['Shared space', 'Owner', '5 members']);
    expect(sharingItemMeta(noteItem, relative)).toEqual(['In Family', '2d']);
    expect(sharingItemMeta(discoverItem, relative)).toEqual(['Discover', 'Waiting', '2d']);
  });

  it('says one member, not one members', () => {
    const [item] = buildSharingItems({ spaces: { memberOf: [space('s1', '2026-09-01T00:00:00Z', 1)] } });
    expect(sharingItemMeta(item, relative)).toEqual(['Shared space', 'Member', '1 member']);
  });
});

describe('sharingEmptyCopy', () => {
  it('has something to say for every filter', () => {
    for (const option of SHARING_FILTERS) {
      expect(sharingEmptyCopy(option.id).length).toBeGreaterThan(0);
    }
  });
});
