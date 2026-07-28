/**
 * Spaces routes — Hono port of src/pages/api/spaces/*.ts
 *
 * Endpoints:
 *   POST   /api/spaces/create
 *   POST   /api/spaces/create-shared
 *   POST   /api/spaces/create-church-shared
 *   POST   /api/spaces/create-ministry-channel
 *   DELETE /api/spaces/delete
 *   GET    /api/spaces/deleted
 *   GET    /api/spaces/items
 *   POST   /api/spaces/:spaceId/update
 *   GET    /api/spaces/:spaceId/notes
 *   POST   /api/spaces/:spaceId/folders/remove
 *   POST   /api/spaces/:spaceId/threads/remove
 *   GET    /api/spaces/:spaceId/study-thread-highlights
 *   GET    /api/spaces/:spaceId/scripture-index
 *   GET    /api/spaces/:spaceId/scripture-connections
 *   GET    /api/spaces/:spaceId/reference-word-connections
 *   GET    /api/spaces/:spaceId/study-threads/by-scripture
 *   GET    /api/spaces/:spaceId/study-threads
 *   GET    /api/spaces/:spaceId/connect-note-candidates
 *   GET    /api/spaces/:spaceId/items
 *   GET    /api/spaces/:spaceId/bootstrap
 *   GET    /api/spaces/:spaceId/prefetch
 *   POST   /api/spaces/:spaceId/add-note
 *   POST   /api/spaces/:spaceId/add-thread
 *   POST   /api/spaces/:spaceId/add-items
 *   POST   /api/spaces/:spaceId/remove-items
 *   GET    /api/spaces/:spaceId/share-link
 *   POST   /api/spaces/:spaceId/share-link
 *   GET    /api/spaces/:spaceId/members
 *   POST   /api/spaces/:spaceId/members/invite
 *   DELETE /api/spaces/:spaceId/members/:userId
 *   POST   /api/spaces/join/:token
 *   GET    /api/spaces/join-preview/:token
 */

import { Hono } from 'hono';
import { getTableColumns } from 'drizzle-orm';
import { getAuth, getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Spaces, Notes, Threads, NoteThreads, Members, SpaceInvitations, SpaceMemberships, SpaceInvites, SpaceNotes, UserMetadata, ResourceMetadata, ScriptureMetadata,
  StudyThreadEntries, NoteConnections, Tags, NoteTags,
  eq, and, ne, count, inArray, notInArray, desc, asc, sql, isNull, isNotNull, gt, gte, or,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { parseNoteSecondaryCollections, serializeNoteSecondaryCollections } from '../utils/note-secondary-collections';
import { computeNoteFolderRemovalPatch } from '@/utils/folder-bulk-actions';
import {
  addPrototypeEmptyFolderLabel,
  isReservedPrototypeFolderLabel,
  parsePrototypeEmptyFolderLabels,
  removePrototypeEmptyFolderLabel,
  serializePrototypeEmptyFolderLabels,
} from '../utils/prototype-empty-folder-labels';
import {
  filterThreadClusterEdgesForRemoval,
  normalizeThreadClusterMemberIds,
} from '@/utils/thread-cluster-bulk-actions';
import {
  broadcastCanonicalNoteInvalidation,
  broadcastNoteInvalidation,
} from '../utils/broadcast-shared-space-note';
import { broadcastInvalidation } from '../utils/realtime';
import { queueAudiencefulProductFlagsForUser } from '../utils/audienceful-product-flags';
import { recordDeletedEntities } from '../utils/sync-deletion-log';
import {
  getSpacesWithCounts,
  getNotesForSpace,
  getNotesForSharedSpace,
  getThreadsForSpace,
  getThreadsForSpaceBySpaceId,
  visibleSharedThreadsForViewer,
  getThreadColorsForNotesBatch,
  batchAuthorAttribution,
} from '../utils/dashboard-data';
import {
  requireSpaceAccess,
  SpaceAccessError,
  canAuthorInSpace,
  canManageSpaceStructure,
  isActualSpaceOwner,
} from '../utils/space-access';
import {
  getSharedSpaceActivityPreview,
  isNoteNewSinceVisit,
  recordSharedSpaceVisit,
} from '../utils/shared-space-visit';
import {
  buildChannelCadenceFields,
  getLastCurriculumAtForSpace,
  isMinistryBroadcastSpaceRow,
  parsePublishCadenceInput,
} from '../utils/channel-publish-cadence';
import { listGroupStudyThreadsForSpace } from '../utils/shared-space-group-threads';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { awardCreationBonusXP } from '../utils/xp-system';
import {
  canCreateSharedSpace,
  getSpaceMemberCount,
  hasSharedSpacesAddOn,
  hasSharedSpacesAddOnForUserId,
  MEMBERS_PER_SPACE_CAP,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
  FREE_OWNED_SHARED_SPACES_LIMIT,
} from '../utils/tier-limits';
import { syncEntitlementsFromProvider } from '../utils/entitlements';
import {
  assertCanCreateChurchSharedSpace,
  assertCanCreateMinistryChannel,
} from '../utils/church-staff';
import { getThreadGradientCSS } from '@/utils/colors';
import {
  serializeSpaceCoverForDb,
  spaceCoverApiFields,
  spaceCoverFromThreadColor,
  appearanceAccentHexFromCoverBg,
  appearanceAccentForThreadColor,
  coerceSpaceCoverBgInput,
} from '@/utils/space-cover';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle, validateColor } from '@/utils/validation';
import { rateLimit } from '@/utils/rate-limit';
import { generateSpaceId, generateShareToken, generateNoteId } from '@/utils/ids';
import { idToUrl } from '@/utils/url-helpers';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { buildSpaceScriptureIndex } from '../utils/build-space-scripture-index';
import { buildSpaceScriptureConnections } from '../utils/build-space-scripture-connections';
import { buildSpaceReferenceWordConnections } from '../utils/build-space-reference-word-connections';
import {
  NOT_ONBOARDING_NOTES_THREAD,
  NOT_ONBOARDING_SYSTEM_NOTES,
  isOnboardingSystemNote,
} from '../utils/purge-onboarding-content';
import { buildSpaceReferencesIndex } from '../utils/build-space-references-index';
import { getPublicAppOrigin } from '../utils/public-app-origin';
import { mapStudyRow } from './study-threads';
import { isStudyThreadEntriesTableMissing } from '../utils/pg-undefined-relation';
import { ensurePersonalHomeSpace } from '../utils/ensure-personal-home-space';
import { createInitialNoteVersion } from '../utils/note-version-service';
import { buildIndependentCopyAttribution } from '../utils/note-versioning';
import {
  SharedSpaceLifecycleError,
  archiveNoteFromSpace,
  associateAuthoredNoteWithSpace,
  canRestoreDeletedSpace,
  removeMemberPreservingResponses,
  serializeSpaceMemberForViewer,
  serializeInvitePreview,
  safeMemberDisplayName,
  runBoundedExpiredSpaceMaintenance,
  evaluateLockedInviteRedemption,
  setSingularThreadPin,
  softDeleteSharedSpaceInTransaction,
} from '../utils/shared-space-lifecycle';
import {
  pickStudyThreadRepresentativeNoteId,
  suggestStudyThreadTitleFromNodes,
  type StudyThreadSuggestNode,
} from '@/utils/suggest-study-thread-title';
import { fetchStudyThreadNoteRows } from '../utils/study-thread-note-rows';
import { resolveStudyThreadClusterNaming } from '../utils/study-thread-cluster-naming';
import { studyThreadEligibleForHighlightList } from '@/utils/study-thread-highlight-eligibility';
import { sortStudyThreadClustersByTitle } from '@/utils/sorting';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import {
  hasSharedNoteOrganizationMutation,
  normalizeSharedNoteOrganizationMutation,
  serializeSharedNoteOrganization,
  SharedNoteOrganizationValidationError,
  SHARED_NOTE_ORGANIZATION_MUTATION_KEYS,
} from '../utils/shared-note-serializer';

const route = new Hono();

function normalizePrototypeSpaceId(spaceIdRaw: string): string {
  return spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
}

