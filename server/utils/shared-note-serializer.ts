import {
  normalizeSecondaryLabels,
  parseNoteSecondaryCollections,
  serializeNoteSecondaryCollections,
} from './note-secondary-collections';

export const SHARED_NOTE_FORBIDDEN_KEYS = new Set([
  'shareToken',
  'shareTokenCreatedAt',
  'currentVersionId',
  'copiedFromNoteId',
  'copiedFromVersionId',
  'copiedFromAuthorId',
  'copiedFromAuthorDisplayName',
  'dismissedAutoTags',
  'collectionUserOverride',
  'collectionLastAutoUpdatedAt',
  'studyThreadTitle',
  'studyThreadUserOverride',
  'studyThreadPinned',
  'studyThreadLastAutoSuggestedAt',
  'associationPrimaryCollection',
  'associationSecondaryCollections',
  'associationCollectionPinned',
  'associationCollectionUserOverride',
]);

type SharedNoteSerializationInput = Record<string, any> & {
  id: string;
  title?: string | null;
  content?: string | null;
  simpleNoteId?: number | null;
  noteType?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  lastVisited?: Date | string | null;
  authorUserId?: string | null;
  authorDisplayName?: string | null;
  authorColor?: string | null;
  contextSpaceId: string;
  contextThreadId?: string | null;
  organization?: SharedNoteOrganization | null;
};

export type SharedNoteOrganization = {
  isPinned: boolean;
  primaryCollection: string | null;
  secondaryCollections: string[];
  collectionPinned: boolean;
  order: number;
};

export const SHARED_NOTE_ORGANIZATION_MUTATION_KEYS = [
  'isPinned',
  'primaryCollection',
  'secondaryCollections',
  'collectionPinned',
  'order',
] as const;

export function hasSharedNoteOrganizationMutation(
  payload: Record<string, unknown>,
): boolean {
  return SHARED_NOTE_ORGANIZATION_MUTATION_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key),
  );
}

type SharedNoteOrganizationRow = {
  isPinned?: boolean | null;
  primaryCollection?: string | null;
  secondaryCollections?: string | string[] | null;
  collectionPinned?: boolean | null;
  order?: number | null;
};

export function serializeSharedNoteOrganization(
  input: SharedNoteOrganizationRow,
): SharedNoteOrganization {
  const primaryCollection =
    typeof input.primaryCollection === 'string' && input.primaryCollection.trim()
      ? input.primaryCollection.trim()
      : null;
  const parsedSecondary = Array.isArray(input.secondaryCollections)
    ? input.secondaryCollections
    : parseNoteSecondaryCollections(input.secondaryCollections);
  return {
    isPinned: input.isPinned === true,
    primaryCollection,
    secondaryCollections: normalizeSecondaryLabels(parsedSecondary, primaryCollection),
    collectionPinned: input.collectionPinned === true,
    order:
      typeof input.order === 'number' && Number.isFinite(input.order)
        ? Math.max(0, Math.trunc(input.order))
        : 0,
  };
}

export class SharedNoteOrganizationValidationError extends Error {
  readonly code = 'INVALID_SPACE_NOTE_ORGANIZATION';
}

