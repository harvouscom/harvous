export type SharedSpaceMembershipRole = 'owner' | 'leader' | 'member';
export type SidebarListSpaceScope = 'space' | 'my-home';

/** Study thread creation in a shared/public space — owner or leader only. */
export function canManageStudyThreadsInSharedSpace(options: {
  isOwner: boolean;
  membershipRole?: SharedSpaceMembershipRole | null;
}): boolean {
  return options.isOwner || options.membershipRole === 'leader';
}

/** Sidebar folder/thread create actions in the shared-space shell. */
export function canCreateSidebarCollections(options: {
  inSharedSpaceShell: boolean;
  listScope: SidebarListSpaceScope;
  isScopedSharedSpaceList: boolean;
  isOwner: boolean;
  membershipRole?: SharedSpaceMembershipRole | null;
}): boolean {
  if (!options.inSharedSpaceShell) return true;
  if (options.listScope === 'my-home') return false;
  if (!options.isScopedSharedSpaceList) return true;
  return canManageStudyThreadsInSharedSpace({
    isOwner: options.isOwner,
    membershipRole: options.membershipRole,
  });
}

/** Contextual folder/organization controls mirror the backend note-author/space-owner policy. */
export function canOrganizeSharedSpaceNote(options: {
  isOwnNote: boolean;
  isSpaceOwner: boolean;
}): boolean {
  return options.isOwnNote || options.isSpaceOwner;
}

/** Shared-space pinning is moderation and remains owner-only. */
export function canPinSharedSpaceItem(options: { isSpaceOwner: boolean }): boolean {
  return options.isSpaceOwner;
}
