export type AssociableSpaceType = 'shared' | 'public';
export type AssociationSpaceRole = 'owner' | 'leader' | 'member';

export type CanonicalNoteAssociationInput = {
  id: string;
  userId: string;
  contentEncrypted: boolean;
};

export type SpaceAssociationTarget = {
  id: string;
  type: string;
  userId: string;
  deletedAt: Date | null;
  recoveryUntil: Date | null;
};

export type SpaceAssociationMembership = {
  id: string;
  spaceId: string;
  userId: string;
  role: string;
};

export type SpaceNoteOrganization = {
  isPinned?: boolean;
  primaryCollection?: string | null;
  secondaryCollections?: string[] | null;
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
  order?: number;
};

export type SpaceNoteAssociationValues = {
  id: string;
  spaceId: string;
  noteId: string;
  addedBy: string;
  addedAt: Date;
  updatedAt: Date;
  removedBy: null;
  removedAt: null;
  isPinned: boolean;
  primaryCollection: string | null;
  secondaryCollections: string | null;
  collectionPinned: boolean;
  collectionUserOverride: boolean;
  order: number;
};

export type SpaceNoteAssociationPatch = Omit<SpaceNoteAssociationValues, 'id' | 'spaceId' | 'noteId'>;

export type SpaceNoteAssociationErrorCode =
  | 'NOT_NOTE_AUTHOR'
  | 'ENCRYPTED_NOTE'
  | 'INVALID_SPACE_TYPE'
  | 'SPACE_DELETED'
  | 'INVALID_RECOVERY_STATE'
  | 'NOT_SPACE_MEMBER'
  | 'ROLE_CANNOT_ASSOCIATE'
  | 'THREAD_NOT_IN_TARGET_SPACE'
  | 'THREAD_NOT_CURRENT'
  | 'THREAD_ATTACH_FORBIDDEN'
  | 'CANNOT_REMOVE_ASSOCIATION';

export class SpaceNoteAssociationError extends Error {
  constructor(
    public readonly code: SpaceNoteAssociationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SpaceNoteAssociationError';
  }
}

function normalizeRole(role: string): AssociationSpaceRole | null {
  return role === 'owner' || role === 'leader' || role === 'member' ? role : null;
}

export const SPACE_RECOVERY_DAYS = 30;

export function isSpaceRecoveryStateValid(space: Pick<SpaceAssociationTarget, 'type' | 'deletedAt' | 'recoveryUntil'>) {
  if (space.deletedAt === null && space.recoveryUntil === null) return true;
  if (space.type === 'personal' || space.deletedAt === null || space.recoveryUntil === null) return false;
  return (
    space.recoveryUntil.getTime() ===
    space.deletedAt.getTime() + SPACE_RECOVERY_DAYS * 24 * 60 * 60 * 1000
  );
}

export function hasValidAssociationMembership(input: {
  actorId: string;
  space: Pick<SpaceAssociationTarget, 'id' | 'userId'>;
  membership: SpaceAssociationMembership | null;
}): boolean {
  if (input.space.userId === input.actorId) return true;
  if (input.membership) {
    return input.membership.spaceId === input.space.id && input.membership.userId === input.actorId;
  }
  return false;
}

function normalizeOrganization(metadata: SpaceNoteOrganization | undefined) {
  const secondaryCollections = [...new Set((metadata?.secondaryCollections ?? []).map((value) => value.trim()))]
    .filter(Boolean);

  return {
    isPinned: metadata?.isPinned === true,
    primaryCollection: metadata?.primaryCollection?.trim() || null,
    secondaryCollections: secondaryCollections.length > 0 ? JSON.stringify(secondaryCollections) : null,
    collectionPinned: metadata?.collectionPinned === true,
    collectionUserOverride: metadata?.collectionUserOverride === true,
    order: Number.isInteger(metadata?.order) ? metadata!.order! : 0,
  };
}

