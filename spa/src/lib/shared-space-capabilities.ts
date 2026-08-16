export type SharedSpaceMembershipRole = 'owner' | 'leader' | 'member';
export type SidebarListSpaceScope = 'space' | 'my-home';

/**
 * Org-owned ministry education channel (broadcast), not a collaborative Shared Space.
 * Discrimination (no isMinistryBroadcast column): public+orgId = channel;
 * shared+orgId = church Shared Space; shared without orgId = personal Shared Space.
 */
export function isMinistryBroadcastSpace(options: {
  type?: 'personal' | 'shared' | 'public' | string | null;
  orgId?: string | null;
}): boolean {
  return options.type === 'public' && Boolean(options.orgId);
}

/**
 * Staff pilot: ministry channels are read-only in product UI (browse only).
 * Compose / thread create / invite land with later church education features.
 */
export function canComposeInSpace(options: {
  type?: 'personal' | 'shared' | 'public' | string | null;
  orgId?: string | null;
}): boolean {
  return !isMinistryBroadcastSpace(options);
}

/**
 * Church admins/leaders may see channel followers for moderation.
 * Followers never see a public subscriber roster or people count.
 */
export function canModerateMinistryChannel(options: {
  isOwner: boolean;
  membershipRole?: SharedSpaceMembershipRole | null;
  type?: 'personal' | 'shared' | 'public' | string | null;
  orgId?: string | null;
}): boolean {
  if (!isMinistryBroadcastSpace(options)) return false;
  return options.isOwner || options.membershipRole === 'leader';
}

/**
 * Study thread creation in a shared/public space — owner or leader only.
 *
 * Ministry channels are included rather than excluded, mirroring the server's
 * `canManageSpaceThreadStructure`. A channel is the room a published study is *for*: staff
 * author the steps and the congregation walks them, so a follower being unable to compose is
 * the point rather than a reason to withhold the plan. Followers hold `member` and fail the
 * same role check a shared-space member fails.
 *
 * Note this is not `canComposeInSpace`, which stays false for a channel — writing a loose note
 * into a broadcast room is still not a thing a follower does.
 */
export function canManageStudyThreadsInSharedSpace(options: {
  isOwner: boolean;
  membershipRole?: SharedSpaceMembershipRole | null;
  type?: 'personal' | 'shared' | 'public' | string | null;
  orgId?: string | null;
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
  type?: 'personal' | 'shared' | 'public' | string | null;
  orgId?: string | null;
}): boolean {
  if (!options.inSharedSpaceShell) return true;
  if (options.listScope === 'my-home') return false;
  if (!options.isScopedSharedSpaceList) return true;
  return canManageStudyThreadsInSharedSpace({
    isOwner: options.isOwner,
    membershipRole: options.membershipRole,
    type: options.type,
    orgId: options.orgId,
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

export interface NoteContributor {
  userId: string;
  displayName: string;
  color: string;
}

/**
 * Byline for a co-edited note. The author never stops being the author — the
 * server keeps Notes.userId fixed — so the line always starts with them and
 * everyone else is credited as an editor.
 *
 * Returns null when there's nothing worth saying (solo note, or no data yet).
 */
export function formatNoteContributors(
  contributors: NoteContributor[],
  authorUserId: string | null | undefined,
  selfUserId?: string | null,
): string | null {
  if (contributors.length === 0) return null;
  const author = contributors.find((person) => person.userId === authorUserId) ?? contributors[0];
  const editors = contributors.filter((person) => person.userId !== author.userId);

  const name = (person: NoteContributor) =>
    selfUserId && person.userId === selfUserId ? 'you' : person.displayName;

  if (editors.length === 0) return null;
  if (editors.length === 1) return `Started by ${name(author)} · edited by ${name(editors[0])}`;
  if (editors.length === 2) {
    return `Started by ${name(author)} · edited by ${name(editors[0])} and ${name(editors[1])}`;
  }
  return `Started by ${name(author)} · edited by ${name(editors[0])} and ${editors.length - 1} others`;
}
