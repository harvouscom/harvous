import { describe, expect, it } from 'vitest';
import {
  canComposeInSpace,
  canCreateSidebarCollections,
  canManageStudyThreadsInSharedSpace,
  canModerateMinistryChannel,
  isMinistryBroadcastSpace,
  resolveLibraryListScope,
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
  it('blocks a channel follower, and anyone whose role is unknown', () => {
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1', role: 'member' })).toBe(false);
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1' })).toBe(false);
  });

  it('lets a channel’s owner and leaders write straight into it', () => {
    // Mirrors the server's canAuthorInSpace: public → owner/leader.
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1', role: 'owner' })).toBe(true);
    expect(canComposeInSpace({ type: 'public', orgId: 'org_1', role: 'leader' })).toBe(true);
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

  it('allows collection create on My Home within a shared space, whatever the room allows', () => {
    // The Library panel's switch shows My Home from inside a room, and the organize host
    // scopes its sheets to Home when it does. A folder made there is a Home folder — a member
    // who could not make one in the room can still make one of their own.
    expect(
      canCreateSidebarCollections({
        inSharedSpaceShell: true,
        listScope: 'my-home',
        isScopedSharedSpaceList: false,
        isOwner: false,
        membershipRole: 'member',
      }),
    ).toBe(true);
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

describe('resolveLibraryListScope', () => {
  const room = { activeSpaceId: 'space_room', homeSpaceId: 'space_home' };

  it('ignores the scope outside a shared space — My Home has nothing else to show', () => {
    expect(
      resolveLibraryListScope({
        activeSpaceId: 'space_home',
        homeSpaceId: 'space_home',
        isSharedSpace: false,
        isOwner: true,
        listScope: 'my-home',
      }),
    ).toEqual({
      viewingHome: false,
      spaceId: 'space_home',
      isScopedSharedSpace: false,
      viewerIsSpaceOwner: true,
    });
  });

  it('shows the room on the space side of the switch', () => {
    expect(
      resolveLibraryListScope({ ...room, isSharedSpace: true, isOwner: false, listScope: 'space' }),
    ).toEqual({
      viewingHome: false,
      spaceId: 'space_room',
      isScopedSharedSpace: true,
      viewerIsSpaceOwner: false,
    });
  });

  it('shows My Home as your own on the My Home side, even to a member of the room', () => {
    // Ownership is what unlocks the row actions on your own notes. A member of the room is
    // still the owner of their Home, and the lists must not treat them as a guest in it.
    expect(
      resolveLibraryListScope({ ...room, isSharedSpace: true, isOwner: false, listScope: 'my-home' }),
    ).toEqual({
      viewingHome: true,
      spaceId: 'space_home',
      isScopedSharedSpace: false,
      viewerIsSpaceOwner: true,
    });
  });

  it('stays in the room when there is no Home id to switch to', () => {
    expect(
      resolveLibraryListScope({
        activeSpaceId: 'space_room',
        homeSpaceId: null,
        isSharedSpace: true,
        listScope: 'my-home',
      }),
    ).toMatchObject({ viewingHome: false, spaceId: 'space_room', isScopedSharedSpace: true });
  });
});