/**
 * Enforces canonical-note sharing invariants before a SpaceNotes insert/reactivation.
 * Shared-space members may associate their own notes; public spaces remain owner/leader authored.
 */
export function assertCanAssociateCanonicalNote(input: {
  note: CanonicalNoteAssociationInput;
  space: SpaceAssociationTarget;
  membership: SpaceAssociationMembership | null;
  actorId: string;
}): void {
  const { note, space, membership, actorId } = input;
  if (note.userId !== actorId) {
    throw new SpaceNoteAssociationError('NOT_NOTE_AUTHOR', 'Only the note author can share the live note');
  }
  if (note.contentEncrypted) {
    throw new SpaceNoteAssociationError('ENCRYPTED_NOTE', 'Encrypted notes cannot be associated with a space');
  }
  if (space.type !== 'shared' && space.type !== 'public') {
    throw new SpaceNoteAssociationError('INVALID_SPACE_TYPE', 'Canonical associations require a shared or public space');
  }
  if (!isSpaceRecoveryStateValid(space)) {
    throw new SpaceNoteAssociationError('INVALID_RECOVERY_STATE', 'The space recovery state is inconsistent');
  }
  if (space.deletedAt) {
    throw new SpaceNoteAssociationError('SPACE_DELETED', 'Deleted spaces cannot receive note associations');
  }
  if (!hasValidAssociationMembership({ actorId, space, membership })) {
    throw new SpaceNoteAssociationError('NOT_SPACE_MEMBER', 'The note author must be a member of the target space');
  }

  const role = membership ? normalizeRole(membership.role) : null;
  const mayAuthorPublic = space.userId === actorId || role === 'leader';
  if (!role && space.userId !== actorId) {
    throw new SpaceNoteAssociationError('ROLE_CANNOT_ASSOCIATE', 'This membership role cannot add notes to the space');
  }
  if (space.type === 'public' && !mayAuthorPublic) {
    throw new SpaceNoteAssociationError('ROLE_CANNOT_ASSOCIATE', 'This membership role cannot add notes to the space');
  }
}

/** Build a new reusable SpaceNotes row. */
export function buildSpaceNoteAssociation(input: {
  id: string;
  spaceId: string;
  noteId: string;
  actorId: string;
  now: Date;
  organization?: SpaceNoteOrganization;
}): SpaceNoteAssociationValues {
  return {
    id: input.id,
    spaceId: input.spaceId,
    noteId: input.noteId,
    addedBy: input.actorId,
    addedAt: input.now,
    updatedAt: input.now,
    removedBy: null,
    removedAt: null,
    ...normalizeOrganization(input.organization),
  };
}

export type CreateThreadAttachmentPlan = {
  attachThreadId: string | null;
  canonicalThreadId: string;
};

/**
 * Shared creation requires a real Thread in the target space and keeps canonical
 * My Home organization unorganized. Personal creation preserves legacy behavior.
 */
export function resolveCreateThreadAttachment(input: {
  requestedThreadId?: string | null;
  targetSpaceId?: string | null;
  targetSpaceType?: string | null;
  actorId: string;
  noteAuthorId: string;
  thread?: { id: string; spaceId: string | null; userId: string; isPinned?: boolean } | null;
}): CreateThreadAttachmentPlan {
  const requested = input.requestedThreadId?.trim() ?? '';
  const isRealThread =
    Boolean(requested) &&
    requested !== 'thread_unorganized' &&
    !requested.startsWith('thread_onboarding_');
  if (!isRealThread) {
    return { attachThreadId: null, canonicalThreadId: 'thread_unorganized' };
  }

  const isCollaborativeTarget =
    Boolean(input.targetSpaceId) &&
    input.targetSpaceType !== null &&
    input.targetSpaceType !== undefined &&
    input.targetSpaceType !== 'personal';
  if (isCollaborativeTarget) {
    if (input.noteAuthorId !== input.actorId) {
      throw new SpaceNoteAssociationError(
        'THREAD_ATTACH_FORBIDDEN',
        'Only the note author can attach the new note to a Thread',
      );
    }
    if (!input.thread || input.thread.id !== requested || input.thread.spaceId !== input.targetSpaceId) {
      throw new SpaceNoteAssociationError(
        'THREAD_NOT_IN_TARGET_SPACE',
        'Thread not found in the target space',
      );
    }
    if (input.thread.isPinned !== true) {
      throw new SpaceNoteAssociationError(
        'THREAD_NOT_CURRENT',
        'Only the current Thread can receive new notes',
      );
    }
    return { attachThreadId: requested, canonicalThreadId: 'thread_unorganized' };
  }

  if (input.thread?.id === requested && input.thread.userId === input.actorId) {
    return { attachThreadId: requested, canonicalThreadId: requested };
  }
  return { attachThreadId: null, canonicalThreadId: 'thread_unorganized' };
}

