import { describe, expect, it } from 'vitest';
import {
  isProtectedNoteVersion,
  shouldAdvanceCanonicalVersion,
} from '../note-version-service';
import {
  canExposeCanonicalTagInContext,
  collectForbiddenSharedPayloadPaths,
  isPublicCanonicalNoteVisible,
  normalizeSharedNoteOrganizationMutation,
  serializeSharedCanonicalNote,
} from '../shared-note-serializer';

describe('Generation 2B hardening policies', () => {
  it('creates a version for every meaningful save and preserves byte-identical no-ops', () => {
    const current = { title: 'Title', content: '<p>Body</p>', contentEncrypted: false };
    expect(shouldAdvanceCanonicalVersion({ current, next: current, source: 'save' })).toBe(false);
    expect(
      shouldAdvanceCanonicalVersion({
        current,
        next: { ...current, title: 'Changed' },
        source: 'save',
      }),
    ).toBe(true);
    expect(
      shouldAdvanceCanonicalVersion({
        current,
        next: { ...current, content: '<p>Changed</p>' },
        source: 'save',
      }),
    ).toBe(true);
    expect(shouldAdvanceCanonicalVersion({ current, next: current, source: 'restore' })).toBe(true);
  });

  it('retains first, current, restore, and response-referenced versions', () => {
    const base = {
      currentVersionId: 'v-current',
      referencedVersionIds: new Set(['v-anchor']),
    };
    expect(isProtectedNoteVersion({ ...base, id: 'v-first', version: 1, source: 'save' })).toBe(true);
    expect(isProtectedNoteVersion({ ...base, id: 'v-current', version: 150, source: 'save' })).toBe(true);
    expect(isProtectedNoteVersion({ ...base, id: 'v-restore', version: 120, source: 'restore' })).toBe(true);
    expect(isProtectedNoteVersion({ ...base, id: 'v-anchor', version: 110, source: 'save' })).toBe(true);
    expect(isProtectedNoteVersion({ ...base, id: 'v-old', version: 2, source: 'save' })).toBe(false);
  });

  it('serializes shared notes through an explicit privacy allowlist', () => {
    const result = serializeSharedCanonicalNote({
      id: 'note_1',
      simpleNoteId: 7,
      title: 'Shared',
      content: '<p>Safe</p>',
      noteType: 'default',
      lastVisited: new Date('2026-07-01T00:00:00Z'),
      contextSpaceId: 'space_shared',
      contextThreadId: 'thread_shared',
      authorUserId: 'user_author',
      authorDisplayName: 'Ada L.',
      shareToken: 'secret',
      currentVersionId: 'nver_private',
      copiedFromNoteId: 'note_source',
      dismissedAutoTags: '["private"]',
      primaryCollection: 'Private folder',
      associationPrimaryCollection: 'Space folder',
      associationSecondaryCollections: '["Study","space folder","Study"]',
      associationCollectionPinned: true,
      associationIsPinned: true,
      associationOrder: 12,
    });
    expect(result).toMatchObject({
      id: 'note_1',
      simpleNoteId: 7,
      spaceId: 'space_shared',
      threadId: 'thread_shared',
      authorUserId: 'user_author',
      isPinned: true,
      primaryCollection: 'Space folder',
      secondaryCollections: ['Study'],
      collectionPinned: true,
      order: 12,
      organization: {
        isPinned: true,
        primaryCollection: 'Space folder',
        secondaryCollections: ['Study'],
        collectionPinned: true,
        order: 12,
      },
    });
    expect(collectForbiddenSharedPayloadPaths(result)).toEqual([]);
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('lastVisited');
  });

  it('normalizes the association organization mutation contract', () => {
    expect(
      normalizeSharedNoteOrganizationMutation(
        {
          isPinned: true,
          primaryCollection: ' Romans ',
          secondaryCollections: ['Paul', 'romans', 'Paul'],
          collectionPinned: true,
          order: 4,
        },
        {
          isPinned: false,
          primaryCollection: null,
          secondaryCollections: null,
          collectionPinned: false,
          order: 0,
        },
      ),
    ).toEqual({
      patch: {
        isPinned: true,
        primaryCollection: 'Romans',
        secondaryCollections: '["Paul"]',
        collectionPinned: true,
        order: 4,
      },
      organization: {
        isPinned: true,
        primaryCollection: 'Romans',
        secondaryCollections: ['Paul'],
        collectionPinned: true,
        order: 4,
      },
    });
    expect(() =>
      normalizeSharedNoteOrganizationMutation(
        { secondaryCollections: '{"not":"an array"}' },
        {},
      ),
    ).toThrow('secondaryCollections must be an array or JSON string array');
  });

  it('requires active shared context for member tags and exposes only system tags', () => {
    expect(
      canExposeCanonicalTagInContext({
        isAuthor: false,
        hasActiveSharedContext: false,
        isSystemTag: true,
      }),
    ).toBe(false);
    expect(
      canExposeCanonicalTagInContext({
        isAuthor: false,
        hasActiveSharedContext: true,
        isSystemTag: false,
      }),
    ).toBe(false);
    expect(
      canExposeCanonicalTagInContext({
        isAuthor: false,
        hasActiveSharedContext: true,
        isSystemTag: true,
      }),
    ).toBe(true);
    expect(
      canExposeCanonicalTagInContext({
        isAuthor: true,
        hasActiveSharedContext: false,
        isSystemTag: false,
      }),
    ).toBe(true);
  });

  it('never exposes encrypted canonical notes through public links', () => {
    expect(isPublicCanonicalNoteVisible({ isPublic: true, contentEncrypted: false })).toBe(true);
    expect(isPublicCanonicalNoteVisible({ isPublic: true, contentEncrypted: true })).toBe(false);
    expect(isPublicCanonicalNoteVisible({ isPublic: false, contentEncrypted: false })).toBe(false);
  });
});