function activeSpaceNotePredicate(spaceId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${SpaceNotes}
    WHERE ${SpaceNotes.spaceId} = ${spaceId}
      AND ${SpaceNotes.noteId} = ${Notes.id}
      AND ${SpaceNotes.removedAt} IS NULL
  )`;
}

/** Upper bound on rows the unioned shared-space highlights list returns. */
const SHARED_HIGHLIGHT_LIST_MAX_ROWS = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Delete highlight responses (StudyThreadEntries authored by someone other than
 * the note's author) on notes leaving a shared space. Responses belong to the
 * space conversation — once the note re-homes to a personal space they would
 * surface as foreign rows in personal views. Writes per-annotator sync
 * tombstones so offline clients drop them too.
 */
async function deleteHighlightResponsesOnNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  const rows = await db
    .select({
      id: StudyThreadEntries.id,
      entryUserId: StudyThreadEntries.userId,
      noteUserId: Notes.userId,
    })
    .from(StudyThreadEntries)
    .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
    .where(inArray(StudyThreadEntries.parentNoteId, noteIds));
  const foreign = rows.filter((r) => r.entryUserId !== r.noteUserId);
  if (foreign.length === 0) return;

  await db.delete(StudyThreadEntries).where(inArray(StudyThreadEntries.id, foreign.map((r) => r.id)));

  const byUser = new Map<string, string[]>();
  for (const r of foreign) {
    const list = byUser.get(r.entryUserId) ?? [];
    list.push(r.id);
    byUser.set(r.entryUserId, list);
  }
  for (const [userId, ids] of byUser) {
    await recordDeletedEntities(userId, 'studyThread', ids);
  }
}

function parseItemIds(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed.split(',').filter(id => id.trim());
    }
  }
  return trimmed.split(',').filter(id => id.trim());
}

// ─── POST /api/spaces/create ────────────────────────────────────────────────
route.post('/api/spaces/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formData = await c.req.formData();
    const title = formData.get('title') as string;
    const color = (formData.get('color') as string) || 'paper';
    const selectedNoteIds = parseItemIds(formData.get('selectedNoteIds') as string | null);
    const selectedThreadIds = parseItemIds(formData.get('selectedThreadIds') as string | null);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);

    // Personal spaces only — shared spaces are created via /api/spaces/create-shared.
    const backgroundGradient = getThreadGradientCSS(color);
    const now = nowISO();

    const newSpace = first(await db.insert(Spaces).values({
      id: generateSpaceId(),
      title: capitalizedTitle,
      description: null,
      color,
      backgroundGradient,
      userId: auth.userId,
      type: 'personal',
      isPublic: false,
      isActive: true,
      order: 0,
      createdAt: now,
    }).returning())!;

    for (const noteId of selectedNoteIds) {
      try {
        const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
        if (note) await db.update(Notes).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      } catch (error) { console.error(`Error updating note ${noteId}:`, error); }
    }

    for (const threadId of selectedThreadIds) {
      try {
        if (threadId === 'thread_unorganized') continue;
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
        if (thread) await db.update(Threads).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
      } catch (error) { console.error(`Error updating thread ${threadId}:`, error); }
    }

    awardCreationBonusXP(auth.userId, 'space').catch(() => {});

    return c.json({ success: 'Space created!', space: newSpace, addedNotes: selectedNoteIds.length, addedThreads: selectedThreadIds.length });
  } catch (error: any) {
    console.error('Error creating space:', error);
    return c.json({ error: error.message || 'Error creating space' }, 500);
  }
});

// ─── POST /api/spaces/create-shared ─────────────────────────────────────────
/**
 * Creates a shared space (type='shared') with the creator's owner membership.
 * The Shared Spaces add-on gate lives here — shared spaces are only ever
 * created as shared (no personal→shared conversion).
 */
route.post('/api/spaces/create-shared', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json().catch(() => ({})) as {
      title?: string;
      color?: string;
      description?: string;
      coverVariant?: number | string;
    };
    const title = (body.title ?? '').trim();
    const color = (body.color ?? 'paper').trim() || 'paper';
    const coverVariantRaw = Number(body.coverVariant);
    const coverVariant = Number.isFinite(coverVariantRaw)
      ? Math.min(5, Math.max(1, Math.round(coverVariantRaw)))
      : 1;
    const cover = spaceCoverFromThreadColor(color, coverVariant);
    const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(cover);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    // Reconcile-on-write when the DB flag is still false (post-checkout gap before webhook).
    if (!(await hasSharedSpacesAddOnForUserId(auth.userId))) {
      await syncEntitlementsFromProvider(auth.userId);
    }

    const canCreate = await canCreateSharedSpace(auth.userId, auth);
    if (!canCreate.allowed) {
      return c.json({
        error: canCreate.reason,
        code: 'SHARED_SPACE_LIMIT_EXCEEDED',
        currentCount: canCreate.currentCount,
        limit: canCreate.limit,
        upgradeUrl: canCreate.upgradeUrl,
      }, 403);
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const now = nowISO();

    const newSpace = await db.transaction(async (tx) => {
      const space = first(await tx.insert(Spaces).values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: body.description?.trim() || null,
        color,
        backgroundGradient: getThreadGradientCSS(color),
        coverBgLight,
        coverBgDark,
        userId: auth.userId,
        type: 'shared',
        isPublic: false,
        isActive: true,
        order: 0,
        createdAt: now,
      }).returning())!;

      await tx.insert(SpaceMemberships).values({
        id: `smem_${crypto.randomUUID()}`,
        spaceId: space.id,
        userId: auth.userId,
        role: 'owner',
        joinedAt: now,
        createdAt: now,
      });

      return space;
    });

    awardCreationBonusXP(auth.userId, 'space').catch(() => {});
    queueAudiencefulProductFlagsForUser(auth.userId, { has_created_space: true });

    return c.json({ success: 'Shared space created!', space: newSpace });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/create-shared', action: 'create_shared_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/create-church-shared ──────────────────────────────────
/**
 * Creates a church-scoped Shared Space: type='shared' + orgId.
 * Staff-gated (Churches.createdBy or owner/leader on an org space). Does not
 * burn the personal Shared Spaces add-on quota. Pilot sponsorship = Churches.isActive.
 */
route.post('/api/spaces/create-church-shared', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => ({})) as {
      title?: string;
      color?: string;
      description?: string;
      orgId?: string;
      coverVariant?: number | string;
    };
    const orgId = (body.orgId ?? '').trim();
    if (!orgId) return c.json({ error: 'orgId is required', code: 'ORG_ID_REQUIRED' }, 400);

    const gate = await assertCanCreateChurchSharedSpace(auth.userId, orgId);
    if (!gate.ok) {
      return c.json({ error: gate.error, code: gate.code }, gate.status);
    }

    const title = (body.title ?? '').trim();
    const color = (body.color ?? 'paper').trim() || 'paper';
    const coverVariantRaw = Number(body.coverVariant);
    const coverVariant = Number.isFinite(coverVariantRaw)
      ? Math.min(5, Math.max(1, Math.round(coverVariantRaw)))
      : 1;
    const cover = spaceCoverFromThreadColor(color, coverVariant);
    const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(cover);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const now = nowISO();

    const newSpace = await db.transaction(async (tx) => {
      const space = first(await tx.insert(Spaces).values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: body.description?.trim() || null,
        color,
        backgroundGradient: getThreadGradientCSS(color),
        coverBgLight,
        coverBgDark,
        userId: auth.userId,
        type: 'shared',
        orgId: gate.church.orgId,
        isPublic: false,
        isActive: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      }).returning())!;

      await tx.insert(SpaceMemberships).values({
        id: `smem_${crypto.randomUUID()}`,
        spaceId: space.id,
        userId: auth.userId,
        role: 'owner',
        joinedAt: now,
        createdAt: now,
      });

      return space;
    });

    awardCreationBonusXP(auth.userId, 'space').catch(() => {});
    queueAudiencefulProductFlagsForUser(auth.userId, { has_created_space: true });

    return c.json({ success: 'Church Shared Space created!', space: newSpace });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/create-church-shared',
      action: 'create_church_shared_space',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/create-ministry-channel ───────────────────────────────
/**
 * Creates a ministry channel: type='public' + orgId.
 * Staff-gated (same as church Shared Spaces). Does not burn personal Shared
 * Spaces quota; public channels are member-cap exempt.
 */
route.post('/api/spaces/create-ministry-channel', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => ({})) as {
      title?: string;
      color?: string;
      description?: string;
      orgId?: string;
      coverVariant?: number | string;
    };
    const orgId = (body.orgId ?? '').trim();
    if (!orgId) return c.json({ error: 'orgId is required', code: 'ORG_ID_REQUIRED' }, 400);

    const gate = await assertCanCreateMinistryChannel(auth.userId, orgId);
    if (!gate.ok) {
      return c.json({ error: gate.error, code: gate.code }, gate.status);
    }

    const title = (body.title ?? '').trim();
    const color = (body.color ?? 'paper').trim() || 'paper';
    const coverVariantRaw = Number(body.coverVariant);
    const coverVariant = Number.isFinite(coverVariantRaw)
      ? Math.min(5, Math.max(1, Math.round(coverVariantRaw)))
      : 1;
    const cover = spaceCoverFromThreadColor(color, coverVariant);
    const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(cover);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const now = nowISO();

    const newSpace = await db.transaction(async (tx) => {
      const space = first(await tx.insert(Spaces).values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: body.description?.trim() || null,
        color,
        backgroundGradient: getThreadGradientCSS(color),
        coverBgLight,
        coverBgDark,
        userId: auth.userId,
        type: 'public',
        orgId: gate.church.orgId,
        isPublic: false,
        isActive: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      }).returning())!;

      await tx.insert(SpaceMemberships).values({
        id: `smem_${crypto.randomUUID()}`,
        spaceId: space.id,
        userId: auth.userId,
        role: 'owner',
        joinedAt: now,
        createdAt: now,
      });

      return space;
    });

    awardCreationBonusXP(auth.userId, 'space').catch(() => {});
    queueAudiencefulProductFlagsForUser(auth.userId, { has_created_space: true });

    return c.json({ success: 'Ministry channel created!', space: newSpace });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/create-ministry-channel',
      action: 'create_ministry_channel',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/spaces/delete ──────────────────────────────────────────────
route.delete('/api/spaces/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = c.req.query('spaceId');
    if (!spaceId) return c.json({ error: 'Space ID is required' }, 400);

    const space = first(await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).limit(1));
    if (!space) return c.json({ error: 'Space not found or access denied' }, 404);
    if (space.deletedAt) {
      return c.json({ error: 'Space is already deleted', code: 'ALREADY_DELETED' }, 409);
    }

    if (space.type !== 'personal') {
      const recipients = await db
        .select({ userId: SpaceMemberships.userId })
        .from(SpaceMemberships)
        .where(eq(SpaceMemberships.spaceId, spaceId));
      const deleted = await db.transaction((tx) =>
        softDeleteSharedSpaceInTransaction(tx, {
          spaceId,
          ownerId: auth.userId,
          now: nowISO(),
        }),
      );
      for (const recipientId of new Set(recipients.map((row) => row.userId))) {
        broadcastInvalidation(recipientId, { type: 'space:updated', id: spaceId });
      }
      return c.json({
        success: 'Space deleted!',
        spaceId,
        deletedAt: deleted.deletedAt,
        recoveryUntil: deleted.recoveryUntil,
        recoverable: true,
      });
    }

    await db.delete(SpaceMemberships).where(eq(SpaceMemberships.spaceId, spaceId));
    await db.delete(SpaceInvites).where(eq(SpaceInvites.spaceId, spaceId));
    // Hygiene deletes on the frozen v1 tables (kept until they are dropped)
    await db.delete(Members).where(eq(Members.spaceId, spaceId));
    await db.delete(SpaceInvitations).where(eq(SpaceInvitations.spaceId, spaceId));

    // Detach EVERY member's threads and notes (preserve content) — not just the
    // owner's. Anything left pointing at the deleted space would be unreachable:
    // requireSpaceAccess 404s, and the My Home backfill only rehomes null spaceIds.
    const spaceNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.spaceId, spaceId));
    await db.update(Threads).set({ spaceId: null }).where(eq(Threads.spaceId, spaceId));
    await db.update(Notes).set({ spaceId: null }).where(eq(Notes.spaceId, spaceId));
    await db.update(NoteConnections).set({ spaceId: null }).where(eq(NoteConnections.spaceId, spaceId));

    // Cross-member highlight responses die with the space conversation.
    await deleteHighlightResponsesOnNotes(spaceNotes.map((n) => n.id));

    await db.delete(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId)));

    return c.json({ success: 'Space deleted!', spaceId });
  } catch (error: any) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/delete', action: 'delete_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/deleted ─────────────────────────────────────────────────
// Keep this static route above parameterized /api/spaces/:spaceId routes.
route.get('/api/spaces/deleted', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
  const now = nowISO();
  await runBoundedExpiredSpaceMaintenance(now);

  const spaces = await db
    .select({
      id: Spaces.id,
      title: Spaces.title,
      color: Spaces.color,
      backgroundGradient: Spaces.backgroundGradient,
      coverBgLight: Spaces.coverBgLight,
      coverBgDark: Spaces.coverBgDark,
      deletedAt: Spaces.deletedAt,
      recoveryUntil: Spaces.recoveryUntil,
    })
    .from(Spaces)
    .where(
      and(
        eq(Spaces.userId, auth.userId),
        ne(Spaces.type, 'personal'),
        isNotNull(Spaces.deletedAt),
        isNotNull(Spaces.recoveryUntil),
        gte(Spaces.recoveryUntil, now),
        eq(Spaces.isActive, false),
      ),
    )
    .orderBy(asc(Spaces.recoveryUntil), asc(Spaces.title), asc(Spaces.id));

  return c.json({
    spaces: spaces.map((space) => ({
      ...space,
      deletedAt: space.deletedAt?.toISOString() ?? null,
      recoveryUntil: space.recoveryUntil?.toISOString() ?? null,
    })),
  });
});

route.post('/api/spaces/:spaceId/restore', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = requireParam(c, 'spaceId');
    const restored = await db.transaction(async (tx) => {
      const space = first(
        await tx
          .select()
          .from(Spaces)
          .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId)))
          .for('update')
          .limit(1),
      ) as typeof Spaces.$inferSelect | undefined;
      if (!space) throw new SharedSpaceLifecycleError('Space not found', 'NOT_FOUND', 404);
      if (!canRestoreDeletedSpace(space, nowISO())) {
        throw new SharedSpaceLifecycleError(
          'Space recovery window has expired',
          'RECOVERY_EXPIRED',
          409,
        );
      }
      return first(
        await tx
          .update(Spaces)
          .set({ deletedAt: null, recoveryUntil: null, isActive: true, updatedAt: nowISO() })
          .where(eq(Spaces.id, spaceId))
          .returning(),
      );
    });
    const recipients = await db
      .select({ userId: SpaceMemberships.userId })
      .from(SpaceMemberships)
      .where(eq(SpaceMemberships.spaceId, spaceId));
    for (const recipientId of new Set(recipients.map((row) => row.userId))) {
      broadcastInvalidation(recipientId, { type: 'space:updated', id: spaceId });
    }
    return c.json({ success: true, space: restored });
  } catch (error) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    throw error;
  }
});

// ─── GET /api/spaces/items ──────────────────────────────────────────────────
route.get('/api/spaces/items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    await runBoundedExpiredSpaceMaintenance();

    const allNotesRaw = await db.select({
      id: Notes.id, title: Notes.title, content: Notes.content,
      threadId: Notes.threadId, spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
      createdAt: Notes.createdAt, updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited, contentEncrypted: Notes.contentEncrypted,
      addedBy: Notes.addedBy,
      primaryCollection: Notes.primaryCollection,
      secondaryCollections: Notes.secondaryCollections,
      collectionPinned: Notes.collectionPinned,
      collectionUserOverride: Notes.collectionUserOverride,
    }).from(Notes).where(eq(Notes.userId, auth.userId));
    // Exclude onboarding notes so they don't appear in the "Add to Space" panel
    const allNotes = allNotesRaw.filter(n => n.addedBy !== 'system');

    // Enrich with resource metadata, scripture versions, and thread colors (mesh gradient on clients)
    const resourceNoteIds = allNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = allNotes.filter(n => n.noteType === 'scripture').map(n => n.id);
    const allNoteIds = allNotes.map(n => n.id);

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap] = await Promise.all([
      (async (): Promise<Record<string, any>> => {
        if (resourceNoteIds.length === 0) return {};
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return Object.fromEntries(rm.map(m => [m.noteId, m]));
        } catch {
          return {};
        }
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const sm = await db
            .select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata)
            .where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return Object.fromEntries(sm.map(m => [m.noteId, m.translation]));
        } catch {
          return {};
        }
      })(),
      getThreadColorsForNotesBatch(allNoteIds, auth.userId),
    ]);

    const notesWithMetadata = allNotes.map(note => {
      const rm = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const scriptureVersion = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] || 'NET')
        : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note, lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null,
        version: scriptureVersion,
        scriptureTranslation: scriptureVersion,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    // Threads with note counts (exclude unorganized and onboarding threads)
    const allThreadsRaw = await db.select({
      id: Threads.id, title: Threads.title, color: Threads.color,
      spaceId: Threads.spaceId, createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
    }).from(Threads).where(and(eq(Threads.userId, auth.userId), ne(Threads.id, 'thread_unorganized')));
    const allThreads = allThreadsRaw.filter(t => !t.id.startsWith('thread_onboarding_'));

    const threadIds = allThreads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, auth.userId)))
        .groupBy(NoteThreads.threadId);
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    const threadsWithCounts = allThreads.map(t => ({
      ...t, noteCount: noteCountsMap.get(t.id) || 0,
      lastUpdated: t.lastVisited || t.updatedAt || t.createdAt,
    }));

    return c.json({ notes: notesWithMetadata, threads: threadsWithCounts });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/items', action: 'get_space_items' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/update ───────────────────────────────────────
route.post('/api/spaces/:spaceId/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    const formData = await c.req.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const coverVariantRaw = formData.get('coverVariant');
    const coverVariantParsed = Number(
      typeof coverVariantRaw === 'string' || typeof coverVariantRaw === 'number'
        ? coverVariantRaw
        : coverVariantRaw == null
          ? NaN
          : String(coverVariantRaw),
    );
    const coverVariant = Number.isFinite(coverVariantParsed)
      ? Math.min(5, Math.max(1, Math.round(coverVariantParsed)))
      : 1;
    const descriptionRaw = formData.get('description');
    const description =
      descriptionRaw == null || descriptionRaw === ''
        ? undefined
        : String(descriptionRaw).trim().slice(0, 500) || null;
    const publishCadenceParsed = parsePublishCadenceInput(formData.get('publishCadence'));
    if (publishCadenceParsed.kind === 'invalid') {
      return c.json({ error: 'Invalid publish cadence', code: 'INVALID_PUBLISH_CADENCE' }, 400);
    }
    // `isPublic` is no longer accepted — sharing is governed by Spaces.type + SpaceInvites.

    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    // Branding (title / color / cover / description): owner or leader — same for
    // Shared Spaces and ministry channels (public + orgId).
    if (!canManageSpaceStructure(access.space, access.role)) {
      return c.json({ error: 'Only owners and leaders can update space settings', code: 'FORBIDDEN' }, 403);
    }

    const ministryChannel = isMinistryBroadcastSpaceRow(access.space);
    if (publishCadenceParsed.kind === 'set' && !ministryChannel) {
      return c.json(
        { error: 'Publish cadence is only available on ministry channels', code: 'PUBLISH_CADENCE_MINISTRY_ONLY' },
        400,
      );
    }

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const backgroundGradient = getThreadGradientCSS(color);
    const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(
      spaceCoverFromThreadColor(color, coverVariant),
    );

    const updatedSpace = first(await db.update(Spaces).set({
      title: capitalizedTitle,
      color,
      backgroundGradient,
      coverBgLight,
      coverBgDark,
      ...(description !== undefined ? { description } : {}),
      ...(publishCadenceParsed.kind === 'set' && ministryChannel
        ? { publishCadence: publishCadenceParsed.value }
        : {}),
      updatedAt: nowISO(),
    }).where(eq(Spaces.id, spaceId)).returning())!;

    const coverFields = spaceCoverApiFields(
      updatedSpace.coverBgLight,
      updatedSpace.coverBgDark,
      updatedSpace.color,
    );
    const cadenceFields = ministryChannel
      ? buildChannelCadenceFields(
          updatedSpace.publishCadence,
          await getLastCurriculumAtForSpace(spaceId),
        )
      : null;
    return c.json({
      success: 'Space updated!',
      space: {
        id: updatedSpace.id,
        title: updatedSpace.title,
        color: updatedSpace.color,
        backgroundGradient: updatedSpace.backgroundGradient,
        description: updatedSpace.description ?? null,
        coverBgLight: coverFields.coverBgLight,
        coverBgDark: coverFields.coverBgDark,
        coverVariant,
        ...(cadenceFields
          ? {
              publishCadence: cadenceFields.publishCadence,
              lastCurriculumAt: cadenceFields.lastCurriculumAt,
              cadenceStale: cadenceFields.cadenceStale,
            }
          : {}),
      },
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/update', action: 'update_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/notes ─────────────────────────────────────────
route.get('/api/spaces/:spaceId/notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const excludeLegacyScripture =
      c.req.query('excludeLegacyScripture') === '1' || c.req.query('excludeLegacyScripture') === 'true';
    const sortByLastUpdated = c.req.query('sortBy') === 'updated';
    const unseenSince = c.req.query('unseenSince')?.trim() || undefined;

    const queryOptions = {
      excludeLegacyScriptureNotes: excludeLegacyScripture,
      sortByLastUpdated,
    };
    // Shared/public spaces get the merged-author view (owner included);
    // personal spaces keep the owner-scoped path untouched.
    const result = accessInfo.space.type === 'personal'
      ? await getNotesForSpace(spaceId, auth.userId, limit, offset, queryOptions)
      : await getNotesForSharedSpace(spaceId, auth.userId, limit, offset, queryOptions);
    const notes = unseenSince && accessInfo.space.type !== 'personal'
      ? result.notes.map((n) => ({
          ...n,
          isNewSinceVisit: isNoteNewSinceVisit(n.updatedAt ?? n.lastUpdated, unseenSince),
        }))
      : result.notes;
    return c.json({ notes, hasMore: result.hasMore, total: result.total, offset, limit });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/notes', action: 'get_space_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── PATCH /api/spaces/:spaceId/notes/:noteId ───────────────────────────────
route.patch('/api/spaces/:spaceId/notes/:noteId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = requireParam(c, 'spaceId');
    const noteId = requireParam(c, 'noteId');
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: 'Organization payload is required', code: 'BAD_REQUEST' }, 400);
    }
    const unsupportedKeys = Object.keys(body).filter(
      (key) =>
        !(SHARED_NOTE_ORGANIZATION_MUTATION_KEYS as readonly string[]).includes(key),
    );
    if (unsupportedKeys.length > 0) {
      return c.json({
        error: `Unsupported organization fields: ${unsupportedKeys.join(', ')}`,
        code: 'BAD_REQUEST',
      }, 400);
    }
    if (!hasSharedNoteOrganizationMutation(body)) {
      return c.json({ error: 'At least one organization field is required', code: 'BAD_REQUEST' }, 400);
    }

    const organization = await db.transaction(async (tx) => {
      const space = first(
        await tx
          .select()
          .from(Spaces)
          .where(eq(Spaces.id, spaceId))
          .for('update')
          .limit(1),
      );
      if (!space || space.deletedAt || space.type === 'personal') {
        throw new SharedSpaceLifecycleError('Shared space not found', 'NOT_FOUND', 404);
      }
      const membership = first(
        await tx
          .select({ id: SpaceMemberships.id })
          .from(SpaceMemberships)
          .where(
            and(
              eq(SpaceMemberships.spaceId, spaceId),
              eq(SpaceMemberships.userId, auth.userId),
            ),
          )
          .for('update')
          .limit(1),
      );
      if (!membership) {
        throw new SharedSpaceLifecycleError('Access denied', 'FORBIDDEN', 403);
      }
      const note = first(
        await tx
          .select({
            id: Notes.id,
            userId: Notes.userId,
            contentEncrypted: Notes.contentEncrypted,
          })
          .from(Notes)
          .where(eq(Notes.id, noteId))
          .for('update')
          .limit(1),
      );
      if (!note || note.contentEncrypted) {
        throw new SharedSpaceLifecycleError('Note not found in space', 'NOT_FOUND', 404);
      }
      if (note.userId !== auth.userId && space.userId !== auth.userId) {
        throw new SharedSpaceLifecycleError(
          'Only the note author or space owner can organize this note',
          'FORBIDDEN',
          403,
        );
      }
      const association = first(
        await tx
          .select()
          .from(SpaceNotes)
          .where(
            and(
              eq(SpaceNotes.spaceId, spaceId),
              eq(SpaceNotes.noteId, noteId),
              isNull(SpaceNotes.removedAt),
            ),
          )
          .for('update')
          .limit(1),
      );
      if (!association) {
        throw new SharedSpaceLifecycleError('Note not found in space', 'NOT_FOUND', 404);
      }
      const normalized = normalizeSharedNoteOrganizationMutation(body, association);
      const updated = first(
        await tx
          .update(SpaceNotes)
          .set({ ...normalized.patch, updatedAt: nowISO() })
          .where(eq(SpaceNotes.id, association.id))
          .returning(),
      );
      if (!updated) throw new Error('Failed to update space note organization');
      return serializeSharedNoteOrganization(updated);
    });

    await broadcastNoteInvalidation(auth.userId, spaceId, {
      type: 'note:updated',
      id: noteId,
    });
    return c.json({
      success: true,
      noteId,
      contextSpaceId: spaceId,
      organization,
    });
  } catch (error) {
    if (error instanceof SharedNoteOrganizationValidationError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/notes/[noteId]',
      action: 'update_space_note_organization',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/folder-registry ───────────────────────────────
/** Empty-folder labels for prototype sidebar (labels with zero notes). */
route.get('/api/spaces/:spaceId/folder-registry', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const labels = parsePrototypeEmptyFolderLabels(access.space.prototypeEmptyFolderLabels);
    return c.json({ labels });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/folder-registry',
      action: 'get_folder_registry',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/folders/create ───────────────────────────────
/** Register an empty folder label (prototype). */
route.post('/api/spaces/:spaceId/folders/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    if (access.space.type !== 'personal' && !canManageSpaceStructure(access.space, access.role)) {
      return c.json({ error: 'Only the space owner can create folders in a shared space', code: 'FORBIDDEN' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const folderName = typeof body.folderName === 'string' ? body.folderName.trim() : '';
    if (!folderName) return c.json({ error: 'Folder name is required' }, 400);
    if (isReservedPrototypeFolderLabel(folderName)) {
      return c.json({ error: 'That folder name is reserved' }, 400);
    }

    const row = await db
      .select({ prototypeEmptyFolderLabels: Spaces.prototypeEmptyFolderLabels })
      .from(Spaces)
      .where(eq(Spaces.id, spaceIdNorm))
      .limit(1);
    if (!row[0]) return c.json({ error: 'Space not found' }, 404);

    const current = parsePrototypeEmptyFolderLabels(row[0].prototypeEmptyFolderLabels);
    const next = addPrototypeEmptyFolderLabel(current, folderName);
    await db
      .update(Spaces)
      .set({
        prototypeEmptyFolderLabels: serializePrototypeEmptyFolderLabels(next),
        updatedAt: nowISO(),
      })
      .where(eq(Spaces.id, spaceIdNorm));

    return c.json({ success: true, labels: next });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/folders/create',
      action: 'create_folder',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/folder-registry/remove-label ─────────────────
/** Remove a label from the empty-folder registry (after notes carry it). */
route.post('/api/spaces/:spaceId/folder-registry/remove-label', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const body = await c.req.json().catch(() => ({}));
    const folderName = typeof body.folderName === 'string' ? body.folderName.trim() : '';
    if (!folderName) return c.json({ error: 'Folder name is required' }, 400);

    const row = await db
      .select({ prototypeEmptyFolderLabels: Spaces.prototypeEmptyFolderLabels })
      .from(Spaces)
      .where(eq(Spaces.id, spaceIdNorm))
      .limit(1);
    if (!row[0]) return c.json({ error: 'Space not found' }, 404);

    const current = parsePrototypeEmptyFolderLabels(row[0].prototypeEmptyFolderLabels);
    const next = removePrototypeEmptyFolderLabel(current, folderName);
    await db
      .update(Spaces)
      .set({
        prototypeEmptyFolderLabels: serializePrototypeEmptyFolderLabels(next),
        updatedAt: nowISO(),
      })
      .where(eq(Spaces.id, spaceIdNorm));

    return c.json({ success: true, labels: next });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/folder-registry/remove-label',
      action: 'remove_folder_registry_label',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/folders/remove ───────────────────────────────
/** Remove a folder label from all notes in the space (notes are kept; labels move to Unsorted). */
route.post('/api/spaces/:spaceId/folders/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
      // Space-wide folder removal is owner-only in shared spaces (it strips the
      // registry label for everyone); members manage labels via their own notes.
      if (access.space.type !== 'personal' && access.role !== 'owner') {
        return c.json({ error: 'Only the space owner can remove folders in a shared space', code: 'FORBIDDEN' }, 403);
      }
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const body = await c.req.json().catch(() => ({}));
    const folderName = typeof body.folderName === 'string' ? body.folderName.trim() : '';
    if (!folderName) return c.json({ error: 'Folder name is required' }, 400);

    const stripAllMembers = access.space.type !== 'personal' && access.role === 'owner';

    const noteRows: Array<{
      id: string;
      associationId?: string;
      userId: string;
      threadId: string;
      addedBy: string;
      primaryCollection: string | null;
      secondaryCollections: string | null;
      collectionPinned: boolean;
      collectionUserOverride: boolean;
    }> = access.space.type === 'personal'
      ? await db
          .select({
            id: Notes.id,
            userId: Notes.userId,
            threadId: Notes.threadId,
            addedBy: Notes.addedBy,
            primaryCollection: Notes.primaryCollection,
            secondaryCollections: Notes.secondaryCollections,
            collectionPinned: Notes.collectionPinned,
            collectionUserOverride: Notes.collectionUserOverride,
          })
          .from(Notes)
          .where(
            and(
              eq(Notes.spaceId, spaceIdNorm),
              ...(stripAllMembers ? [] : [eq(Notes.userId, auth.userId)]),
              NOT_ONBOARDING_NOTES_THREAD,
              NOT_ONBOARDING_SYSTEM_NOTES,
            ),
          )
      : await db
          .select({
            id: Notes.id,
            associationId: SpaceNotes.id,
            userId: Notes.userId,
            threadId: Notes.threadId,
            addedBy: Notes.addedBy,
            primaryCollection: SpaceNotes.primaryCollection,
            secondaryCollections: SpaceNotes.secondaryCollections,
            collectionPinned: SpaceNotes.collectionPinned,
            collectionUserOverride: SpaceNotes.collectionUserOverride,
          })
          .from(SpaceNotes)
          .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
          .where(
            and(
              eq(SpaceNotes.spaceId, spaceIdNorm),
              isNull(SpaceNotes.removedAt),
              ...(stripAllMembers ? [] : [eq(Notes.userId, auth.userId)]),
              eq(Notes.contentEncrypted, false),
              NOT_ONBOARDING_SYSTEM_NOTES,
            ),
          );

    let updatedCount = 0;
    const touchedNotesByUser = new Map<string, string[]>();
    for (const note of noteRows) {
      if (isOnboardingSystemNote(note)) continue;

      const patch = computeNoteFolderRemovalPatch(
        {
          primaryCollection: note.primaryCollection,
          secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
          collectionPinned: note.collectionPinned,
          collectionUserOverride: note.collectionUserOverride,
        },
        folderName,
      );
      if (!patch) continue;

      const updateData: Record<string, unknown> = {
        primaryCollection: patch.primaryCollection,
        secondaryCollections: serializeNoteSecondaryCollections(patch.secondaryCollections),
        collectionPinned: patch.collectionPinned,
        collectionUserOverride: patch.collectionUserOverride,
        updatedAt: nowISO(),
      };
      if (patch.collectionLastAutoUpdatedAt === null) {
        updateData.collectionLastAutoUpdatedAt = null;
      }

      if (note.associationId) {
        delete updateData.collectionLastAutoUpdatedAt;
        await db.update(SpaceNotes).set(updateData).where(eq(SpaceNotes.id, note.associationId));
      } else {
        await db.update(Notes).set(updateData).where(eq(Notes.id, note.id));
      }
      const list = touchedNotesByUser.get(note.userId) ?? [];
      list.push(note.id);
      touchedNotesByUser.set(note.userId, list);
      updatedCount += 1;
    }

    for (const [userId, noteIds] of touchedNotesByUser) {
      for (const noteId of noteIds) {
        void broadcastNoteInvalidation(userId, spaceIdNorm, { type: 'note:updated', id: noteId });
      }
    }

    const registryRow = await db
      .select({ prototypeEmptyFolderLabels: Spaces.prototypeEmptyFolderLabels })
      .from(Spaces)
      .where(eq(Spaces.id, spaceIdNorm))
      .limit(1);
    if (registryRow[0]) {
      const current = parsePrototypeEmptyFolderLabels(registryRow[0].prototypeEmptyFolderLabels);
      const next = removePrototypeEmptyFolderLabel(current, folderName);
      if (next.length !== current.length) {
        await db
          .update(Spaces)
          .set({
            prototypeEmptyFolderLabels: serializePrototypeEmptyFolderLabels(next),
            updatedAt: nowISO(),
          })
          .where(eq(Spaces.id, spaceIdNorm));
      }
    }

    return c.json({ success: true, updatedCount });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/folders/remove',
      action: 'remove_folder',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/threads/remove ───────────────────────────────
/** Disconnect all notes in a study-thread cluster, or one note from the cluster (notes are kept). */
route.post('/api/spaces/:spaceId/threads/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const body = await c.req.json().catch(() => ({}));
    const memberIds = normalizeThreadClusterMemberIds(body.memberIds);
    if (memberIds.length === 0) return c.json({ error: 'memberIds is required' }, 400);
    const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';

    const edgeRows = await db
      .select({
        id: NoteConnections.id,
        fromNoteId: NoteConnections.fromNoteId,
        toNoteId: NoteConnections.toNoteId,
      })
      .from(NoteConnections)
      .where(
        and(
          eq(NoteConnections.userId, auth.userId),
          eq(NoteConnections.spaceId, spaceIdNorm),
          inArray(NoteConnections.fromNoteId, memberIds),
          inArray(NoteConnections.toNoteId, memberIds),
        ),
      );

    const edgesToRemove = filterThreadClusterEdgesForRemoval(edgeRows, memberIds, noteId || null);
    const edges = edgeRows.filter((edge) =>
      edgesToRemove.some(
        (candidate) =>
          candidate.fromNoteId === edge.fromNoteId && candidate.toNoteId === edge.toNoteId,
      ),
    );
    if (edges.length === 0) {
      return c.json({ success: true, removedEdgeCount: 0 });
    }

    const edgeIds = edges.map((edge) => edge.id);
    await db.delete(NoteConnections).where(inArray(NoteConnections.id, edgeIds));
    await recordDeletedEntities(auth.userId, 'noteConnection', edgeIds);

    const touchedNoteIds = new Set<string>();
    for (const edge of edges) {
      touchedNoteIds.add(edge.fromNoteId);
      touchedNoteIds.add(edge.toNoteId);
    }
    for (const noteId of touchedNoteIds) {
      void broadcastNoteInvalidation(auth.userId, spaceIdNorm, { type: 'note:updated', id: noteId });
    }

    return c.json({ success: true, removedEdgeCount: edges.length });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/threads/remove',
      action: 'remove_thread_cluster',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-thread-highlights ───────────────────────
route.get('/api/spaces/:spaceId/study-thread-highlights', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let accessInfo: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      accessInfo = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const isPersonalSpace = accessInfo.space.type === 'personal';

    // Broad SQL filter (indexed-friendly primitives only); exact eligibility matches native in JS.
    // Avoids raw `trim(coalesce(...))` fragments that have failed against some Postgres/Supabase setups.
    // Include `miniNote` rows so snippet-only highlights (legacy web creates) are fetched; JS narrows to list-eligible rows.
    const highlightCandidates = or(
      eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
      eq(StudyThreadEntries.entryKindRaw, 'miniNote'),
      eq(StudyThreadEntries.entryKindRaw, 'linkedNote'),
      eq(StudyThreadEntries.entryKindRaw, 'reference'),
      and(isNotNull(StudyThreadEntries.anchorLocation), isNotNull(StudyThreadEntries.anchorLength), gt(StudyThreadEntries.anchorLength, 0)),
    );

    let rows;
    try {
      rows = await db
        .select({
          ...getTableColumns(StudyThreadEntries),
          parentNoteTitle: Notes.title,
        })
        .from(StudyThreadEntries)
        .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
        .where(
          and(
            eq(StudyThreadEntries.isArchived, false),
            ne(StudyThreadEntries.entryKindRaw, 'workspace'),
            highlightCandidates,
            ...(isPersonalSpace
              ? [eq(Notes.spaceId, spaceIdNorm)]
              : [
                  activeSpaceNotePredicate(spaceIdNorm),
                  eq(StudyThreadEntries.spaceId, spaceIdNorm),
                ]),
            eq(Notes.contentEncrypted, false),
            ...(isPersonalSpace
              ? [eq(StudyThreadEntries.userId, auth.userId), eq(Notes.userId, auth.userId)]
              : []),
          ),
        )
        .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt))
        // Bound the worst case: a 30-member space with hundreds of annotated
        // notes could otherwise return thousands of wide rows unpaginated. The
        // list is recency-ordered, so the cap keeps the newest highlights and
        // is well above what the sidebar realistically shows.
        .limit(SHARED_HIGHLIGHT_LIST_MAX_ROWS);
    } catch (e) {
      if (isStudyThreadEntriesTableMissing(e)) {
        console.warn(
          '[api/spaces/study-thread-highlights] StudyThreadEntries table missing; returning empty list. Run `npm run db:push` or apply server/db/manual/create-study-thread-entries.sql.',
        );
        return c.json({ success: true, studyThreads: [] });
      }
      throw e;
    }

    const eligibleRows = rows.filter((row) => studyThreadEligibleForHighlightList(row));
    const authorMap = isPersonalSpace
      ? {}
      : await batchAuthorAttribution(eligibleRows.map((row) => row.userId));

    return c.json({
      success: true,
      studyThreads: eligibleRows.map((row) => {
        const { parentNoteTitle, ...entry } = row;
        const author = authorMap[row.userId];
        return {
          ...mapStudyRow(entry),
          parentNoteTitle: parentNoteTitle ?? '',
          ...(isPersonalSpace
            ? {}
            : {
                authorDisplayName: author?.displayName ?? 'A Harvous User',
                authorColor: author?.userColor ?? 'blue',
                isOwnHighlight: row.userId === auth.userId,
              }),
        };
      }),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-thread-highlights',
      action: 'study_thread_highlights',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/scripture-index ───────────────────────────────
route.get('/api/spaces/:spaceId/scripture-index', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const noteRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
      })
      .from(Notes)
      .where(
        and(
          ...(access.space.type === 'personal'
            ? [eq(Notes.spaceId, spaceIdNorm), eq(Notes.userId, auth.userId)]
            : [activeSpaceNotePredicate(spaceIdNorm)]),
          eq(Notes.contentEncrypted, false),
          ne(Notes.noteType, 'scripture'),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        ),
      );

    const payload = buildSpaceScriptureIndex(
      noteRows.map((n) => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content ?? null,
        updatedAt: n.updatedAt ? String(n.updatedAt) : null,
        createdAt: String(n.createdAt),
      })),
    );

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/scripture-index',
      action: 'scripture_index',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/scripture-connections ───────────────────────────
route.get('/api/spaces/:spaceId/scripture-connections', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const noteRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
      })
      .from(Notes)
      .where(
        and(
          ...(access.space.type === 'personal'
            ? [eq(Notes.spaceId, spaceIdNorm), eq(Notes.userId, auth.userId)]
            : [activeSpaceNotePredicate(spaceIdNorm)]),
          eq(Notes.contentEncrypted, false),
          ne(Notes.noteType, 'scripture'),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        ),
      );

    const index = buildSpaceScriptureIndex(
      noteRows.map((n) => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content ?? null,
        updatedAt: n.updatedAt ? String(n.updatedAt) : null,
        createdAt: String(n.createdAt),
      })),
    );

    const payload = await buildSpaceScriptureConnections(index.books, { limit: 3, minNotes: 2 });

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/scripture-connections',
      action: 'scripture_connections',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/reference-word-connections ──────────────────────
route.get('/api/spaces/:spaceId/reference-word-connections', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const limitRaw = Number(c.req.query('limit') ?? '3');
    const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, Math.floor(limitRaw))) : 3;
    const payload = await buildSpaceReferenceWordConnections(spaceIdNorm, auth.userId, { limit, minNotes: 2 });

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/reference-word-connections',
      action: 'reference_word_connections',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/references-index ──────────────────────────────
route.get('/api/spaces/:spaceId/references-index', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const noteRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(
        and(
          ...(access.space.type === 'personal'
            ? [eq(Notes.spaceId, spaceIdNorm), eq(Notes.userId, auth.userId)]
            : [activeSpaceNotePredicate(spaceIdNorm)]),
          eq(Notes.contentEncrypted, false),
        ),
      );

    const payload = buildSpaceReferencesIndex(
      noteRows.map((n) => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content ?? null,
        updatedAt: n.updatedAt ? String(n.updatedAt) : null,
      })),
    );

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/references-index',
      action: 'references_index',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-threads/by-scripture ─────────────────────
route.get('/api/spaces/:spaceId/study-threads/by-scripture', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const refRaw = c.req.query('reference') ?? '';
    const translation = (c.req.query('translation') ?? '').trim() || 'NET';
    const norm = normalizeScriptureReference(refRaw.trim()) ?? refRaw.trim();
    if (!norm) return c.json({ error: 'reference query required' }, 400);

    let rows;
    try {
      rows = await db
        .select({
          ...getTableColumns(StudyThreadEntries),
          parentNoteTitle: Notes.title,
        })
        .from(StudyThreadEntries)
        .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
        .where(
          and(
            ...(access.space.type === 'personal'
              ? [
                  eq(StudyThreadEntries.userId, auth.userId),
                  eq(Notes.userId, auth.userId),
                  eq(Notes.spaceId, spaceIdNorm),
                ]
              : [
                  eq(StudyThreadEntries.spaceId, spaceIdNorm),
                  activeSpaceNotePredicate(spaceIdNorm),
                  eq(Notes.contentEncrypted, false),
                ]),
            eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
            eq(StudyThreadEntries.scriptureReference, norm),
            eq(StudyThreadEntries.scripturePassageTranslation, translation),
          ),
        )
        .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));
    } catch (e) {
      if (isStudyThreadEntriesTableMissing(e)) {
        console.warn(
          '[api/spaces/study-threads/by-scripture] StudyThreadEntries table missing; returning empty list.',
        );
        return c.json({ success: true, studyThreads: [] });
      }
      throw e;
    }

    return c.json({
      success: true,
      studyThreads: rows.map((row) => {
        const { parentNoteTitle, ...entry } = row;
        return {
          ...mapStudyRow(entry),
          parentNoteTitle: parentNoteTitle ?? '',
        };
      }),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-threads/by-scripture',
      action: 'study_threads_by_scripture_space',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-threads ───────────────────────────────────
// Returns connected components of the NoteConnections graph as "study threads".
// Each component is represented by its highest-degree node (most connections).
route.get('/api/spaces/:spaceId/study-threads', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceIdRaw = requireParam(c, 'spaceId');
    const spaceIdNorm = spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    // Load all NoteConnections for this user in this space.
    const edges = await db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(and(eq(NoteConnections.userId, auth.userId), eq(NoteConnections.spaceId, spaceIdNorm)));

    // Build adjacency list and degree count.
    const adj = new Map<string, Set<string>>();
    const degree = new Map<string, number>();
    for (const e of edges) {
      if (!adj.has(e.fromNoteId)) adj.set(e.fromNoteId, new Set());
      if (!adj.has(e.toNoteId)) adj.set(e.toNoteId, new Set());
      adj.get(e.fromNoteId)!.add(e.toNoteId);
      adj.get(e.toNoteId)!.add(e.fromNoteId);
      degree.set(e.fromNoteId, (degree.get(e.fromNoteId) ?? 0) + 1);
      degree.set(e.toNoteId, (degree.get(e.toNoteId) ?? 0) + 1);
    }

    // BFS to find connected components.
    const allNodeIds = [...adj.keys()];
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const start of allNodeIds) {
      if (visited.has(start)) continue;
      const component: string[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const node = queue.shift()!;
        component.push(node);
        for (const neighbor of adj.get(node) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(component);
    }

    const connectedNodeIds = new Set(components.flat());
    const repIds = components.map((members) => pickStudyThreadRepresentativeNoteId(members, degree)!);

    const allMemberIds = [...connectedNodeIds];
    const memberRows = allMemberIds.length > 0 ? await fetchStudyThreadNoteRows(allMemberIds, auth.userId) : [];

    const memberMap = new Map(memberRows.map((r) => [r.id, r]));

    const resourceIds = memberRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
    let resourceMap: Record<
      string,
      { sourceTitle: string | null; sourceDescription: string | null }
    > = {};
    if (resourceIds.length > 0) {
      try {
        const rmList = await db
          .select({
            noteId: ResourceMetadata.noteId,
            sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription,
          })
          .from(ResourceMetadata)
          .where(inArray(ResourceMetadata.noteId, resourceIds));
        resourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
      } catch {
        resourceMap = {};
      }
    }

    const toSuggestNode = (id: string): StudyThreadSuggestNode | null => {
      const n = memberMap.get(id);
      if (!n) return null;
      const rm = n.noteType === 'resource' ? resourceMap[n.id] : null;
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        noteType: n.noteType,
        resourceTitle: rm?.sourceTitle ?? null,
        resourceDescription: rm?.sourceDescription ?? null,
        updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
      };
    };

    // Build response from connected components, then merge singleton titled notes.
    const connectedThreads = sortStudyThreadClustersByTitle(
      components.map((members, i) => {
        const repId = repIds[i];
        const rep = memberMap.get(repId);
        const clusterMemberRows = members
          .map((id) => memberMap.get(id))
          .filter((row): row is NonNullable<typeof row> => row != null);
        const suggestNodes = members.map(toSuggestNode).filter((n): n is StudyThreadSuggestNode => n != null);
        const naming = resolveStudyThreadClusterNaming(clusterMemberRows, suggestNodes, repId);
        return {
          id: repId,
          title: naming.threadTitle,
          suggestedTitle: naming.suggestedTitle,
          hasCustomTitle: naming.studyThreadUserOverride,
          studyThreadPinned: naming.studyThreadPinned,
          noteCount: members.length,
          updatedAt: rep?.updatedAt ? rep.updatedAt.toISOString() : null,
          memberIds: members,
        };
      }),
    );

    const singletonRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        updatedAt: Notes.updatedAt,
        studyThreadTitle: Notes.studyThreadTitle,
        studyThreadUserOverride: Notes.studyThreadUserOverride,
        studyThreadPinned: Notes.studyThreadPinned,
      })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, auth.userId),
          eq(Notes.spaceId, spaceIdNorm),
          eq(Notes.studyThreadUserOverride, true),
          isNotNull(Notes.studyThreadTitle),
          sql`TRIM(COALESCE(${Notes.studyThreadTitle}, '')) <> ''`,
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        ),
      );

    const singletonThreads = singletonRows
      .filter((row) => !connectedNodeIds.has(row.id))
      .map((row) => ({
        id: row.id,
        title: (row.studyThreadTitle ?? '').trim() || null,
        suggestedTitle: row.title?.trim() || null,
        hasCustomTitle: true,
        studyThreadPinned: Boolean(row.studyThreadPinned),
        noteCount: 1,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        memberIds: [row.id],
      }));

    const threads = sortStudyThreadClustersByTitle([...connectedThreads, ...singletonThreads]);

    return c.json({ threads });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-threads',
      action: 'get_study_threads',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/connect-note-candidates ─────────────────────────
route.get('/api/spaces/:spaceId/connect-note-candidates', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceIdRaw = requireParam(c, 'spaceId');
    const spaceIdNorm = spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const q = (c.req.query('q') ?? '').trim();
    const excludeNoteIdRaw = (c.req.query('excludeNoteId') ?? '').trim();
    const excludeNoteIdsRaw = (c.req.query('excludeNoteIds') ?? '').trim();
    const source = (c.req.query('source') ?? '').trim();
    const useMyHomeSource = source === 'my-home' && access.space.type !== 'personal';

    const limitParsed = parseInt(c.req.query('limit') || '15', 10);
    const limit = Math.min(Number.isFinite(limitParsed) ? limitParsed : 15, 30);

    const baseFilters = useMyHomeSource
      ? [
          eq(Notes.userId, auth.userId),
          eq(Notes.contentEncrypted, false),
          eq(Notes.noteType, 'default'),
        ]
      : [
          ...(access.space.type === 'personal'
            ? [eq(Notes.userId, auth.userId), eq(Notes.spaceId, spaceIdNorm)]
            : [activeSpaceNotePredicate(spaceIdNorm), eq(Notes.contentEncrypted, false)]),
          eq(Notes.noteType, 'default'),
        ];
    const excludeIds = [
      ...new Set(
        [
          excludeNoteIdRaw,
          ...excludeNoteIdsRaw.split(',').map((id) => id.trim()),
        ].filter(Boolean),
      ),
    ].slice(0, 50);
    if (excludeIds.length === 1) baseFilters.push(ne(Notes.id, excludeIds[0]!));
    else if (excludeIds.length > 1) baseFilters.push(notInArray(Notes.id, excludeIds));

    // Title, body, and tag names (substring ILIKE — same family as short /api/search queries).
    const searchPattern = `%${q}%`;
    const filters =
      q.length >= 1
        ? [
            ...baseFilters,
            or(
              sql`COALESCE(${Notes.title}, '') ILIKE ${searchPattern}`,
              sql`COALESCE(${Notes.content}, '') ILIKE ${searchPattern}`,
              sql`EXISTS (
                SELECT 1 FROM ${NoteTags}
                INNER JOIN ${Tags} ON ${Tags.id} = ${NoteTags.tagId}
                WHERE ${NoteTags.noteId} = ${Notes.id}
                  AND ${Tags.name} ILIKE ${searchPattern}
              )`,
            ),
          ]
        : baseFilters;

    const rows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        noteType: Notes.noteType,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
        content: Notes.content,
        userId: Notes.userId,
      })
      .from(Notes)
      .where(and(...filters))
      .orderBy(desc(Notes.updatedAt))
      .limit(limit);

    let associatedIds = new Set<string>();
    if (access.space.type !== 'personal' && rows.length > 0) {
      const noteIds = rows.map((r) => r.id);
      const associations = await db
        .select({ noteId: SpaceNotes.noteId })
        .from(SpaceNotes)
        .where(
          and(
            eq(SpaceNotes.spaceId, spaceIdNorm),
            inArray(SpaceNotes.noteId, noteIds),
            isNull(SpaceNotes.removedAt),
          ),
        );
      associatedIds = new Set(associations.map((row) => row.noteId));
    }

    return c.json({
      notes: rows.map((r) => ({
        id: r.id,
        title: r.title ?? '',
        noteType: r.noteType || 'default',
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        content: r.content ? stripHtmlForListPreview(r.content, 80) : '',
        isOwnNote: r.userId === auth.userId,
        isAssociatedWithTarget:
          access.space.type === 'personal' ? true : associatedIds.has(r.id),
      })),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/connect-note-candidates',
      action: 'connect_note_candidates',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/items ─────────────────────────────────────────
route.get('/api/spaces/:spaceId/items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    if (accessInfo.space.type === 'personal') {
      const [notesResult, threads] = await Promise.all([
        getNotesForSpace(spaceId, auth.userId),
        getThreadsForSpace(spaceId, auth.userId),
      ]);
      return c.json({ notes: notesResult.notes, threads });
    } else {
      const [notesResult, threads] = await Promise.all([
        getNotesForSharedSpace(spaceId, auth.userId, 100),
        getThreadsForSpaceBySpaceId(spaceId),
      ]);
      return c.json({
        notes: notesResult.notes,
        threads: visibleSharedThreadsForViewer(
          threads,
          accessInfo.space.userId === auth.userId,
        ),
      });
    }
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/items', action: 'get_space_items' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/bootstrap ──────────────────────────────────────
// Returns space metadata + items in one response for faster initial load (one round-trip).
route.get('/api/spaces/:spaceId/bootstrap', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const spaceRow = accessInfo.space;
    const { coverBgLight, coverBgDark } = spaceCoverApiFields(
      spaceRow.coverBgLight,
      spaceRow.coverBgDark,
      spaceRow.color,
    );
    const ministryChannel = isMinistryBroadcastSpaceRow(spaceRow);
    const [notesResult, threads, lastCurriculumAt] = await Promise.all([
      spaceRow.type === 'personal'
        ? getNotesForSpace(spaceId, auth.userId)
        : getNotesForSharedSpace(spaceId, auth.userId, 100),
      spaceRow.type === 'personal'
        ? getThreadsForSpace(spaceId, auth.userId)
        : getThreadsForSpaceBySpaceId(spaceId),
      ministryChannel ? getLastCurriculumAtForSpace(spaceId) : Promise.resolve(null),
    ]);
    const cadenceFields = ministryChannel
      ? buildChannelCadenceFields(spaceRow.publishCadence, lastCurriculumAt)
      : null;
    const spaceDetail = {
      id: spaceRow.id,
      title: spaceRow.title,
      color: spaceRow.color,
      backgroundGradient: spaceRow.backgroundGradient || getThreadGradientCSS(spaceRow.color || 'paper'),
      description: spaceRow.description ?? null,
      coverBgLight,
      coverBgDark,
      ownerId: spaceRow.userId,
      memberCount: 0,
      isPublic: spaceRow.isPublic,
      type: spaceRow.type,
      orgId: spaceRow.orgId ?? null,
      ...(cadenceFields
        ? {
            publishCadence: cadenceFields.publishCadence,
            lastCurriculumAt: cadenceFields.lastCurriculumAt,
            cadenceStale: cadenceFields.cadenceStale,
          }
        : {}),
    };

    const visibleThreads =
      spaceRow.type === 'personal'
        ? threads
        : visibleSharedThreadsForViewer(threads, spaceRow.userId === auth.userId);
    return c.json(
      { space: spaceDetail, items: { threads: visibleThreads, notes: notesResult.notes } },
      200,
      { 'Cache-Control': 'private, no-cache' },
    );
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/bootstrap', action: 'get_space_bootstrap' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/prefetch ──────────────────────────────────────
route.get('/api/spaces/:spaceId/prefetch', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    // Try owner path first
    const ownerSpaces = await getSpacesWithCounts(auth.userId);
    const ownerSpace = ownerSpaces.find((s: any) => s.id === spaceId);
    if (ownerSpace) {
      const memberCount = ownerSpace.type === 'personal' ? 0 : await getSpaceMemberCount(ownerSpace.id);
      const { coverBgLight, coverBgDark } = spaceCoverApiFields(
        (ownerSpace as any).coverBgLight,
        (ownerSpace as any).coverBgDark,
        ownerSpace.color,
      );
      const ministryChannel = isMinistryBroadcastSpaceRow(ownerSpace);
      const cadenceFields = ministryChannel
        ? buildChannelCadenceFields(
            (ownerSpace as { publishCadence?: string | null }).publishCadence,
            await getLastCurriculumAtForSpace(spaceId),
          )
        : null;
      return c.json({
        space: {
          id: ownerSpace.id,
          title: ownerSpace.title,
          color: ownerSpace.color,
          backgroundGradient: ownerSpace.backgroundGradient,
          description: ownerSpace.description ?? null,
          coverBgLight,
          coverBgDark,
          totalItemCount: ownerSpace.totalItemCount,
          isPublic: ownerSpace.isPublic,
          type: ownerSpace.type,
          orgId: (ownerSpace as { orgId?: string | null }).orgId ?? null,
          ownerId: auth.userId,
          isOwner: true,
          memberCount,
          ...(cadenceFields
            ? {
                publishCadence: cadenceFields.publishCadence,
                lastCurriculumAt: cadenceFields.lastCurriculumAt,
                cadenceStale: cadenceFields.cadenceStale,
              }
            : {}),
        },
      }, 200, { 'Cache-Control': 'private, no-cache' });
    }

    // Member path
    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
    if (!space || space.deletedAt) return c.json({ error: 'Space not found' }, 404);

    const membership = first(await db.select({ id: SpaceMemberships.id }).from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, auth.userId))).limit(1));
    if (!membership) return c.json({ error: 'Access denied' }, 403);

    const noteCountResult = first(
      await db
        .select({ count: count() })
        .from(SpaceNotes)
        .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
        .where(
          and(
            eq(SpaceNotes.spaceId, spaceId),
            isNull(SpaceNotes.removedAt),
            eq(Notes.contentEncrypted, false),
          ),
        )
        .limit(1),
    );
    const threadCountResult = first(
      await db
        .select({ count: count() })
        .from(Threads)
        .where(and(eq(Threads.spaceId, spaceId), eq(Threads.isPinned, true)))
        .limit(1),
    );
    const totalItemCount = (noteCountResult?.count || 0) + (threadCountResult?.count || 0);
    const memberCount = await getSpaceMemberCount(space.id);

    const { coverBgLight, coverBgDark } = spaceCoverApiFields(
      space.coverBgLight,
      space.coverBgDark,
      space.color,
    );

    const ministryChannel = isMinistryBroadcastSpaceRow(space);
    const cadenceFields = ministryChannel
      ? buildChannelCadenceFields(
          space.publishCadence,
          await getLastCurriculumAtForSpace(spaceId),
        )
      : null;

    return c.json({
      space: {
        id: space.id,
        title: space.title,
        color: space.color,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
        description: space.description ?? null,
        coverBgLight,
        coverBgDark,
        totalItemCount,
        isPublic: space.isPublic,
        type: space.type,
        orgId: space.orgId ?? null,
        ownerId: space.userId,
        isOwner: false,
        memberCount,
        ...(cadenceFields
          ? {
              publishCadence: cadenceFields.publishCadence,
              lastCurriculumAt: cadenceFields.lastCurriculumAt,
              cadenceStale: cadenceFields.cadenceStale,
            }
          : {}),
      },
    }, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error: any) {
    console.error('Error prefetching space:', error);
    return c.json({ error: 'Failed to fetch space data' }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-note ─────────────────────────────────────
route.post('/api/spaces/:spaceId/add-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    let accessInfo: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteId } = await c.req.json();
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    if (accessInfo.space.type === 'personal') {
      const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
      if (!note) return c.json({ error: 'Note not found or access denied' }, 404);
      if (note.addedBy === 'system') return c.json({ error: 'Cannot add onboarding notes to a space' }, 400);
      await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      return c.json({ success: true, message: 'Note added to space', noteId });
    }
    const result = await db.transaction((tx) =>
      associateAuthoredNoteWithSpace(tx, {
        spaceId,
        noteId,
        actorId: auth.userId,
        now: nowISO(),
      }),
    );
    await broadcastCanonicalNoteInvalidation(auth.userId, noteId, {
      type: 'note:updated',
      id: noteId,
    });
    return c.json({
      success: true,
      message: result.reactivated ? 'Note restored to space' : 'Note added to space',
      noteId,
      associationId: (result.association as any)?.id,
      reactivated: result.reactivated,
    });
  } catch (error: any) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-note', action: 'add_note_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-thread ───────────────────────────────────
route.post('/api/spaces/:spaceId/add-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    let accessInfo: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);
    if (threadId === 'thread_unorganized') return c.json({ error: 'Cannot add unorganized thread to a space' }, 400);
    if (threadId.startsWith('thread_onboarding_')) return c.json({ error: 'Cannot add onboarding thread to a space' }, 400);

    const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!thread) return c.json({ error: 'Thread not found or access denied' }, 404);
    if (accessInfo.space.type !== 'personal' && accessInfo.role !== 'owner') {
      return c.json({ error: 'Only the space owner can add threads', code: 'FORBIDDEN' }, 403);
    }

    await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    return c.json({ success: true, message: 'Thread added to space' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-thread', action: 'add_thread_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-items ────────────────────────────────────
route.post('/api/spaces/:spaceId/add-items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors: string[] = [];
    let updatedNotes = 0, updatedThreads = 0;

    for (const noteId of noteIds) {
      try {
        if (accessInfo.space.type === 'personal') {
          const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
          if (!note) { errors.push(`Note ${noteId} not found`); continue; }
          if (note.addedBy === 'system') { errors.push('Cannot add onboarding notes to a space'); continue; }
          await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
        } else {
          await db.transaction((tx) =>
            associateAuthoredNoteWithSpace(tx, { spaceId, noteId, actorId: auth.userId, now: nowISO() }),
          );
          await broadcastNoteInvalidation(auth.userId, spaceId, { type: 'note:updated', id: noteId });
        }
        updatedNotes++;
      } catch (e: any) { errors.push(`Note ${noteId}: ${e.message}`); }
    }

    for (const threadId of threadIds) {
      try {
        if (threadId === 'thread_unorganized') { errors.push('Cannot add unorganized thread'); continue; }
        if (threadId.startsWith('thread_onboarding_')) { errors.push('Cannot add onboarding thread'); continue; }
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
        if (!thread) { errors.push(`Thread ${threadId} not found`); continue; }
        if (accessInfo.space.type !== 'personal' && accessInfo.role !== 'owner') {
          errors.push(`Thread ${threadId}: only the space owner can add threads`);
          continue;
        }
        await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
        updatedThreads++;
      } catch (e: any) { errors.push(`Thread ${threadId}: ${e.message}`); }
    }

    return c.json({ success: true, updatedNotes, updatedThreads, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-items', action: 'add_items_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/remove-items ─────────────────────────────────
route.post('/api/spaces/:spaceId/remove-items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors: string[] = [];
    let removedNotes = 0, removedThreads = 0;
    const isOwner = accessInfo.role === 'owner';

    for (const noteId of noteIds) {
      try {
        if (accessInfo.space.type === 'personal') {
          const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.spaceId, spaceId))).limit(1));
          if (!note) { errors.push(`Note ${noteId} not found in space`); continue; }
          if (!isOwner && note.userId !== auth.userId) { errors.push(`Note ${noteId}: no permission`); continue; }
          await db.update(Notes).set({ spaceId: null }).where(eq(Notes.id, noteId));
        } else {
          await db.transaction((tx) =>
            archiveNoteFromSpace(tx, {
              spaceId,
              noteId,
              actorId: auth.userId,
              now: nowISO(),
              ownerMayModerate: isOwner,
            }),
          );
          await broadcastNoteInvalidation(auth.userId, spaceId, { type: 'note:updated', id: noteId });
        }
        removedNotes++;
      } catch (e: any) { errors.push(`Note ${noteId}: ${e.message}`); }
    }

    for (const threadId of threadIds) {
      try {
        if (threadId === 'thread_unorganized') { errors.push('Cannot remove unorganized thread'); continue; }
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.spaceId, spaceId))).limit(1));
        if (!thread) { errors.push(`Thread ${threadId} not found in space`); continue; }
        if (!isOwner && thread.userId !== auth.userId) { errors.push(`Thread ${threadId}: no permission`); continue; }
        await db.update(Threads).set({ spaceId: null }).where(eq(Threads.id, threadId));
        if (accessInfo.space.type === 'personal') {
          await db.update(Notes).set({ spaceId: null }).where(and(eq(Notes.threadId, threadId), eq(Notes.spaceId, spaceId)));
        }
        removedThreads++;
      } catch (e: any) { errors.push(`Thread ${threadId}: ${e.message}`); }
    }

    return c.json({ success: true, removedNotes, removedThreads, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/remove-items', action: 'remove_items_from_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/group-threads ─────────────────────────────────
/** Union group study threads (`Threads` with `spaceId`) and note counts for all members. */
route.get('/api/spaces/:spaceId/group-threads', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    const threads = await listGroupStudyThreadsForSpace(spaceId, auth.userId);
    return c.json({ success: true, threads });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/group-threads',
      action: 'list_group_study_threads',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/activity-preview ──────────────────────────────
/** Lightweight dashboard payload for the shared space layer (recent notes, new count). */
route.get('/api/spaces/:spaceId/activity-preview', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    const preview = await getSharedSpaceActivityPreview(spaceId, auth.userId);
    return c.json(preview);
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/activity-preview',
      action: 'get_space_activity_preview',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/visit ────────────────────────────────────────
/** Stamp membership lastVisitedAt and return new-since counts for the prior watermark. */
route.post('/api/spaces/:spaceId/visit', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    const result = await recordSharedSpaceVisit(spaceId, auth.userId);
    return c.json(result);
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/visit',
      action: 'record_space_visit',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/copy-notes ───────────────────────────────────
/**
 * Copies notes into a space as NEW independent rows (the source notes are
 * untouched — no shared history). The caller must be able to author in the
 * target space and read each source note: their own notes always qualify;
 * other authors' notes qualify when they live in a space the caller can read
 * (unencrypted only). This is the personal→shared copy-in today and the
 * public→personal "save a copy" path later.
 */
route.post('/api/spaces/:spaceId/copy-notes', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const targetSpaceId = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    let targetAccess: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { targetAccess = await requireSpaceAccess(targetSpaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }
    if (!canAuthorInSpace(targetAccess.space, targetAccess.role)) {
      return c.json({ error: 'You cannot add notes to this space', code: 'FORBIDDEN' }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as { noteIds?: unknown };
    const noteIds = Array.isArray(body.noteIds) ? body.noteIds.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
    if (noteIds.length === 0) return c.json({ error: 'noteIds is required', code: 'BAD_REQUEST' }, 400);

    const errors: string[] = [];

    // Batch-fetch sources + both metadata tables up front (3 queries total)
    // instead of ~5 per note in a loop.
    const sources = await db.select().from(Notes).where(inArray(Notes.id, noteIds));
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const scriptureMetaByNote = new Map(
      (await db.select().from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds)))
        .map((m) => [m.noteId, m]),
    );
    const resourceMetaByNote = new Map(
      (await db.select().from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, noteIds)))
        .map((m) => [m.noteId, m]),
    );

    // Resolve read permission for foreign sources once per distinct space.
    const readableSpaceIds = new Set<string>();
    const eligible: Array<typeof sources[number]> = [];
    for (const sourceNoteId of noteIds) {
      const source = sourceById.get(sourceNoteId);
      if (!source) { errors.push(`Note ${sourceNoteId}: not found`); continue; }
      if (source.contentEncrypted) { errors.push(`Note ${sourceNoteId}: locked notes can't be copied into spaces`); continue; }
      if (source.addedBy === 'system') { errors.push(`Note ${sourceNoteId}: system notes can't be copied`); continue; }
      if (source.userId !== auth.userId) {
        const activeAssociations = await db
          .select({ spaceId: SpaceNotes.spaceId })
          .from(SpaceNotes)
          .where(and(eq(SpaceNotes.noteId, source.id), isNull(SpaceNotes.removedAt)));
        let readable = false;
        for (const association of activeAssociations) {
          if (readableSpaceIds.has(association.spaceId)) {
            readable = true;
            break;
          }
          try {
            await requireSpaceAccess(association.spaceId, auth.userId);
            readableSpaceIds.add(association.spaceId);
            readable = true;
            break;
          } catch {
            // Try another active shared context.
          }
        }
        if (!readable) { errors.push(`Note ${sourceNoteId}: no permission`); continue; }
      }
      eligible.push(source);
    }

    // Insert every copy (note + metadata) and bump the simpleNoteId watermark in
    // one transaction — a mid-batch failure no longer leaves orphaned notes
    // without their metadata or a stale watermark.
    const created: Array<{ sourceNoteId: string; noteId: string }> = [];
    if (eligible.length > 0) {
      const foreignAuthorIds = [
        ...new Set(
          eligible
            .filter((note) => note.userId !== auth.userId)
            .map((note) => note.userId),
        ),
      ];
      const foreignAuthorRows =
        foreignAuthorIds.length > 0
          ? await db
              .select({
                userId: UserMetadata.userId,
                firstName: UserMetadata.firstName,
                lastName: UserMetadata.lastName,
              })
              .from(UserMetadata)
              .where(inArray(UserMetadata.userId, foreignAuthorIds))
          : [];
      const foreignAuthorDisplayNames = new Map(
        foreignAuthorRows.map((author) => [
          author.userId,
          safeMemberDisplayName({
            firstName: author.firstName,
            lastName: author.lastName,
          }),
        ]),
      );
      const canonicalCopySpaceId =
        targetAccess.space.type === 'personal'
          ? targetSpaceId
          : await ensurePersonalHomeSpace(auth.userId);
      await db.transaction(async (tx) => {
        const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
        const lockedMetadata = first(
          await tx
            .select()
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, auth.userId))
            .for('update')
            .limit(1),
        );
        if (!lockedMetadata) throw new Error('User metadata missing during note copy');
        let nextSimpleNoteId =
          Math.max(effectiveHighest, lockedMetadata.highestSimpleNoteId ?? 0) + 1;
        for (const source of eligible) {
          const now = nowISO();
          if (targetAccess.space.type !== 'personal' && source.userId === auth.userId) {
            await associateAuthoredNoteWithSpace(tx, {
              spaceId: targetSpaceId,
              noteId: source.id,
              actorId: auth.userId,
              now,
            });
            created.push({ sourceNoteId: source.id, noteId: source.id });
            continue;
          }
          const attribution = buildIndependentCopyAttribution({
            sourceNoteId: source.id,
            sourceVersionId: source.currentVersionId,
            sourceAuthorId: source.userId,
            sourceAuthorDisplayName:
              foreignAuthorDisplayNames.get(source.userId) ?? 'Member',
          });
          const newNote = first(await tx.insert(Notes).values({
            id: generateNoteId(),
            title: source.title,
            content: source.content,
            threadId: 'thread_unorganized',
            spaceId: canonicalCopySpaceId,
            simpleNoteId: nextSimpleNoteId,
            noteType: source.noteType,
            addedBy: 'user',
            userId: auth.userId,
            isPublic: false,
            shareToken: null,
            contentEncrypted: false,
            primaryCollection: null,
            secondaryCollections: null,
            isPinned: false,
            order: 0,
            collectionPinned: false,
            collectionUserOverride: false,
            collectionLastAutoUpdatedAt: null,
            studyThreadTitle: null,
            studyThreadUserOverride: false,
            studyThreadPinned: false,
            studyThreadLastAutoSuggestedAt: null,
            createdAt: now,
            updatedAt: now,
            lastVisited: now,
            ...attribution,
          }).returning())!;
          await createInitialNoteVersion(tx, {
            noteId: newNote.id,
            noteAuthorId: auth.userId,
            content: {
              title: newNote.title,
              content: newNote.content,
              contentEncrypted: newNote.contentEncrypted,
            },
            createdAt: now,
            source: 'copy',
          });
          nextSimpleNoteId += 1;

          // Carry scripture/resource metadata so pills and previews keep working.
          const scriptureMeta = scriptureMetaByNote.get(source.id);
          if (scriptureMeta) {
            await tx.insert(ScriptureMetadata).values({
              ...scriptureMeta,
              id: `scripture_${crypto.randomUUID()}`,
              noteId: newNote.id,
              createdAt: now,
            });
          }
          const resourceMeta = resourceMetaByNote.get(source.id);
          if (resourceMeta) {
            await tx.insert(ResourceMetadata).values({
              ...resourceMeta,
              id: `resource_${crypto.randomUUID()}`,
              noteId: newNote.id,
              createdAt: now,
            });
          }
          created.push({ sourceNoteId: source.id, noteId: newNote.id });
        }
        await tx.update(UserMetadata)
          .set({ highestSimpleNoteId: nextSimpleNoteId - 1, updatedAt: nowISO() })
          .where(eq(UserMetadata.userId, auth.userId));
      });

      for (const { noteId } of created) {
        await broadcastCanonicalNoteInvalidation(auth.userId, noteId, {
          type: 'note:created',
          id: noteId,
        });
      }
    }

    return c.json({ success: true, created, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/copy-notes', action: 'copy_notes_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/pin-item ──────────────────────────────────────
route.post('/api/spaces/:spaceId/pin-item', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    if (!isActualSpaceOwner(accessInfo.space, auth.userId)) {
      return c.json({ error: 'Only the space owner can pin items', code: 'FORBIDDEN' }, 403);
    }

    const { itemId, itemType, isPinned } = await c.req.json();
    if (!itemId || !itemType || typeof isPinned !== 'boolean') {
      return c.json({ error: 'itemId, itemType, and isPinned are required', code: 'BAD_REQUEST' }, 400);
    }

    if (itemType === 'note') {
      const association = first(
        await db
          .select({ id: SpaceNotes.id })
          .from(SpaceNotes)
          .where(
            and(
              eq(SpaceNotes.noteId, itemId),
              eq(SpaceNotes.spaceId, spaceId),
              isNull(SpaceNotes.removedAt),
            ),
          )
          .limit(1),
      );
      if (!association) return c.json({ error: 'Note not found in space', code: 'NOT_FOUND' }, 404);
      await db.update(SpaceNotes).set({ isPinned, updatedAt: nowISO() }).where(eq(SpaceNotes.id, association.id));
    } else if (itemType === 'thread') {
      await db.transaction((tx) =>
        setSingularThreadPin(tx, {
          spaceId,
          threadId: itemId,
          isPinned,
          now: nowISO(),
        }),
      );
    } else {
      return c.json({ error: 'itemType must be "note" or "thread"', code: 'BAD_REQUEST' }, 400);
    }

    const recipients = await db
      .select({ userId: SpaceMemberships.userId })
      .from(SpaceMemberships)
      .where(eq(SpaceMemberships.spaceId, spaceId));
    for (const recipientId of new Set(recipients.map((row) => row.userId))) {
      broadcastInvalidation(recipientId, { type: 'space:updated', id: spaceId });
    }
    return c.json({ success: true });
  } catch (error: any) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/pin-item', action: 'pin_space_item' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Invites (SpaceInvites — expiring join links) ────────────────────────────

const DEFAULT_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type InviteRow = typeof SpaceInvites.$inferSelect;

/** Why an invite can't be redeemed right now, or null if it's live. */
function inviteDeadReason(invite: InviteRow): string | null {
  if (invite.revokedAt) return 'This invite link has been turned off';
  if (invite.expiresAt && new Date() > invite.expiresAt) return 'This invite link has expired';
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return 'This invite link has reached its limit';
  return null;
}

// ─── POST /api/spaces/:spaceId/invites ──────────────────────────────────────
route.post('/api/spaces/:spaceId/invites', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try { access = await requireSpaceAccess(spaceId, auth.userId, { minRole: 'owner' }); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    if (access.space.type !== 'shared') {
      return c.json({ error: 'Only shared spaces can have invite links', code: 'NOT_SHARED_SPACE' }, 400);
    }

    // The paid gate: creating invites requires the owner to hold the add-on.
    // Church-org: org-sponsored spaces (orgId set) will gate on the church's
    // billing (Churches.billingPlan) instead of the personal add-on.
    if (!(await hasSharedSpacesAddOn(auth))) {
      return c.json({
        error: 'Owning shared spaces requires the Shared Spaces add-on. Joining spaces is always free.',
        code: 'SHARED_SPACE_LIMIT_EXCEEDED',
        upgradeUrl: '/upgrade',
      }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as { expiresAt?: string | null; maxUses?: number | null };
    let expiresAt: Date | null = new Date(Date.now() + DEFAULT_INVITE_TTL_MS);
    if (body.expiresAt === null) {
      expiresAt = null;
    } else if (typeof body.expiresAt === 'string') {
      const parsed = new Date(body.expiresAt);
      if (isNaN(parsed.getTime()) || parsed <= new Date()) {
        return c.json({ error: 'expiresAt must be a future date', code: 'BAD_REQUEST' }, 400);
      }
      expiresAt = parsed;
    }
    const maxUses = typeof body.maxUses === 'number' && body.maxUses > 0 ? Math.floor(body.maxUses) : null;

    const token = generateShareToken();
    const now = nowISO();
    const invite = first(await db.insert(SpaceInvites).values({
      id: `sinv_${crypto.randomUUID()}`,
      spaceId,
      token,
      kind: 'link',
      role: 'member',
      createdBy: auth.userId,
      expiresAt,
      maxUses,
      createdAt: now,
    }).returning())!;

    const origin = getPublicAppOrigin(c);
    return c.json({
      success: true,
      inviteId: invite.id,
      inviteUrl: `${origin}/spaces/join/${token}`,
      token,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/invites', action: 'create_invite' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/invites ───────────────────────────────────────
route.get('/api/spaces/:spaceId/invites', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    try { await requireSpaceAccess(spaceId, auth.userId, { minRole: 'owner' }); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const rows = await db.select().from(SpaceInvites)
      .where(and(eq(SpaceInvites.spaceId, spaceId), isNull(SpaceInvites.revokedAt)))
      .orderBy(desc(SpaceInvites.createdAt));

    const origin = getPublicAppOrigin(c);
    const invites = rows
      .filter((inv) => inviteDeadReason(inv) === null)
      .map((inv) => ({
        id: inv.id,
        inviteUrl: `${origin}/spaces/join/${inv.token}`,
        kind: inv.kind,
        role: inv.role,
        expiresAt: inv.expiresAt,
        maxUses: inv.maxUses,
        useCount: inv.useCount,
        createdAt: inv.createdAt,
      }));

    return c.json({ invites });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/invites', action: 'list_invites' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/spaces/:spaceId/invites/:inviteId ──────────────────────────
route.delete('/api/spaces/:spaceId/invites/:inviteId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    const inviteId = requireParam(c, 'inviteId');
    try { await requireSpaceAccess(spaceId, auth.userId, { minRole: 'owner' }); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const updated = first(await db.update(SpaceInvites)
      .set({ revokedAt: nowISO() })
      .where(and(eq(SpaceInvites.id, inviteId), eq(SpaceInvites.spaceId, spaceId), isNull(SpaceInvites.revokedAt)))
      .returning());
    if (!updated) return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404);

    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/invites/[inviteId]', action: 'revoke_invite' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/invite-preview/:token ──────────────────────────────────
/** Public preview for an invite link (no auth). Validates the invite live. */
// Rate-limited (IP-based for this unauthenticated route).
route.get('/api/spaces/invite-preview/:token', rateLimit('read'), async (c) => {
  try {
    const token = requireParam(c, 'token');

    const invite = first(await db.select().from(SpaceInvites).where(eq(SpaceInvites.token, token)).limit(1));
    if (!invite) return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404);

    const deadReason = inviteDeadReason(invite);
    if (deadReason) return c.json({ error: deadReason, code: 'INVITE_NOT_ACTIVE' }, 410);

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, invite.spaceId)).limit(1));
    if (!space || space.deletedAt || space.type === 'personal') return c.json({ error: 'Space not found', code: 'NOT_FOUND' }, 404);

    // Owner info (first name + last initial only; never full last name).
    // Church-org: org-sponsored spaces (orgId set) will display Churches.name
    // here, the same way Harvous-owned spaces display "Harvous".
    let isHarvousOwned = false;
    try {
      isHarvousOwned = space.userId === getHarvousSystemUserId();
    } catch { /* env var not set in this environment — treat as normal user */ }

    const ownerMeta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, space.userId)).limit(1));
    const ownerFirst = ownerMeta?.firstName || '';
    const ownerLastInitial = ownerMeta?.lastName ? ownerMeta.lastName.charAt(0).toUpperCase() : '';
    const ownerDisplayName = isHarvousOwned
      ? 'Harvous'
      : (ownerFirst
        ? (ownerLastInitial ? `${ownerFirst} ${ownerLastInitial}.` : ownerFirst)
        : 'Anonymous');

    const memberCount = await getSpaceMemberCount(space.id);
    const totalMembers = memberCount;

    // Each avatar reflects that person's own Settings › Appearance color (light + dark),
    // falling back to their personal userColor when appearance is Paper / unset.
    const resolveAppearanceAccents = (appearanceSettingsRaw: string | null | undefined, userColor: string) => {
      let bgLight: ReturnType<typeof coerceSpaceCoverBgInput> = null;
      let bgDark: ReturnType<typeof coerceSpaceCoverBgInput> = null;
      try {
        const parsed = appearanceSettingsRaw ? JSON.parse(appearanceSettingsRaw) : null;
        bgLight = coerceSpaceCoverBgInput(parsed?.bgLight ?? null);
        bgDark = coerceSpaceCoverBgInput(parsed?.bgDark ?? null);
      } catch { /* malformed settings — fall back to userColor below */ }
      return {
        accentLight: appearanceAccentHexFromCoverBg(bgLight, 'light') ?? appearanceAccentForThreadColor(userColor, 'light'),
        accentDark: appearanceAccentHexFromCoverBg(bgDark, 'dark') ?? appearanceAccentForThreadColor(userColor, 'dark'),
      };
    };

    const ownerAccents = resolveAppearanceAccents(ownerMeta?.appearanceSettings, ownerMeta?.userColor || 'blue');

    // Viewer state (optional auth)
    const auth = getAuth(c);
    let isAlreadyMember = false;
    let isViewerOwner = false;
    if (auth.userId) {
      isViewerOwner = space.userId === auth.userId;
      if (isViewerOwner) {
        isAlreadyMember = true;
      } else {
        const membership = first(await db.select({ id: SpaceMemberships.id }).from(SpaceMemberships)
          .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, auth.userId))).limit(1));
        isAlreadyMember = !!membership;
      }
    }

    const { coverBgLight, coverBgDark } = spaceCoverApiFields(
      space.coverBgLight,
      space.coverBgDark,
      space.color,
    );

    return c.json(serializeInvitePreview({
      space: {
        id: space.id, title: space.title, color: space.color,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
        description: space.description,
        type: space.type,
        coverBgLight,
        coverBgDark,
      },
      owner: {
        displayName: ownerDisplayName,
        isHarvousOwned,
        accentLight: ownerAccents.accentLight,
        accentDark: ownerAccents.accentDark,
      },
      memberCount: totalMembers,
      isAlreadyMember,
      expiresAt: invite.expiresAt,
      viewer: { requiresAuth: !auth.userId, isOwner: isViewerOwner, canJoin: !!auth.userId && !isAlreadyMember },
    }));
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/invite-preview/[token]', action: 'invite_preview' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/invites/:token/redeem ─────────────────────────────────
route.post('/api/spaces/invites/:token/redeem', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const token = requireParam(c, 'token');

    const invite = first(await db.select().from(SpaceInvites).where(eq(SpaceInvites.token, token)).limit(1));
    if (!invite) return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404);

    const deadReason = inviteDeadReason(invite);
    if (deadReason) return c.json({ error: deadReason, code: 'INVITE_NOT_ACTIVE' }, 410);

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, invite.spaceId)).limit(1));
    if (!space || space.deletedAt || space.type === 'personal') return c.json({ error: 'Space not found', code: 'NOT_FOUND' }, 404);

    // Church-org: keys off the human Spaces.userId; org-sponsored spaces keep a
    // staff creator there, so this check stays valid — but revisit if ownership
    // ever transfers to the org itself.
    if (space.userId === auth.userId) {
      return c.json({ error: 'You are the owner of this space', code: 'ALREADY_OWNER' }, 400);
    }

    const existing = first(await db.select({ id: SpaceMemberships.id }).from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, auth.userId))).limit(1));
    if (existing) {
      return c.json({ success: true, alreadyMember: true, spaceId: space.id, spaceName: space.title });
    }

    // Claim a use, check the cap, and insert the membership atomically.
    // inviteDeadReason above is advisory only — the guarded UPDATE re-checks
    // revoked/maxUses inside the transaction, so two concurrent redeems of a
    // maxUses=1 link can't both get in (validate-then-insert TOCTOU).
    const now = nowISO();
    // Thrown inside the transaction to roll back the useCount claim on abort
    // paths (cap reached / concurrent double-join) — a plain return would commit it.
    class RedeemAbort extends Error {
      constructor(public abortOutcome: 'full' | 'already-member') { super('redeem-abort'); }
    }
    let outcome: 'dead' | 'full' | 'already-member' | 'joined';
    try {
      outcome = await db.transaction(async (tx) => {
        const lockedInvite = first(
          await tx
            .select()
            .from(SpaceInvites)
            .where(eq(SpaceInvites.id, invite.id))
            .for('update')
            .limit(1),
        );
        if (!lockedInvite) return 'dead' as const;
        const lockedSpace = first(
          await tx
            .select()
            .from(Spaces)
            .where(eq(Spaces.id, lockedInvite.spaceId))
            .for('update')
            .limit(1),
        );
        const lockedExisting = first(
          await tx
            .select({ id: SpaceMemberships.id })
            .from(SpaceMemberships)
            .where(
              and(
                eq(SpaceMemberships.spaceId, lockedInvite.spaceId),
                eq(SpaceMemberships.userId, auth.userId),
              ),
            )
            .limit(1),
        );

        // Invisible people cap — joining is otherwise free and uncapped for the
        // joiner. The cap arg below is shared-space-scoped: invite creation
        // rejects type !== 'shared', so this path can't fire for public
        // broadcast spaces today. Revisit if leader-invites for public spaces
        // ever land (public spaces are uncapped — see MEMBERS_PER_SPACE_CAP).
        const [{ value: memberCount }] = await tx.select({ value: count() }).from(SpaceMemberships)
          .where(eq(SpaceMemberships.spaceId, lockedInvite.spaceId));
        const lockedOutcome = evaluateLockedInviteRedemption({
          invite: lockedInvite,
          space: lockedSpace ?? null,
          alreadyMember: Boolean(lockedExisting),
          memberCount,
          memberCap: MEMBERS_PER_SPACE_CAP,
          now,
        });
        if (lockedOutcome === 'dead') return 'dead' as const;
        if (lockedOutcome === 'already-member') return 'already-member' as const;
        if (lockedOutcome === 'full') throw new RedeemAbort('full');
        await tx
          .update(SpaceInvites)
          .set({ useCount: lockedInvite.useCount + 1 })
          .where(eq(SpaceInvites.id, lockedInvite.id));

        try {
          await tx.insert(SpaceMemberships).values({
            id: `smem_${crypto.randomUUID()}`,
            spaceId: lockedInvite.spaceId,
            userId: auth.userId,
            role: lockedInvite.role === 'leader' ? 'leader' : 'member',
            invitedBy: lockedInvite.createdBy,
            inviteId: lockedInvite.id,
            joinedAt: now,
            createdAt: now,
          });
        } catch (err: any) {
          // Unique (spaceId, userId) guard — a concurrent double-join by the same user.
          if (!String(err?.message ?? '').includes('SpaceMemberships_space_user_unique')) throw err;
          throw new RedeemAbort('already-member');
        }
        return 'joined' as const;
      });
    } catch (err) {
      if (!(err instanceof RedeemAbort)) throw err;
      outcome = err.abortOutcome;
    }

    if (outcome === 'dead') {
      return c.json({ error: 'This invite link is no longer active.', code: 'INVITE_NOT_ACTIVE' }, 410);
    }
    if (outcome === 'full') {
      return c.json({ error: 'This space has reached its people limit.', code: 'MEMBER_LIMIT_EXCEEDED' }, 403);
    }
    if (outcome === 'already-member') {
      return c.json({ success: true, alreadyMember: true, spaceId: space.id, spaceName: space.title });
    }

    queueAudiencefulProductFlagsForUser(auth.userId, { has_joined_space: true });

    return c.json({ success: true, spaceId: space.id, spaceName: space.title, redirectUrl: '/' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/invites/[token]/redeem', action: 'redeem_invite' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/members ───────────────────────────────────────
route.get('/api/spaces/:spaceId/members', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const isOwner = accessInfo.role === 'owner';
    const space = accessInfo.space;

    // Non-owner memberships (the owner entry is built from Spaces.userId below)
    const members = (await db.select().from(SpaceMemberships).where(eq(SpaceMemberships.spaceId, spaceId)))
      .filter(m => m.userId !== space.userId);
    const memberUserIds = members.map(m => m.userId);
    const allUserIds = [space.userId, ...memberUserIds];

    // Get user metadata for all
    let userMetadataMap: Record<string, any> = {};
    if (allUserIds.length > 0) {
      const metadata = await db.select().from(UserMetadata).where(inArray(UserMetadata.userId, allUserIds));
      userMetadataMap = Object.fromEntries(metadata.map(m => [m.userId, m]));
    }

    let isHarvousOwned = false;
    try {
      isHarvousOwned = space.userId === getHarvousSystemUserId();
    } catch {
      // env var not set in this environment — treat as normal user
    }

    const ownerMeta = userMetadataMap[space.userId] || {};
    const ownerFirstName = isHarvousOwned ? 'Harvous' : (ownerMeta.firstName || null);
    const ownerLastName = isHarvousOwned ? null : (ownerMeta.lastName || null);
    const ownerDisplayName = isHarvousOwned
      ? 'Harvous'
      : safeMemberDisplayName({
          firstName: ownerMeta.firstName ?? null,
          lastName: ownerMeta.lastName ?? null,
        });

    const memberList = [
      {
        userId: space.userId, role: 'owner', joinedAt: space.createdAt,
        firstName: ownerFirstName,
        lastName: ownerLastName,
        displayName: ownerDisplayName,
        email: ownerMeta.email || null, profileImageUrl: ownerMeta.profileImageUrl || null,
        userColor: ownerMeta.userColor || 'blue',
      },
      ...members.map(m => {
        const meta = userMetadataMap[m.userId] || {};
        return {
          userId: m.userId, role: m.role, joinedAt: m.joinedAt || m.createdAt,
          firstName: meta.firstName || null,
          lastName: meta.lastName || null,
          displayName: safeMemberDisplayName({
            firstName: meta.firstName ?? null,
            lastName: meta.lastName ?? null,
          }),
          email: meta.email || null, profileImageUrl: meta.profileImageUrl || null,
          userColor: meta.userColor || 'blue',
        };
      }),
    ];

    const ownerHasAddOn = isOwner ? await hasSharedSpacesAddOn(auth) : false;

    return c.json({
      members: memberList.map((member) => serializeSpaceMemberForViewer(member, isOwner)),
      memberCount: memberList.length,
      isOwner,
      limits: isOwner ? {
        membersPerSpace: MEMBERS_PER_SPACE_CAP,
        ownedSharedSpaces: ownerHasAddOn ? OWNED_SHARED_SPACES_ADDON_LIMIT : FREE_OWNED_SHARED_SPACES_LIMIT,
      } : undefined,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members', action: 'list_members' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/members/invite ───────────────────────────────
route.post('/api/spaces/:spaceId/members/invite', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    // Legacy v1 invite endpoint (SpaceInvitations) — superseded by POST /api/spaces/:spaceId/invites.
    void auth;
    return c.json({ error: 'This endpoint has been retired. Use POST /api/spaces/:spaceId/invites.', code: 'GONE' }, 410);
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members/invite', action: 'invite_member' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/spaces/:spaceId/members/:userId ────────────────────────────
route.delete('/api/spaces/:spaceId/members/:userId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    const targetUserId = requireParam(c, 'userId');

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
    if (!space || space.deletedAt) return c.json({ error: 'Space not found' }, 404);

    const isOwner = space.userId === auth.userId;
    const isSelf = auth.userId === targetUserId;

    // Owner can't leave
    if (targetUserId === space.userId) return c.json({ error: 'Space owner cannot be removed. Transfer or delete the space instead.' }, 400);

    // Members can only remove themselves
    if (!isOwner && !isSelf) return c.json({ error: 'Only the space owner can remove other members' }, 403);

    const membership = first(await db.select().from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, targetUserId))).limit(1));
    if (!membership) return c.json({ error: 'User is not a member of this space' }, 404);

    const targetMeta = first(
      await db.select().from(UserMetadata).where(eq(UserMetadata.userId, targetUserId)).limit(1),
    );
    const snapshot =
      [targetMeta?.firstName, targetMeta?.lastName].filter(Boolean).join(' ').trim() ||
      'Former member';
    const removal = await db.transaction((tx) =>
      removeMemberPreservingResponses(tx, {
        spaceId,
        targetUserId,
        actorId: auth.userId,
        now: nowISO(),
        displayNameSnapshot: snapshot,
      }),
    );
    for (const noteId of removal.archivedNoteIds) {
      await broadcastNoteInvalidation(auth.userId, spaceId, { type: 'note:updated', id: noteId });
    }
    broadcastInvalidation(targetUserId, { type: 'space:updated', id: spaceId });
    broadcastInvalidation(auth.userId, { type: 'space:updated', id: spaceId });

    return c.json({ success: true, message: isSelf ? 'You have left the space' : 'Member removed from space' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members/[userId]', action: 'remove_member' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/join/:token (legacy v1 shareToken links — retired) ─────
route.post('/api/spaces/join/:token', requireAuth, rateLimit('write'), async (c) => {
  return c.json({ error: 'This invite link is no longer active. Ask the space owner for a new one.', code: 'GONE' }, 410);
});

// ─── GET /api/spaces/join-preview/:token (legacy v1 shareToken links — retired) ─
route.get('/api/spaces/join-preview/:token', async (c) => {
  return c.json({ error: 'This invite link is no longer active. Ask the space owner for a new one.', code: 'GONE' }, 410);
});

export default route;