/**
 * Reactivate the existing unique (spaceId,noteId) row.
 * Organization defaults are intentionally cleared so archived folder/pin placement is not restored silently.
 */
export function buildSpaceNoteReactivationPatch(input: {
  actorId: string;
  now: Date;
  organization?: SpaceNoteOrganization;
}): SpaceNoteAssociationPatch {
  return {
    addedBy: input.actorId,
    addedAt: input.now,
    updatedAt: input.now,
    removedBy: null,
    removedAt: null,
    ...normalizeOrganization(input.organization),
  };
}

/** Only the note author or the space owner may archive an active association. */
export function buildSpaceNoteRemovalPatch(input: {
  actorId: string;
  noteAuthorId: string;
  spaceId: string;
  spaceOwnerId: string;
  membership: SpaceAssociationMembership | null;
  now: Date;
}): { removedBy: string; removedAt: Date; updatedAt: Date } {
  if (
    input.membership &&
    (input.membership.userId !== input.actorId || input.membership.spaceId !== input.spaceId)
  ) {
    throw new SpaceNoteAssociationError('CANNOT_REMOVE_ASSOCIATION', 'Membership does not match actor and space');
  }
  const verifiedOwner = input.spaceOwnerId === input.actorId;
  if (input.actorId !== input.noteAuthorId && !verifiedOwner) {
    throw new SpaceNoteAssociationError(
      'CANNOT_REMOVE_ASSOCIATION',
      'Only the note author or space owner can remove this note',
    );
  }
  return { removedBy: input.actorId, removedAt: input.now, updatedAt: input.now };
}

export function isActiveSpaceNote(row: { removedAt: Date | null }): boolean {
  return row.removedAt === null;
}

export type LegacyAssociationCandidateReason =
  | 'eligible'
  | 'encrypted-note'
  | 'invalid-space-type'
  | 'deleted-space'
  | 'invalid-recovery-state'
  | 'missing-membership';

/** Pure policy shared by migration preflight and apply-time revalidation. */
export function assessLegacyAssociationCandidate(input: {
  note: CanonicalNoteAssociationInput;
  space: SpaceAssociationTarget;
  membership: SpaceAssociationMembership | null;
}): LegacyAssociationCandidateReason {
  try {
    assertCanAssociateCanonicalNote({
      note: input.note,
      space: input.space,
      membership: input.membership,
      actorId: input.note.userId,
    });
    return 'eligible';
  } catch (error) {
    if (!(error instanceof SpaceNoteAssociationError)) throw error;
    switch (error.code) {
      case 'ENCRYPTED_NOTE':
        return 'encrypted-note';
      case 'INVALID_SPACE_TYPE':
        return 'invalid-space-type';
      case 'SPACE_DELETED':
        return 'deleted-space';
      case 'INVALID_RECOVERY_STATE':
        return 'invalid-recovery-state';
      case 'NOT_SPACE_MEMBER':
      case 'ROLE_CANNOT_ASSOCIATE':
        return 'missing-membership';
      default:
        throw error;
    }
  }
}
