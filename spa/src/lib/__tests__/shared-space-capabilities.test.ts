import { describe, expect, it } from 'vitest';
import {
  canCreateSidebarCollections,
  canManageStudyThreadsInSharedSpace,
} from '../shared-space-capabilities';

describe('canManageStudyThreadsInSharedSpace', () => {
  it('allows space owners', () => {
    expect(canManageStudyThreadsInSharedSpace({ isOwner: true, membershipRole: 'member' })).toBe(true);
  });

  it('allows leaders who are not owners', () => {
    expect(canManageStudyThreadsInSharedSpace({ isOwner: false, membershipRole: 'leader' })).toBe(true);
  });

  it('denies regular members', () => {
    expect(canManageStudyThreadsInSharedSpace({ isOwner: false, membershipRole: 'member' })).toBe(false);
  });
});

describe('canCreateSidebarCollections', () => {
  it('allows collection create outside the shared-space shell', () => {
    expect(
      canCreateSidebarCollections({
        inSharedSpaceShell: false,
        listScope: 'my-home',
        isScopedSharedSpaceList: false,
        isOwner: false,
        membershipRole: 'member',
      }),
    ).toBe(true);
  });

  it('denies collection create on My Home within a shared space', () => {
    expect(
      canCreateSidebarCollections({
        inSharedSpaceShell: true,
        listScope: 'my-home',
        isScopedSharedSpaceList: false,
        isOwner: true,
        membershipRole: 'owner',
      }),
    ).toBe(false);
  });

  it('allows owners on This space', () => {
    expect(
      canCreateSidebarCollections({
        inSharedSpaceShell: true,
        listScope: 'space',
        isScopedSharedSpaceList: true,
        isOwner: true,
        membershipRole: 'owner',
      }),
    ).toBe(true);
  });

  it('denies members on This space', () => {
    expect(
      canCreateSidebarCollections({
        inSharedSpaceShell: true,
        listScope: 'space',
        isScopedSharedSpaceList: true,
        isOwner: false,
        membershipRole: 'member',
      }),
    ).toBe(false);
  });
});