export function normalizeSharedNoteOrganizationMutation(
  payload: Record<string, unknown>,
  current: SharedNoteOrganizationRow,
): {
  patch: {
    isPinned: boolean;
    primaryCollection: string | null;
    secondaryCollections: string | null;
    collectionPinned: boolean;
    order: number;
  };
  organization: SharedNoteOrganization;
} {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
  if (has('isPinned') && typeof payload.isPinned !== 'boolean') {
    throw new SharedNoteOrganizationValidationError('isPinned must be a boolean');
  }
  if (has('collectionPinned') && typeof payload.collectionPinned !== 'boolean') {
    throw new SharedNoteOrganizationValidationError('collectionPinned must be a boolean');
  }
  if (
    has('primaryCollection') &&
    payload.primaryCollection !== null &&
    typeof payload.primaryCollection !== 'string'
  ) {
    throw new SharedNoteOrganizationValidationError('primaryCollection must be a string or null');
  }
  const primaryCollection = has('primaryCollection')
    ? typeof payload.primaryCollection === 'string' && payload.primaryCollection.trim()
      ? payload.primaryCollection.trim()
      : null
    : serializeSharedNoteOrganization(current).primaryCollection;
  if (primaryCollection && primaryCollection.length > 120) {
    throw new SharedNoteOrganizationValidationError('primaryCollection is too long');
  }

  let secondaryCollections = serializeSharedNoteOrganization(current).secondaryCollections;
  if (has('secondaryCollections')) {
    const raw = payload.secondaryCollections;
    if (raw === null) {
      secondaryCollections = [];
    } else if (Array.isArray(raw)) {
      if (!raw.every((value) => typeof value === 'string')) {
        throw new SharedNoteOrganizationValidationError(
          'secondaryCollections must contain only strings',
        );
      }
      secondaryCollections = raw as string[];
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
          throw new Error('invalid');
        }
        secondaryCollections = parsed;
      } catch {
        throw new SharedNoteOrganizationValidationError(
          'secondaryCollections must be an array or JSON string array',
        );
      }
    } else {
      throw new SharedNoteOrganizationValidationError(
        'secondaryCollections must be an array, JSON string array, or null',
      );
    }
  }
  secondaryCollections = normalizeSecondaryLabels(secondaryCollections, primaryCollection);
  if (secondaryCollections.length > 50 || secondaryCollections.some((label) => label.length > 120)) {
    throw new SharedNoteOrganizationValidationError('secondaryCollections is too large');
  }

  const rawOrder = has('order') ? payload.order : current.order ?? 0;
  if (
    typeof rawOrder !== 'number' ||
    !Number.isInteger(rawOrder) ||
    rawOrder < 0 ||
    rawOrder > 1_000_000
  ) {
    throw new SharedNoteOrganizationValidationError(
      'order must be an integer between 0 and 1000000',
    );
  }

  const organization = serializeSharedNoteOrganization({
    isPinned: has('isPinned') ? payload.isPinned === true : current.isPinned,
    primaryCollection,
    secondaryCollections,
    collectionPinned: has('collectionPinned')
      ? payload.collectionPinned === true
      : current.collectionPinned,
    order: rawOrder,
  });
  return {
    patch: {
      isPinned: organization.isPinned,
      primaryCollection: organization.primaryCollection,
      secondaryCollections: serializeNoteSecondaryCollections(
        organization.secondaryCollections,
      ),
      collectionPinned: organization.collectionPinned,
      order: organization.order,
    },
    organization,
  };
}

export function serializeSharedCanonicalNote(input: SharedNoteSerializationInput) {
  const organization =
    input.organization ??
    serializeSharedNoteOrganization({
      isPinned: input.associationIsPinned,
      primaryCollection: input.associationPrimaryCollection,
      secondaryCollections: input.associationSecondaryCollections,
      collectionPinned: input.associationCollectionPinned,
      order: input.associationOrder,
    });
  return {
    id: input.id,
    simpleNoteId: input.simpleNoteId ?? null,
    title: input.title ?? null,
    content: input.content ?? '',
    noteType: input.noteType ?? 'default',
    contentEncrypted: false,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? input.createdAt ?? null,
    lastUpdated: input.updatedAt ?? input.createdAt ?? null,
    contextSpaceId: input.contextSpaceId,
    spaceId: input.contextSpaceId,
    threadId: input.contextThreadId ?? null,
    organization,
    isPinned: organization.isPinned,
    primaryCollection: organization.primaryCollection,
    secondaryCollections: organization.secondaryCollections,
    collectionPinned: organization.collectionPinned,
    order: organization.order,
    authorUserId: input.authorUserId ?? input.userId ?? null,
    authorDisplayName: input.authorDisplayName?.trim() || 'Member',
    authorColor: input.authorColor ?? 'blue',
    isOwnNote: Boolean(input.isOwnNote),
    /** Author opted this note into co-editing for its shared spaces. */
    coEditEnabled: Boolean(input.coEditEnabled),
    /**
     * The server's own verdict on whether this viewer may write the body. The
     * client must render from this rather than re-deriving from role + flags, so
     * editability can never drift from authorization.
     */
    canEdit: Boolean(input.canEdit),
    /** Everyone who has saved a checkpoint, author first. */
    contributors: Array.isArray(input.contributors) ? input.contributors : [],
    version: input.version,
    resourceTitle: input.resourceTitle ?? null,
    resourceDescription: input.resourceDescription ?? null,
    resourceImage: input.resourceImage ?? null,
    threadColors: input.threadColors,
  };
}

export function collectForbiddenSharedPayloadPaths(
  value: unknown,
  path = '$',
): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenSharedPayloadPaths(item, `${path}[${index}]`),
    );
  }
  const found: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SHARED_NOTE_FORBIDDEN_KEYS.has(key)) found.push(childPath);
    found.push(...collectForbiddenSharedPayloadPaths(nested, childPath));
  }
  return found;
}

export function canExposeCanonicalTagInContext(input: {
  isAuthor: boolean;
  hasActiveSharedContext: boolean;
  isSystemTag: boolean;
}): boolean {
  if (input.isAuthor) return true;
  return input.hasActiveSharedContext && input.isSystemTag;
}

export function isPublicCanonicalNoteVisible(input: {
  isPublic: boolean;
  contentEncrypted: boolean;
}): boolean {
  return input.isPublic && !input.contentEncrypted;
}
