import { describe, expect, it } from 'vitest';
import {
  canComposeInSpace,
  canCreateSidebarCollections,
  canManageStudyThreadsInSharedSpace,
  canModerateMinistryChannel,
  isMinistryBroadcastSpace,
} from '../shared-space-capabilities';

describe('isMinistryBroadcastSpace', () => {
  it('detects public spaces with an org id', () => {
    expect(isMinistryBroadcastSpace({ type: 'public', orgId: 'org_1' })).toBe(true);
  });

  it('ignores public spaces without org id and collaborative shared spaces', () => {
    expect(isMinistryBroadcastSpace({ type: 'public', orgId: null })).toBe(false);
    expect(isMinistryBroadcastSpace({ type: 'shared', orgId: 'org_1' })).toBe(false);
  });
});

describe('canComposeInSpace', () => {
  it('blocks compose in ministry channels', () => {
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1' })).toBe(false);
  });

  it('allows compose in shared spaces and personal home', () => {
    expect(canComposeInSpace({ type: 'shared', orgId: null })).toBe(true);
    expect(canComposeInSpace({ type: 'personal' })).toBe(true);
  });
});

describe('canModerateMinistryChannel', () => {
  it('allows owners and leaders on ministry channels', () => {
    expect(
      canModerateMinistryChannel({
        isOwner: true,
        membershipRole: 'owner',
        type: 'public',
        orgId: 'org_1',
      }),
    ).toBe(true);
    expect(
      canModerateMinistryChannel({
        isOwner: false,
        membershipRole: 'leader',
        type: 'public',
        orgId: 'org_1',
      }),
    ).toBe(true);
  });

  it('denies followers and non-ministry spaces', () => {
    expect(
      canModerateMinistryChannel({
        isOwner: false,
        membershipRole: 'member',
        type: 'public',
        orgId: 'org_1',
      }),
    ).toBe(false);
    expect(
      canModerateMinistryChannel({
        isOwner: true,
        membershipRole: 'owner',
        type: 'shared',
        orgId: 'org_1',
      }),
    ).toBe(false);
  });
});

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

  it('allows a ministry channel leader — a channel is what a published study is for', () => {
    expect(
      canManageStudyThreadsInSharedSpace({
        isOwner: true,
        membershipRole: 'owner',
        type: 'public',
        orgId: 'org_1',
      }),
    ).toBe(true);
  });

  it('still denies a channel follower, who holds member', () => {
    expect(
      canManageStudyThreadsInSharedSpace({
        isOwner: false,
        membershipRole: 'member',
        type: 'public',
        orgId: 'org_1',
      }),
    ).toBe(false);
  });

  it('does not widen composing — a follower still cannot write into a channel', () => {
    // The two capabilities part company here on purpose: walking a staff-authored plan is
    // not the same permission as posting a loose note into a broadcast room.
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1' })).toBe(false);
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
