/**
 * Notes routes — Hono port of src/pages/api/notes/*.ts
 *
 * Endpoints:
 *   POST /api/notes/create
 *   PUT  /api/notes/update
 *   DELETE /api/notes/delete
 *   GET  /api/notes/next-id
 *   POST /api/notes/connect-link
 *   DELETE /api/notes/connect-link
 *   POST /api/notes/migrate-connections
 *   GET  /api/notes/recent
 *   POST /api/notes/auto-tags
 *   POST /api/notes/cleanup-upgrade-note
 *   DELETE /api/notes/delete-all-unorganized
 *   POST /api/notes/suggest-threads
 *   GET  /api/notes/:id/tags
 *   GET  /api/notes/:id/details
 *   GET  /api/notes/:id/thread
 *   PATCH /api/notes/:id/thread/member-order
 *   POST /api/notes/:id/update-content
 *   POST /api/notes/:id/add-thread
 *   POST /api/notes/:id/remove-thread
 *   POST /api/notes/:id/process-scripture-references
 *   POST /api/notes/:noteId/inline-image
 *   GET  /api/notes/:noteId/share
 *   POST /api/notes/:noteId/share
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, StudyThreadEntries, Comments, Tags, NoteTags,
  UserMetadata, ScriptureMetadata, NoteScriptureReferences, NoteConnections, StudyThreadMemberOrders, ResourceMetadata, Spaces,
  NoteVersions, SpaceNotes, SpaceMemberships,
  eq, and, or, ne, desc, asc, count, like, not, isNull, isNotNull, inArray, sql,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateShareToken, generateSpaceId, generateTimestampId } from '@/utils/ids';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { isUniqueViolationError } from '../utils/db-errors';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl, extractDomain, validateResourceUrl } from '@/utils/validation';
import { pickStudyThreadRepresentativeNoteId, type StudyThreadSuggestNode } from '@/utils/suggest-study-thread-title';
import { normalizeServerNoteId } from '../utils/normalize-note-id';
import { fetchStudyThreadNoteRows } from '../utils/study-thread-note-rows';
import { resolveStudyThreadClusterNaming } from '../utils/study-thread-cluster-naming';
import { collectStudyThreadGraphForScope } from '../utils/study-thread-space';
import {
  fetchStudyThreadMemberOrder,
  upsertStudyThreadMemberOrder,
  appendStudyThreadMemberOrderOnConnect,
  removeStudyThreadMemberOrderOnDisconnect,
} from '../utils/study-thread-member-order';
import { migrateLinkedFromNoteConnectionsForUser } from '../utils/prototype-user-migration';
import { isStudyThreadNamingColumnMissing } from '../utils/pg-undefined-relation';
import { rateLimit, rateLimitNoteCreate } from '@/utils/rate-limit';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { findKeywordsInText } from '@/utils/bible-study-keywords';
import { conceptOverlaps } from '@/utils/bible-study-concept-overlaps';
import { rankThreadSuggestions, scoreThreadKeywordOverlap } from '@/utils/thread-suggestion-ranking';
import { getRelatedNotesForPassages, getNotePassages, type VerseKey } from '../utils/scripture-knowledge';
import { detectVerseKeysFromNoteText } from '../utils/detect-note-passages';
import { debug } from '@/utils/logger';
import { getCurrentSeason } from '@/utils/season-helpers';
import { getThreadGradientCSS } from '@/utils/colors';
import { awardCreationBonusXP, awardNoteCreatedXP, awardStudyThreadClusterCreatedXPIfNew, revokeXPOnDeletion, revokeAllXPForItem } from '../utils/xp-system';
import { countStudyThreadClustersForUser } from '../utils/study-thread-cluster-count';
import { generateAutoTags, applyAutoTags, removeAutoTags, regenerateAutoTags } from '../utils/auto-tag-generator';
import {
  processScriptureReferences,
  transformCanonicalScriptureContent,
  ScriptureNoteNotFoundError,
} from '../utils/process-scripture-references';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { formatNoteDefaultTitle } from '@/utils/date-formatting';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { healScriptureNoteThreadsFromParents } from '../utils/heal-scripture-note-threads';
import { removeScriptureNotesFromThread } from '../utils/remove-scripture-notes-from-thread';
import { requireSpaceAccess, SpaceAccessError, canAuthorInSpace, canManageSpaceStructure } from '../utils/space-access';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import { mapStudyRow } from './study-threads';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { extractArticleContent } from '@/utils/content-extractor';
import { sortByLastVisited } from '@/utils/sorting';
import { broadcastInvalidation } from '../utils/realtime';
import { queueAudiencefulProductFlagsForUser } from '../utils/audienceful-product-flags';
import {
  broadcastCanonicalNoteInvalidation,
  broadcastNoteInvalidation,
} from '../utils/broadcast-shared-space-note';
import { stripHtml } from '@/utils/html-stripper';
import { deleteNotesCascadeForUser, deleteSingleNoteCascadeForUser } from '../utils/delete-note-cascade';
import { isOnboardingSystemNote } from '../utils/purge-onboarding-content';
import {
  noteHasLiveSharedSpaceAssociation,
  resolveNoteContributorIds,
  resolveNoteEditAuthorization,
} from '../utils/note-collaboration';
import { recordDeletedEntities } from '../utils/sync-deletion-log';
import { getUserNoteFingerprints } from '../utils/note-fingerprint';
import { getCrossRefGaps } from '../utils/crossref-gaps';
import { tryRecordVotdAddNoteFromCreatedNote } from '../utils/votd-record-engagement';
import { getConnectSuggestions } from '../utils/connect-suggestions';
import { recordNoteRecallEngaged } from '../utils/note-recall-state';
import {
  dedupeNoteTagsForResponse,
  fetchNoteTagsForResponse,
  parseDismissedAutoTags,
  dismissedAutoTagsForNote,
  autoTagExcludeNames,
  serializeDismissedAutoTags,
} from '../utils/tag-helpers';
import { folderLabelsForTagExclusion } from '@/utils/bible-study-concept-overlaps';
import {
  normalizeSecondaryLabels,
  parseNoteSecondaryCollections,
  serializeNoteSecondaryCollections,
} from '../utils/note-secondary-collections';
import {
  createInitialNoteVersion,
  noteVersionErrorResponse,
  resolveCanonicalCreateScope,
  resolveLockedEncryptionState,
  restoreCanonicalNoteVersionInTransaction,
  updateCanonicalNoteInTransaction,
} from '../utils/note-version-service';
import {
  SpaceNoteAssociationError,
  assertCanAssociateCanonicalNote,
  buildSpaceNoteAssociation,
  resolveCreateThreadAttachment,
} from '../utils/space-note-associations';
import { buildSharedNoteActivity } from '../utils/shared-note-activity';
import {
  canExposeCanonicalTagInContext,
  serializeSharedCanonicalNote,
} from '../utils/shared-note-serializer';
import { ensurePersonalHomeSpace } from '../utils/ensure-personal-home-space';
import {
  authorizeNoteThreadMutationInTransaction,
  SharedSpaceLifecycleError,
} from '../utils/shared-space-lifecycle';
const route = new Hono();

function noteJsonWithParsedSecondaries<T extends { secondaryCollections?: string | null; dismissedAutoTags?: string | null }>(note: T) {
  const raw = note.secondaryCollections;
  return {
    ...note,
    secondaryCollections: parseNoteSecondaryCollections(raw ?? null),
    dismissedAutoTags: parseDismissedAutoTags(note.dismissedAutoTags),
  };
}

function folderExcludeLabelsForNote(note: {
  primaryCollection?: string | null;
  secondaryCollections?: string | null | string[];
}): string[] {
  const secondaries = Array.isArray(note.secondaryCollections)
    ? note.secondaryCollections
    : parseNoteSecondaryCollections(note.secondaryCollections);
  return folderLabelsForTagExclusion(note.primaryCollection, secondaries);
}

function autoTagExcludeOptionsForNote(note: {
  primaryCollection?: string | null;
  secondaryCollections?: string | null | string[];
  dismissedAutoTags?: string | null;
}): { excludeLabels: string[]; excludeTagNames: string[] } {
  const folderLabels = folderExcludeLabelsForNote(note);
  const dismissed = dismissedAutoTagsForNote(note);
  return {
    excludeLabels: folderLabels,
    excludeTagNames: autoTagExcludeNames(folderLabels, dismissed),
  };
}

function normalizeOwnedNoteSpaceId(spaceId: string | null): string | null {
  if (!spaceId || !spaceId.trim()) return null;
  const t = spaceId.trim();
  return t.startsWith('space_') ? t : `space_${t}`;
}

type NoteReadContext = {
  space: typeof Spaces.$inferSelect;
  association: typeof SpaceNotes.$inferSelect | null;
  isShared: boolean;
};

async function resolveNoteReadContext(input: {
  note: typeof Notes.$inferSelect;
  viewerUserId: string;
  explicitSpaceId: string | null;
}): Promise<NoteReadContext | null> {
  let contextSpaceId = input.explicitSpaceId;
  if (!contextSpaceId) {
    if (input.note.userId !== input.viewerUserId) return null;
    contextSpaceId = await ensurePersonalHomeSpace(input.viewerUserId);
  }

  const space = first(await db.select().from(Spaces).where(eq(Spaces.id, contextSpaceId)).limit(1));
  if (!space || space.deletedAt) return null;
  if (space.type === 'personal') {
    const isMyHome = space.title.trim().toLowerCase() === 'my home';
    if (
      space.userId !== input.viewerUserId ||
      input.note.userId !== input.viewerUserId ||
      (!isMyHome && input.note.spaceId !== space.id)
    ) {
      return null;
    }
    return { space, association: null, isShared: false };
  }

  if (input.note.contentEncrypted) return null;
  const [membership, association] = await Promise.all([
    db
      .select({ id: SpaceMemberships.id })
      .from(SpaceMemberships)
      .where(
        and(
          eq(SpaceMemberships.spaceId, space.id),
          eq(SpaceMemberships.userId, input.viewerUserId),
        ),
      )
      .limit(1)
      .then((rows) => first(rows)),
    db
      .select()
      .from(SpaceNotes)
      .where(
        and(
          eq(SpaceNotes.spaceId, space.id),
          eq(SpaceNotes.noteId, input.note.id),
          isNull(SpaceNotes.removedAt),
        ),
      )
      .limit(1)
      .then((rows) => first(rows)),
  ]);
  if ((!membership && space.userId !== input.viewerUserId) || !association) return null;
  return { space, association, isShared: true };
}

// ─── Title helpers ────────────────────────────────────────────────────────────
const TITLE_HARD_LIMIT = 50;
const truncateAndCapitalizeTitle = (title: string): string => {
  const truncated = title.slice(0, TITLE_HARD_LIMIT);
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

// ─── POST /api/notes/create ──────────────────────────────────────────────────
route.post('/api/notes/create', requireAuth, rateLimitNoteCreate(), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    // Parse body: support both JSON (serverless-friendly) and FormData
    const contentType = c.req.raw.headers.get('content-type') ?? '';
    let content: string;
    let title: string;
    let threadId: string;
    let noteType: string;
    let scriptureReference: string | null;
    let scriptureVersion: string | null;
    let resourceUrl: string | null;
    let resourceMetadataStr: string | null;
    let spaceId: string | null;
    let contentEncrypted: boolean;
    let linkedFromNoteIdRaw: string | null = null;
    let startedFromTemplateIdRaw: string | null = null;
    let startedFromTemplateNameRaw: string | null = null;

    if (contentType.includes('application/json')) {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      content = (body.content as string) ?? '';
      title = (body.title as string) ?? '';
      threadId = (body.threadId as string) ?? '';
      noteType = (body.noteType as string) ?? 'default';
      scriptureReference = (body.scriptureReference as string) ?? null;
      scriptureVersion = (body.scriptureVersion as string) ?? null;
      resourceUrl = (body.resourceUrl as string) ?? null;
      const meta = body.resourceMetadata;
      resourceMetadataStr = typeof meta === 'string' ? meta : (meta != null ? JSON.stringify(meta) : null);
      spaceId = (body.spaceId as string) ?? null;
      contentEncrypted = body.contentEncrypted === true || body.contentEncrypted === 'true';
      const lfn = body.linkedFromNoteId;
      linkedFromNoteIdRaw = typeof lfn === 'string' && lfn.trim() ? lfn.trim() : null;
      startedFromTemplateIdRaw =
        typeof body.startedFromTemplateId === 'string' && body.startedFromTemplateId.trim()
          ? body.startedFromTemplateId.trim()
          : null;
      startedFromTemplateNameRaw =
        typeof body.startedFromTemplateName === 'string' && body.startedFromTemplateName.trim()
          ? body.startedFromTemplateName.trim().slice(0, 80)
          : null;
    } else {
      const formData = await c.req.formData();
      content = formData.get('content') as string;
      title = formData.get('title') as string;
      threadId = formData.get('threadId') as string;
      noteType = formData.get('noteType') as string;
      scriptureReference = formData.get('scriptureReference') as string | null;
      scriptureVersion = formData.get('scriptureVersion') as string | null;
      resourceUrl = formData.get('resourceUrl') as string | null;
      resourceMetadataStr = formData.get('resourceMetadata') as string | null;
      spaceId = formData.get('spaceId') as string | null;
      contentEncrypted = formData.get('contentEncrypted') === 'true';
      const lfnForm = formData.get('linkedFromNoteId') as string | null;
      linkedFromNoteIdRaw = lfnForm && lfnForm.trim() ? lfnForm.trim() : null;
      const tplIdForm = formData.get('startedFromTemplateId') as string | null;
      startedFromTemplateIdRaw = tplIdForm && tplIdForm.trim() ? tplIdForm.trim() : null;
      const tplNameForm = formData.get('startedFromTemplateName') as string | null;
      startedFromTemplateNameRaw =
        tplNameForm && tplNameForm.trim() ? tplNameForm.trim().slice(0, 80) : null;
    }

    let prefetchedResourceMetadata: { title?: string; description?: string; image?: string; articleContent?: string; siteName?: string } | null = null;
    if (resourceMetadataStr) {
      try { prefetchedResourceMetadata = JSON.parse(resourceMetadataStr); } catch {}
    }

    // Validate
    const noteTypeValidation = validateNoteType(noteType);
    if (!noteTypeValidation.isValid) return c.json({ error: noteTypeValidation.error, code: noteTypeValidation.code }, 400);
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : 'default';

    let resolvedLinkedFromNoteId: string | null = null;
    if (linkedFromNoteIdRaw) {
      if (finalNoteType !== 'default') {
        return c.json({ error: 'linkedFromNoteId is only allowed for default notes', code: 'INVALID_LINKED_FROM' }, 400);
      }
      const sourceForLink = first(await db.select().from(Notes).where(and(eq(Notes.id, linkedFromNoteIdRaw), eq(Notes.userId, auth.userId))).limit(1));
      if (!sourceForLink) {
        return c.json({ error: 'Source note not found', code: 'INVALID_LINKED_FROM' }, 400);
      }
      resolvedLinkedFromNoteId = linkedFromNoteIdRaw;
    }

    const contentRequired = finalNoteType !== 'resource';
    const contentValidation = validateContent(content, contentRequired);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    const threadIdValidation = validateThreadId(threadId);
    if (!threadIdValidation.isValid) return c.json({ error: threadIdValidation.error, code: threadIdValidation.code }, 400);

    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) return c.json({ error: spaceIdValidation.error, code: spaceIdValidation.code }, 400);

    let validatedResourceUrl: string | null = null;
    let isPDF = false;
    if (finalNoteType === 'resource') {
      if (!resourceUrl || !resourceUrl.trim()) return c.json({ error: 'Resource URL is required', code: 'URL_REQUIRED' }, 400);
      const urlValidation = validateResourceUrl(resourceUrl);
      if (!urlValidation.isValid) return c.json({ error: urlValidation.error, code: urlValidation.code || 'INVALID_URL' }, 400);
      validatedResourceUrl = urlValidation.normalizedUrl!;
      isPDF = urlValidation.isPDF || false;
    }

    const normalizedContent = canonicalizeNoteHtmlLineBreaks(content || '');
    let capitalizedContent =
      normalizedContent && normalizedContent.length > 0
        ? normalizedContent.charAt(0).toUpperCase() + normalizedContent.slice(1)
        : normalizedContent;

    let capitalizedTitle: string;
    if (!title || !title.trim()) {
      capitalizedTitle = truncateAndCapitalizeTitle(formatNoteDefaultTitle(new Date()));
    } else {
      capitalizedTitle = truncateAndCapitalizeTitle(title);
    }

    await ensureUnorganizedThread(auth.userId);
    const finalThreadId = 'thread_unorganized';

    // Get or create user metadata for simpleNoteId
    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1);
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'blue',
        currentSeason: season,
        createdAt: nowISO(),
      });
      userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    let nextSimpleNoteId = effectiveHighest + 1;
    let finalSpaceId: string | null = null;
    let associationSpaceId: string | null = null;
    let targetSpaceAccess: Awaited<ReturnType<typeof requireSpaceAccess>> | null = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId.trim().startsWith('space_') ? spaceId.trim() : `space_${spaceId.trim()}`;
      try {
        targetSpaceAccess = await requireSpaceAccess(finalSpaceId, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
      if (!canAuthorInSpace(targetSpaceAccess.space, targetSpaceAccess.role)) {
        return c.json({ error: 'You cannot add notes to this space', code: 'FORBIDDEN' }, 403);
      }
      if (contentEncrypted && targetSpaceAccess.space.type !== 'personal') {
        return c.json({ error: "Locked notes can't be created in shared spaces", code: 'LOCKED_NOTE_IN_SHARED_SPACE' }, 400);
      }
    }

    const now = nowISO();
    const noteId = generateNoteId();
    if (!contentEncrypted) {
      capitalizedContent = transformCanonicalScriptureContent({
        noteId,
        content: capitalizedContent,
        translation: scriptureVersion || 'NET',
        pillsOnly: finalNoteType === 'default',
      }).updatedContent;
    }
    const isScriptureNote = finalNoteType === 'scripture';
    const shouldAutoShare =
      isScriptureNote &&
      !contentEncrypted &&
      (!targetSpaceAccess || targetSpaceAccess.space.type === 'personal');
    const shareToken = shouldAutoShare ? generateShareToken() : null;
    let attachedThreadId: string | null = null;

    const newNote = await db.transaction(async (tx) => {
      const lockedMetadata = first(
        await tx
          .select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, auth.userId))
          .for('update')
          .limit(1),
      );
      if (!lockedMetadata) throw new Error('User metadata disappeared during note creation');
      nextSimpleNoteId = Math.max(effectiveHighest, lockedMetadata.highestSimpleNoteId ?? 0) + 1;

      let lockedTarget: typeof Spaces.$inferSelect | null = null;
      let membership: typeof SpaceMemberships.$inferSelect | null = null;
      let myHomeSpaceId: string | null = null;
      if (targetSpaceAccess) {
        lockedTarget =
          first(
            await tx.select().from(Spaces).where(eq(Spaces.id, targetSpaceAccess.space.id)).for('update').limit(1),
          ) ?? null;
        if (!lockedTarget) throw new SpaceAccessError(404, 'Space not found');
        if (lockedTarget.type !== 'personal') {
          membership =
            first(
              await tx
                .select()
                .from(SpaceMemberships)
                .where(
                  and(
                    eq(SpaceMemberships.spaceId, lockedTarget.id),
                    eq(SpaceMemberships.userId, auth.userId),
                  ),
                )
                .for('update')
                .limit(1),
            ) ?? null;
          const personalSpaces = await tx
            .select({ id: Spaces.id, title: Spaces.title })
            .from(Spaces)
            .where(and(eq(Spaces.userId, auth.userId), eq(Spaces.type, 'personal')));
          myHomeSpaceId =
            personalSpaces.find((row: { title: string }) => row.title.trim().toLowerCase() === 'my home')?.id ?? null;
          if (!myHomeSpaceId) {
            myHomeSpaceId = generateSpaceId();
            await tx.insert(Spaces).values({
              id: myHomeSpaceId,
              title: 'My Home',
              color: 'paper',
              userId: auth.userId,
              type: 'personal',
              isPublic: false,
              isActive: true,
              order: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      const scope = resolveCanonicalCreateScope({
        targetSpace: lockedTarget ? { id: lockedTarget.id, type: lockedTarget.type } : null,
        myHomeSpaceId,
      });
      finalSpaceId = scope.canonicalSpaceId;
      associationSpaceId = scope.associationSpaceId;
      if (lockedTarget && associationSpaceId) {
        assertCanAssociateCanonicalNote({
          note: { id: noteId, userId: auth.userId, contentEncrypted },
          space: lockedTarget,
          membership,
          actorId: auth.userId,
        });
      }
      const requestedThreadId = threadId?.trim() ?? '';
      const requestedRealThread =
        Boolean(requestedThreadId) &&
        requestedThreadId !== 'thread_unorganized' &&
        !requestedThreadId.startsWith('thread_onboarding_');
      const targetThread = requestedRealThread
        ? first(
            await tx
              .select({
                id: Threads.id,
                spaceId: Threads.spaceId,
                userId: Threads.userId,
                isPinned: Threads.isPinned,
              })
              .from(Threads)
              .where(eq(Threads.id, requestedThreadId))
              .for('update')
              .limit(1),
          )
        : null;
      const threadPlan = resolveCreateThreadAttachment({
        requestedThreadId,
        targetSpaceId: associationSpaceId ?? finalSpaceId,
        targetSpaceType: lockedTarget?.type ?? null,
        actorId: auth.userId,
        noteAuthorId: auth.userId,
        thread: targetThread ?? null,
      });
      attachedThreadId = threadPlan.attachThreadId;

      const inserted = first(
        await tx
          .insert(Notes)
          .values({
            id: noteId,
            content: capitalizedContent,
            title: capitalizedTitle,
            threadId: threadPlan.canonicalThreadId,
            spaceId: finalSpaceId,
            simpleNoteId: nextSimpleNoteId,
            noteType: finalNoteType,
            userId: auth.userId,
            isPublic: shouldAutoShare,
            shareToken,
            shareTokenCreatedAt: shouldAutoShare ? now : null,
            contentEncrypted,
            createdAt: now,
            updatedAt: now,
            lastVisited: now,
            linkedFromNoteId: resolvedLinkedFromNoteId,
            startedFromTemplateId: startedFromTemplateIdRaw,
            startedFromTemplateName: startedFromTemplateNameRaw,
          })
          .returning(),
      );
      if (!inserted) throw new Error('Failed to create note');
      const initialVersion = await createInitialNoteVersion(tx, {
        noteId,
        noteAuthorId: auth.userId,
        content: { title: capitalizedTitle, content: capitalizedContent, contentEncrypted },
        createdAt: now,
      });
      inserted.currentVersionId = initialVersion.id;

      if (associationSpaceId) {
        await tx.insert(SpaceNotes).values(
          buildSpaceNoteAssociation({
            id: generateTimestampId('snote'),
            spaceId: associationSpaceId,
            noteId,
            actorId: auth.userId,
            now,
          }),
        );
      }
      if (threadPlan.attachThreadId) {
        await tx.insert(NoteThreads).values({
          id: generateTimestampId('nthread'),
          noteId,
          threadId: threadPlan.attachThreadId,
          createdAt: now,
        });
        await tx
          .update(Threads)
          .set({ updatedAt: now })
          .where(eq(Threads.id, threadPlan.attachThreadId));
      }
      await tx
        .update(UserMetadata)
        .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: now })
        .where(eq(UserMetadata.userId, auth.userId));
      return inserted;
    });

    // Mirror create-from-highlight link into the NoteConnections graph.
    if (resolvedLinkedFromNoteId) {
      try {
        await db.insert(NoteConnections).values({
          id: generateNoteId(),
          fromNoteId: resolvedLinkedFromNoteId,
          toNoteId: newNote.id,
          userId: auth.userId,
          spaceId: associationSpaceId ?? finalSpaceId ?? null,
          createdAt: nowISO(),
        });
      } catch {
        // Duplicate or constraint error — connection already exists, safe to ignore.
      }
    }

    if (!attachedThreadId) {
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, auth.userId)));
    }

    // Non-critical: XP (creation bonus + note-created; UI may hide XP but stats keep recording)
    try {
      await awardCreationBonusXP(auth.userId, 'note');
    } catch {}
    awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, capitalizedContent || content || '').catch(() => {});

    // Reload note
    const finalNote = first(await db.select().from(Notes).where(eq(Notes.id, newNote.id)).limit(1));
    if (finalNote) Object.assign(newNote, finalNote);

    // Auto-tag — await so create response includes tags (native parity).
    if (finalNoteType !== 'resource' && !contentEncrypted) {
      try {
        const tagExcludes = autoTagExcludeOptionsForNote(finalNote ?? newNote);
        const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId, 0.7, tagExcludes);
        if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to auto-tag new note:', newNote.id, err);
      }
    }

    // Scripture metadata
    if (finalNoteType === 'scripture' && scriptureReference) {
      try {
        const normalizedReference = normalizeScriptureReference(scriptureReference);
        const parsed = parseScriptureReference(normalizedReference);
        if (parsed) {
          const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
          const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
          await db.insert(ScriptureMetadata).values({
            id: `scripture_${newNote.id}_${Date.now()}`,
            noteId: newNote.id,
            reference: normalizedReference,
            book: parsed.book,
            chapter: parsed.chapter,
            verse: verseStart,
            verseEnd: verseEnd || null,
            translation: scriptureVersion || 'NET',
            originalText: capitalizedContent,
            createdAt: nowISO(),
          });
        }
      } catch (error) {
        console.error('Error creating ScriptureMetadata (non-critical):', error);
      }
    }

    // Resource metadata
    if (finalNoteType === 'resource' && validatedResourceUrl) {
      try {
        let resourceMetadata: any = { ...prefetchedResourceMetadata };
        if (!isPDF) {
          try {
            const htmlResponse = await fetch(validatedResourceUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://app.harvous.com)', Accept: 'text/html,application/xhtml+xml' },
              signal: AbortSignal.timeout(15000),
            });
            if (htmlResponse.ok) {
              const html = await htmlResponse.text();
              const articleContent = await extractArticleContent(html, validatedResourceUrl);
              if (articleContent) resourceMetadata = { ...resourceMetadata, articleContent };
            }
          } catch {}
        }
        await db.insert(ResourceMetadata).values({
          id: `resource_${newNote.id}_${Date.now()}`,
          noteId: newNote.id,
          sourceUrl: validatedResourceUrl,
          sourceDomain: extractDomain(validatedResourceUrl),
          sourceName: resourceMetadata?.siteName || null,
          sourceTitle: resourceMetadata?.title || null,
          sourceDescription: resourceMetadata?.description || null,
          sourceImage: resourceMetadata?.image || null,
          createdAt: nowISO(),
        });
        if (resourceMetadata) {
          const updateData: any = { updatedAt: nowISO() };
          if (resourceMetadata.title) updateData.title = truncateAndCapitalizeTitle(resourceMetadata.title);
          if (resourceMetadata.articleContent) updateData.content = resourceMetadata.articleContent;
          else if (resourceMetadata.description) updateData.content = resourceMetadata.description;
          if (updateData.title || updateData.content) {
            const resourceUpdate = await db.transaction((tx) =>
              updateCanonicalNoteInTransaction(tx, {
                noteId: newNote.id,
                actorId: auth.userId,
                patch: updateData,
                nextContent: (lockedNote) => ({
                  title: updateData.title ?? lockedNote.title,
                  content: updateData.content ?? lockedNote.content,
                  contentEncrypted: lockedNote.contentEncrypted,
                }),
                source: 'resource-processing',
                now: nowISO(),
              }),
            );
            if (resourceUpdate.note) {
              Object.assign(newNote, resourceUpdate.note);
              if (updateData.title) capitalizedTitle = updateData.title;
            }
          }
          // Auto-tag resource notes
          try {
            const contentForTagging = updateData.content || newNote.content || '';
            const titleForTagging = updateData.title || capitalizedTitle || '';
            const tagExcludes = autoTagExcludeOptionsForNote(newNote);
            const r = await generateAutoTags(titleForTagging, contentForTagging, auth.userId, 0.8, tagExcludes);
            if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
          } catch {}
        }
      } catch (error) {
        console.error('Error creating ResourceMetadata (non-critical):', error);
      }
    }

    // Scripture processing is part of the create contract. A created note is not
    // acknowledged until its durable scripture links have been written.
    const actualThreadId = attachedThreadId ?? 'thread_unorganized';
    const contentToProcess = newNote.content;
    let scriptureResults: unknown[] = [];
    let processedContent: string | null = null;
    if (!contentEncrypted) {
      try {
        const scriptureResult = await processScriptureReferences(
          newNote.id,
          auth.userId,
          actualThreadId,
          contentToProcess,
          scriptureVersion || 'NET',
          { persistParentContent: false },
        );
        scriptureResults = scriptureResult?.results ?? [];
        processedContent =
          typeof scriptureResult?.updatedContent === 'string' ? scriptureResult.updatedContent : null;
        processedContent = newNote.content;
      } catch (err: any) {
        console.error('[api/notes/create] Scripture processing failed:', err?.message ?? err);
        throw err;
      }
    }

    let createTags: Awaited<ReturnType<typeof fetchNoteTagsForResponse>> = [];
    if (!contentEncrypted) {
      try {
        createTags = await fetchNoteTagsForResponse(newNote.id, auth.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to load tags for create response:', newNote.id, err);
      }
    }

    await broadcastCanonicalNoteInvalidation(auth.userId, newNote.id, {
      type: 'note:created',
      id: newNote.id,
    });

    void tryRecordVotdAddNoteFromCreatedNote(auth.userId, {
      title: newNote.title,
      content: newNote.content,
      createdAt: newNote.createdAt,
    }).catch(() => {});
    const responseVersion = newNote.currentVersionId
      ? first(
          await db
            .select({ id: NoteVersions.id, version: NoteVersions.version })
            .from(NoteVersions)
            .where(
              and(
                eq(NoteVersions.id, newNote.currentVersionId),
                eq(NoteVersions.noteId, newNote.id),
              ),
            )
            .limit(1),
        )
      : null;

    queueAudiencefulProductFlagsForUser(auth.userId, {
      has_created_note: true,
      ...(shouldAutoShare && shareToken ? { has_shared: true } : {}),
    });

    return c.json({
      success: 'Note created!',
      note: noteJsonWithParsedSecondaries(newNote as { secondaryCollections?: string | null }),
      tags: createTags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
      scriptureResults,
      processedContent,
      currentVersion: responseVersion?.version ?? 1,
      currentVersionId: responseVersion?.id ?? newNote.currentVersionId,
      scriptureDeferred: false,
    });
  } catch (error: any) {
    console.error('[api/notes/create] Error:', error);
    if (error instanceof SpaceAccessError) return c.json({ error: error.message, code: error.code }, error.status);
    const mapped = noteVersionErrorResponse(error);
    if (mapped) return c.json({ error: mapped.message, code: mapped.code, ...(mapped.details ?? {}) }, mapped.status);
    if (error instanceof SpaceNoteAssociationError) {
      return c.json({ error: error.message, code: error.code }, 400);
    }
    if (error instanceof ScriptureNoteNotFoundError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    return c.json({ error: error.message || 'Failed to create note' }, 500);
  }
});

// ─── PUT /api/notes/update ──────────────────────────────────────────────────
route.put('/api/notes/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const {
      noteId,
      title,
      content,
      resourceImage,
      contentEncrypted,
      scriptureVersion,
      isPinned: isPinnedRaw,
      primaryCollection: primaryCollectionRaw,
      secondaryCollections: secondaryCollectionsRaw,
      collectionPinned: collectionPinnedRaw,
      collectionUserOverride: collectionUserOverrideRaw,
      dismissedAutoTags: dismissedAutoTagsRaw,
      bumpUpdatedAt: bumpUpdatedAtRaw,
      expectedVersion: expectedVersionRaw,
      startedFromTemplateId: startedFromTemplateIdRaw,
      startedFromTemplateName: startedFromTemplateNameRaw,
    } = body;
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    // Authorship is the default, but an author can opt a note into co-editing for
    // members of its shared spaces. The verdict covers both; anything other than
    // the onboarding case answers 404 so note existence never leaks.
    const editAuth = await resolveNoteEditAuthorization(noteId, auth.userId);
    if (!editAuth) return c.json({ error: 'Note not found' }, 404);
    if (!editAuth.decision.allowed) {
      if (editAuth.decision.code === 'ONBOARDING') {
        return c.json({ error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
      }
      return c.json({ error: 'Note not found' }, 404);
    }
    const existingNote = editAuth.note;
    const actorRole = editAuth.decision.role;

    const targetEncrypted =
      typeof contentEncrypted === 'boolean' ? contentEncrypted : existingNote.contentEncrypted;
    const contentForStore = targetEncrypted
      ? content
      : canonicalizeNoteHtmlLineBreaks(typeof content === 'string' ? content : '');
    let capitalizedContent = targetEncrypted
      ? contentForStore
      : contentForStore.charAt(0).toUpperCase() + contentForStore.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
    if (!targetEncrypted) {
      capitalizedContent = transformCanonicalScriptureContent({
        noteId,
        content: capitalizedContent,
        translation: scriptureVersion || 'NET',
        pillsOnly: existingNote.noteType === 'default',
      }).updatedContent;
    }

    // Only bump updatedAt when the note's actual content changed. Folder/pin/tag/collection edits are
    // metadata and must not churn the "last updated" sort order. Critically, this is also the endpoint
    // the native sync push (flushNoteUpdate) and the web editor both flush through — so an auto-folder
    // assignment applied merely by *opening* a note must not re-stamp updatedAt here.
    //
    // The client may explicitly pass `bumpUpdatedAt: false` for normalization-only / cleanup saves
    // (e.g. link-stripping, pill hydration) that should persist content without reordering lists.
    // updatedAt doubles as the sync watermark, so suppressing it means the change won't propagate via
    // delta sync until the next real edit — acceptable for deterministic normalization (recomputed per
    // device).
    const titleChanged = capitalizedTitle !== existingNote.title;
    const contentChanged = capitalizedContent !== existingNote.content;
    const encryptionToggled =
      typeof contentEncrypted === 'boolean' && contentEncrypted !== existingNote.contentEncrypted;
    const contentTouched = titleChanged || contentChanged || encryptionToggled;
    const shouldBumpUpdatedAt = bumpUpdatedAtRaw === false ? false : contentTouched;

    const updateData: any = { title: capitalizedTitle, content: capitalizedContent };
    if (shouldBumpUpdatedAt) updateData.updatedAt = nowISO();
    let nextPrimaryForSecondaries: string | null = existingNote.primaryCollection ?? null;
    if (primaryCollectionRaw !== undefined) {
      updateData.primaryCollection =
        typeof primaryCollectionRaw === 'string' && primaryCollectionRaw.trim().length > 0
          ? primaryCollectionRaw.trim()
          : null;
      nextPrimaryForSecondaries = updateData.primaryCollection;
    }
    if (secondaryCollectionsRaw !== undefined) {
      const arr = Array.isArray(secondaryCollectionsRaw)
        ? secondaryCollectionsRaw.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      updateData.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(arr, nextPrimaryForSecondaries),
      );
    } else if (primaryCollectionRaw !== undefined) {
      const parsed = parseNoteSecondaryCollections(existingNote.secondaryCollections);
      updateData.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(parsed, nextPrimaryForSecondaries),
      );
    }
    if (isPinnedRaw !== undefined) {
      updateData.isPinned = Boolean(isPinnedRaw);
    }
    if (collectionPinnedRaw !== undefined) {
      updateData.collectionPinned = Boolean(collectionPinnedRaw);
    }
    if (collectionUserOverrideRaw !== undefined) {
      updateData.collectionUserOverride = Boolean(collectionUserOverrideRaw);
    }
    if (dismissedAutoTagsRaw !== undefined) {
      const arr = Array.isArray(dismissedAutoTagsRaw)
        ? dismissedAutoTagsRaw.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      updateData.dismissedAutoTags = serializeDismissedAutoTags(arr);
    }
    if (startedFromTemplateIdRaw !== undefined) {
      updateData.startedFromTemplateId =
        typeof startedFromTemplateIdRaw === 'string' && startedFromTemplateIdRaw.trim()
          ? startedFromTemplateIdRaw.trim()
          : null;
    }
    if (startedFromTemplateNameRaw !== undefined) {
      updateData.startedFromTemplateName =
        typeof startedFromTemplateNameRaw === 'string' && startedFromTemplateNameRaw.trim()
          ? startedFromTemplateNameRaw.trim().slice(0, 80)
          : null;
    }
    if (typeof contentEncrypted === 'boolean') {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) {
        updateData.isPublic = false;
        updateData.shareToken = null;
        updateData.shareTokenCreatedAt = null;
      }
    }

    const versionedUpdate = await db.transaction((tx) =>
      updateCanonicalNoteInTransaction(tx, {
        noteId,
        actorId: auth.userId,
        expectedVersion:
          expectedVersionRaw === undefined ? undefined : Number(expectedVersionRaw),
        patch: (lockedNote) => {
          const lockedPatch = { ...updateData };
          const lockedTargetEncrypted = resolveLockedEncryptionState(
            contentEncrypted,
            lockedNote.contentEncrypted,
          );
          const lockedTitleChanged =
            (capitalizedTitle ?? lockedNote.title) !== lockedNote.title;
          const lockedContentChanged = capitalizedContent !== lockedNote.content;
          const lockedEncryptionChanged = lockedTargetEncrypted !== lockedNote.contentEncrypted;
          if (bumpUpdatedAtRaw === false) delete lockedPatch.updatedAt;
          else if (lockedTitleChanged || lockedContentChanged || lockedEncryptionChanged) {
            lockedPatch.updatedAt = nowISO();
          } else {
            delete lockedPatch.updatedAt;
          }
          if (primaryCollectionRaw !== undefined && secondaryCollectionsRaw === undefined) {
            lockedPatch.secondaryCollections = serializeNoteSecondaryCollections(
              normalizeSecondaryLabels(
                parseNoteSecondaryCollections(lockedNote.secondaryCollections),
                lockedPatch.primaryCollection ?? lockedNote.primaryCollection,
              ),
            );
          }
          return lockedPatch;
        },
        nextContent: (lockedNote) => ({
          title: capitalizedTitle ?? lockedNote.title,
          content:
            resolveLockedEncryptionState(contentEncrypted, lockedNote.contentEncrypted)
              ? content
              : capitalizedContent,
          contentEncrypted: resolveLockedEncryptionState(
            contentEncrypted,
            lockedNote.contentEncrypted,
          ),
        }),
        source: 'save',
        now: nowISO(),
        actorRole,
      }),
    );
    const updatedNote = versionedUpdate.note;
    if (actorRole === 'collaborator') {
      console.log(
        '[co-edit] collaborator save',
        JSON.stringify({
          noteId,
          actorId: auth.userId,
          authorId: updatedNote.userId,
          viaSpaceId: editAuth.decision.allowed ? editAuth.decision.viaSpaceId : null,
        }),
      );
    }

    // Update thread timestamps — single bulk UPDATE instead of N sequential round trips.
    const noteThreads = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    const threadIdsToTouch = noteThreads.map((nt) => nt.threadId);
    if (shouldBumpUpdatedAt && threadIdsToTouch.length > 0) {
      // Intentionally actor-scoped: a collaborator editing someone else's note
      // matches zero rows here, which is correct — their save must not re-stamp
      // the author's private threads.
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(inArray(Threads.id, threadIdsToTouch), eq(Threads.userId, auth.userId)));
    }

    // Re-tag only when title or body changed AND updatedAt is being bumped (a real edit, not
    // normalization-only) — folder/pin edits and non-bumping saves must not churn tags.
    if (!updatedNote.contentEncrypted && shouldBumpUpdatedAt && (titleChanged || contentChanged)) {
      try {
        // Tags belong to the note's OWNER, not the actor. A collaborator saving a
        // co-edited note must not stamp their own userId onto the author's tags.
        const tagExcludes = autoTagExcludeOptionsForNote(updatedNote);
        const r = await generateAutoTags(updatedNote.title || '', updatedNote.content, updatedNote.userId, 0.7, tagExcludes);
        if (r.suggestions.length > 0) {
          await removeAutoTags(noteId);
          await applyAutoTags(noteId, r.suggestions, updatedNote.userId);
        }
      } catch (err) {
        console.error('[auto-tag] Failed to re-tag note:', noteId, err);
      }
    }

    // Update resource image (allow clear; otherwise require a safe http(s) URL)
    if (existingNote.noteType === 'resource' && resourceImage !== undefined) {
      try {
        let nextImage: string | null = null;
        if (typeof resourceImage === 'string' && resourceImage.trim()) {
          const imageValidation = validateResourceUrl(resourceImage);
          if (!imageValidation.isValid || !imageValidation.normalizedUrl) {
            return c.json({ error: imageValidation.error || 'Invalid resource image URL', code: imageValidation.code || 'INVALID_URL' }, 400);
          }
          nextImage = imageValidation.normalizedUrl;
        }
        const rm = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).limit(1));
        if (rm) await db.update(ResourceMetadata).set({ sourceImage: nextImage }).where(eq(ResourceMetadata.noteId, noteId));
      } catch {}
    }

    let scriptureResults: unknown[] = [];
    let processedContent: string | null = null;
    if (!updatedNote.contentEncrypted) {
      try {
        // Scope to the note's OWNER, not the actor — a shared-space collaborator editing
        // someone else's note would otherwise fail the util's ownership lookup and 500.
        const scriptureResult = await processScriptureReferences(
          noteId,
          updatedNote.userId,
          undefined,
          updatedNote.content,
          scriptureVersion || 'NET',
          { persistParentContent: false },
        );
        scriptureResults = scriptureResult?.results ?? [];
        // The stored body already carries pills — transformCanonicalScriptureContent
        // ran before the write — so the committed content is what the client (and
        // any co-editing follower) should render. scriptureResult is only consulted
        // for the per-reference results list above.
        processedContent = updatedNote.content;
      } catch (err: any) {
        // The note body is already committed above; pill enrichment is best-effort and
        // must not turn a successful save into a 500 (and a lost edit) for the client.
        console.error('[api/notes/update] Scripture processing failed:', err?.message ?? err);
        processedContent = updatedNote.content;
      }
    }

    let updateTags: Awaited<ReturnType<typeof fetchNoteTagsForResponse>> = [];
    if (!updatedNote.contentEncrypted) {
      try {
        // Owner-scoped for the same reason the re-tag above is: the tags on this
        // note are the author's, whoever happened to save it.
        updateTags = await fetchNoteTagsForResponse(noteId, updatedNote.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to load tags for update response:', noteId, err);
      }
    }

    const tagsPatch = updateTags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      category: t.category,
      isSystem: t.isSystem,
      isAutoGenerated: t.isAutoGenerated,
      confidence: t.confidence,
    }));

    await broadcastCanonicalNoteInvalidation(auth.userId, noteId, {
      type: 'note:updated',
      id: noteId,
    });

    return c.json({
      success: 'Note updated!',
      note: noteJsonWithParsedSecondaries(updatedNote),
      currentVersion: versionedUpdate.currentVersion.version,
      currentVersionId: versionedUpdate.currentVersion.id,
      tags: tagsPatch,
      scriptureResults,
      processedContent,
      scriptureProcessingError: false,
      scriptureDeferred: false,
    });
  } catch (error: any) {
    const mapped = noteVersionErrorResponse(error);
    if (mapped) return c.json({ error: mapped.message, code: mapped.code, ...(mapped.details ?? {}) }, mapped.status);
    return c.json({ error: error.message || 'Failed to update note' }, 500);
  }
});

// ─── POST /api/notes/connect-link ─────────────────────────────────────────────
// Creates an edge in the NoteConnections graph (many-to-many, cycles allowed).
route.post('/api/notes/connect-link', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parentNoteId = typeof body.parentNoteId === 'string' ? body.parentNoteId.trim() : '';
    const linkedNoteId = typeof body.linkedNoteId === 'string' ? body.linkedNoteId.trim() : '';
    if (!parentNoteId || !linkedNoteId) {
      return c.json({ success: false, error: 'parentNoteId and linkedNoteId are required', code: 'INVALID_BODY' }, 400);
    }
    if (parentNoteId === linkedNoteId) {
      return c.json({ success: false, error: 'Cannot connect a note to itself', code: 'SELF_LINK' }, 400);
    }

    const parent = first(
      await db.select({ id: Notes.id, threadId: Notes.threadId, noteType: Notes.noteType, addedBy: Notes.addedBy, spaceId: Notes.spaceId })
        .from(Notes).where(and(eq(Notes.id, parentNoteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    const linked = first(
      await db.select({ id: Notes.id, threadId: Notes.threadId, noteType: Notes.noteType, addedBy: Notes.addedBy, spaceId: Notes.spaceId })
        .from(Notes).where(and(eq(Notes.id, linkedNoteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    if (!parent || !linked) {
      return c.json({ success: false, error: 'Note not found', code: 'NOT_FOUND' }, 404);
    }
    if (isOnboardingSystemNote(parent) || isOnboardingSystemNote(linked)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }
    if ((parent.noteType || 'default') !== 'default' || (linked.noteType || 'default') !== 'default') {
      return c.json({ success: false, error: 'Only default notes can be linked.', code: 'INVALID_NOTE_TYPE' }, 400);
    }

    const clusterCountBefore = await countStudyThreadClustersForUser(auth.userId);

    // Insert edge — unique constraint handles the "already linked" case.
    const spaceId =
      normalizeOwnedNoteSpaceId(parent.spaceId ?? null) ??
      normalizeOwnedNoteSpaceId(linked.spaceId ?? null) ??
      null;

    if (spaceId) {
      try {
        const linkAccess = await requireSpaceAccess(spaceId, auth.userId);
        if (
          linkAccess.space.type !== 'personal' &&
          !canManageSpaceStructure(linkAccess.space, linkAccess.role)
        ) {
          return c.json({
            success: false,
            error: 'Only the space owner can create Thread links in a shared space',
            code: 'FORBIDDEN',
          }, 403);
        }
      } catch (err) {
        if (err instanceof SpaceAccessError) {
          return c.json({ success: false, error: err.message, code: err.code }, err.status);
        }
        throw err;
      }
    }

    try {
      await db.insert(NoteConnections).values({
        id: generateNoteId(),
        fromNoteId: parentNoteId,
        toNoteId: linkedNoteId,
        userId: auth.userId,
        spaceId,
        createdAt: nowISO(),
      });
    } catch (err: unknown) {
      // Unique constraint violation = already connected.
      if (isUniqueViolationError(err)) {
        if (spaceId) {
          await db
            .update(NoteConnections)
            .set({ spaceId })
            .where(
              and(
                eq(NoteConnections.fromNoteId, parentNoteId),
                eq(NoteConnections.toNoteId, linkedNoteId),
                eq(NoteConnections.userId, auth.userId),
                isNull(NoteConnections.spaceId),
              ),
            );
        }
        return c.json({ success: true, alreadyLinked: true });
      }
      throw err;
    }

    const clusterCountAfter = await countStudyThreadClustersForUser(auth.userId);
    awardStudyThreadClusterCreatedXPIfNew(
      auth.userId,
      clusterCountBefore,
      clusterCountAfter,
      parentNoteId,
    ).catch(() => {});

    if (clusterCountAfter > clusterCountBefore) {
      // New 2.0 study Thread cluster (not a folder).
      queueAudiencefulProductFlagsForUser(auth.userId, { has_created_thread: true });
    }

    try {
      const { graph } = await collectStudyThreadGraphForScope(parentNoteId, auth.userId, {
        preferredSpaceId: spaceId ?? undefined,
        maxNodes: 200,
      });
      const repNoteId =
        pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? parentNoteId;
      await appendStudyThreadMemberOrderOnConnect(
        repNoteId,
        auth.userId,
        [linkedNoteId],
        graph.nodeIds,
      );
    } catch {
      /* member order is best-effort */
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: parentNoteId });
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: linkedNoteId });
    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-link', action: 'connect_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/connect-link ──────────────────────────────────────────
// Removes an edge from the NoteConnections graph.
route.delete('/api/notes/connect-link', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromNoteId = typeof body.fromNoteId === 'string' ? body.fromNoteId.trim() : '';
    const toNoteId = typeof body.toNoteId === 'string' ? body.toNoteId.trim() : '';
    if (!fromNoteId || !toNoteId) {
      return c.json({ success: false, error: 'fromNoteId and toNoteId are required', code: 'INVALID_BODY' }, 400);
    }

    const existing = first(
      await db.select({ id: NoteConnections.id })
        .from(NoteConnections)
        .where(and(
          eq(NoteConnections.fromNoteId, fromNoteId),
          eq(NoteConnections.toNoteId, toNoteId),
          eq(NoteConnections.userId, auth.userId),
        ))
        .limit(1),
    );

    await db.delete(NoteConnections)
      .where(and(
        eq(NoteConnections.fromNoteId, fromNoteId),
        eq(NoteConnections.toNoteId, toNoteId),
        eq(NoteConnections.userId, auth.userId),
      ));

    if (existing) {
      await recordDeletedEntities(auth.userId, 'noteConnection', [existing.id]);
    }

    try {
      const { graph } = await collectStudyThreadGraphForScope(fromNoteId, auth.userId, { maxNodes: 200 });
      const repNoteId =
        pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? fromNoteId;
      const memberSet = new Set(graph.nodeIds);
      if (!memberSet.has(fromNoteId)) {
        await removeStudyThreadMemberOrderOnDisconnect(repNoteId, auth.userId, fromNoteId);
      }
      if (!memberSet.has(toNoteId)) {
        await removeStudyThreadMemberOrderOnDisconnect(repNoteId, auth.userId, toNoteId);
      }
    } catch {
      /* member order is best-effort */
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: fromNoteId });
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: toNoteId });
    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-link', action: 'disconnect_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/migrate-connections ─────────────────────────────────────
// One-time, idempotent backfill: creates NoteConnections rows from all existing
// Notes.linkedFromNoteId values for the authenticated user.
route.post('/api/notes/migrate-connections', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { migrated, skipped } = await migrateLinkedFromNoteConnectionsForUser(auth.userId);
    return c.json({ success: true, migrated, skipped });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/migrate-connections', action: 'migrate_connections' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/:id/thread ───────────────────────────────────────────────
// Returns the study thread graph for a note: bidirectional BFS over NoteConnections.
// Response is flat: { focusNoteId, nodes[], edges[], nodeCount }.
route.get('/api/notes/:id/thread', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const focusNoteId = normalizeServerNoteId(requireParam(c, 'id'));

    const focus = first(
      await db
        .select({ id: Notes.id, spaceId: Notes.spaceId })
        .from(Notes)
        .where(and(eq(Notes.id, focusNoteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!focus) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(focusNoteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const { nodeIds, edges: uniqueEdges, degreeMap } = graph;

    const noteRows = await fetchStudyThreadNoteRows(nodeIds, auth.userId);

    const repNoteId =
      pickStudyThreadRepresentativeNoteId(degreeMap.keys(), degreeMap) ?? focusNoteId;

    // Batch resource metadata.
    const resourceIds = noteRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
    let resourceMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null }> = {};
    if (resourceIds.length > 0) {
      try {
        const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
          .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceIds));
        resourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
      } catch { resourceMap = {}; }
    }

    const nodes = noteRows.map((n) => {
      const rm = n.noteType === 'resource' ? resourceMap[n.id] : null;
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        simpleNoteId: n.simpleNoteId ?? null,
        noteType: n.noteType || 'default',
        resourceTitle: rm?.sourceTitle ?? null,
        resourceDescription: rm?.sourceDescription ?? null,
        resourceImage: rm?.sourceImage ?? null,
        updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
      };
    });

    const suggestNodes: StudyThreadSuggestNode[] = noteRows.map((n) => {
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
    });
    const naming = resolveStudyThreadClusterNaming(noteRows, suggestNodes, repNoteId);
    const memberOrder = await fetchStudyThreadMemberOrder(naming.repNoteId, auth.userId);

    return c.json({
      success: true,
      focusNoteId,
      repNoteId: naming.repNoteId,
      threadTitle: naming.threadTitle,
      suggestedTitle: naming.suggestedTitle,
      studyThreadUserOverride: naming.studyThreadUserOverride,
      studyThreadPinned: naming.studyThreadPinned,
      memberOrder,
      nodes,
      edges: uniqueEdges,
      nodeCount: nodes.length,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/thread', action: 'get_note_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── PATCH /api/notes/:id/thread/member-order ────────────────────────────────
// Persists user-defined note order for a study-thread cluster.
route.patch('/api/notes/:id/thread/member-order', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const focusNoteId = normalizeServerNoteId(requireParam(c, 'id'));
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const orderedNoteIds = Array.isArray(body.orderedNoteIds)
      ? body.orderedNoteIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : null;
    if (!orderedNoteIds || orderedNoteIds.length === 0) {
      return c.json({ success: false, error: 'orderedNoteIds is required', code: 'INVALID_BODY' }, 400);
    }

    const focus = first(
      await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.id, focusNoteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!focus) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(focusNoteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const repNoteId =
      pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? focusNoteId;
    const memberSet = new Set(graph.nodeIds);

    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of orderedNoteIds) {
      if (!memberSet.has(id) || seen.has(id)) continue;
      uniqueIds.push(id);
      seen.add(id);
    }
    if (uniqueIds.length !== graph.nodeIds.length) {
      return c.json(
        {
          success: false,
          error: 'orderedNoteIds must include every note in the thread exactly once',
          code: 'INVALID_ORDER',
        },
        400,
      );
    }

    await upsertStudyThreadMemberOrder(repNoteId, auth.userId, uniqueIds);
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: repNoteId });
    return c.json({ success: true, repNoteId, memberOrder: uniqueIds });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[id]/thread/member-order',
      action: 'update_thread_member_order',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── PATCH /api/notes/:id/study-thread-title ────────────────────────────────
// Sets (or clears) the custom study-thread name on the representative note.
/**
 * Author opt-in for co-editing ("pass the pen"). Author-only by design — a
 * collaborator can write the body but can never widen or revoke who else may.
 * Metadata only: no version checkpoint, and updatedAt is untouched so flipping
 * the switch doesn't reorder anyone's lists.
 */
route.patch('/api/notes/:id/co-edit', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = normalizeServerNoteId(requireParam(c, 'id'));
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.enabled !== 'boolean') {
      return c.json({ success: false, error: '`enabled` must be a boolean' }, 400);
    }
    const enabled = body.enabled;

    const note = first(
      await db
        .select()
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    ) as typeof Notes.$inferSelect | undefined;
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    if (isOnboardingSystemNote(note)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }
    if (enabled && note.contentEncrypted) {
      return c.json(
        { success: false, error: 'Locked notes stay private.', code: 'CO_EDIT_LOCKED_NOTE' },
        400,
      );
    }
    if (enabled && !(await noteHasLiveSharedSpaceAssociation(noteId))) {
      return c.json(
        {
          success: false,
          error: 'Share this note to a shared space before opening it for editing.',
          code: 'CO_EDIT_REQUIRES_SHARED_SPACE',
        },
        400,
      );
    }

    await db
      .update(Notes)
      .set({ coEditEnabled: enabled, coEditEnabledAt: enabled ? nowISO() : null })
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));

    // Members with the note open need to pick up (or lose) the capability.
    await broadcastCanonicalNoteInvalidation(auth.userId, noteId, { type: 'note:updated', id: noteId });

    return c.json({ success: true, coEditEnabled: enabled });
  } catch (error) {
    console.error('Error updating note co-edit setting:', error);
    return c.json({ success: false, error: 'Failed to update co-editing' }, 500);
  }
});

route.patch('/api/notes/:id/study-thread-title', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = normalizeServerNoteId(requireParam(c, 'id'));
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const hasTitleField = Object.prototype.hasOwnProperty.call(body, 'title');
    const title = hasTitleField
      ? typeof body.title === 'string'
        ? body.title.trim() || null
        : null
      : undefined;
    const userOverride =
      typeof body.userOverride === 'boolean' ? body.userOverride : undefined;
    const pinned = typeof body.pinned === 'boolean' ? body.pinned : undefined;

    const note = first(
      await db
        .select({ id: Notes.id, spaceId: Notes.spaceId })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(noteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const repNoteId =
      pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? noteId;
    const clusterIds = graph.nodeIds.length > 0 ? graph.nodeIds : [repNoteId];

    const applyNamingToCluster = async (payload: Record<string, unknown>, ids: string[]) => {
      if (ids.length === 0) return;
      await db
        .update(Notes)
        .set(payload as Record<string, unknown>)
        .where(and(inArray(Notes.id, ids), eq(Notes.userId, auth.userId)));
    };

    const clusterCountBefore = await countStudyThreadClustersForUser(auth.userId);

    try {
      if (userOverride === false) {
        await applyNamingToCluster(
          {
            studyThreadTitle: null,
            studyThreadUserOverride: false,
            studyThreadLastAutoSuggestedAt: new Date(),
            updatedAt: nowISO(),
          },
          clusterIds,
        );
      } else if (title !== undefined) {
        const manualPayload: Record<string, unknown> = {
          studyThreadTitle: title,
          studyThreadUserOverride: userOverride ?? true,
          updatedAt: nowISO(),
        };
        await applyNamingToCluster(manualPayload, clusterIds);
      }

      if (pinned !== undefined) {
        await db
          .update(Notes)
          .set({ studyThreadPinned: pinned, updatedAt: nowISO() })
          .where(and(eq(Notes.id, repNoteId), eq(Notes.userId, auth.userId)));
      }
    } catch (error) {
      if (!isStudyThreadNamingColumnMissing(error)) throw error;
      const fallback: Record<string, unknown> = { updatedAt: nowISO() };
      if (title !== undefined) {
        fallback.studyThreadTitle = title;
        fallback.studyThreadUserOverride =
          userOverride !== undefined ? userOverride : title ? true : false;
      } else if (userOverride !== undefined) {
        fallback.studyThreadUserOverride = userOverride;
      }
      if (userOverride === false) {
        fallback.studyThreadTitle = null;
      }
      if (Object.keys(fallback).length > 1) {
        await applyNamingToCluster(fallback, clusterIds);
      }
    }

    const clusterCountAfter = await countStudyThreadClustersForUser(auth.userId);
    const awardTitle = typeof title === 'string' ? title : undefined;
    awardStudyThreadClusterCreatedXPIfNew(
      auth.userId,
      clusterCountBefore,
      clusterCountAfter,
      repNoteId,
      awardTitle,
    ).catch(() => {});

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: repNoteId });
    return c.json({
      success: true,
      title: title !== undefined ? title : undefined,
      userOverride,
      pinned,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/study-thread-title', action: 'update_study_thread_title' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/delete ────────────────────────────────────────────────
route.delete('/api/notes/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    const deleteSource = c.req.header('X-Harvous-Delete-Source') ?? c.req.query('source') ?? 'unknown';
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);

    console.info('[api/notes/delete]', {
      userId: auth.userId,
      noteId,
      source: deleteSource,
      noteType: existingNote.noteType,
    });

    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    const deleted = await deleteSingleNoteCascadeForUser(auth.userId, noteId);
    if (deleted.deletedNoteIds.length === 0) {
      return c.json({ error: 'Note not found or access denied' }, 404);
    }
    await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);

    // Revoke XP (fire-and-forget)
    (async () => {
      try {
        await revokeXPOnDeletion(auth.userId, noteId, noteCreatedAt);
        await revokeAllXPForItem(auth.userId, noteId);
      } catch {}
    })().catch(() => {});

    void broadcastNoteInvalidation(auth.userId, existingNote.spaceId, { type: 'note:deleted', id: noteId });

    return c.json({ success: true, deletedId: noteId, noteId, threadId });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/delete', action: 'delete_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/next-id ──────────────────────────────────────────────────
route.get('/api/notes/next-id', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId,
        currentSeason: season, createdAt: nowISO(),
      });
      userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    }
    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const nextSimpleNoteId = effectiveHighest + 1;
    const formattedId = `N${nextSimpleNoteId.toString().padStart(3, '0')}`;
    return c.json({ nextNoteId: nextSimpleNoteId, formattedId });
  } catch (error: any) {
    console.error('Error getting next note ID:', error);
    return c.json({ error: error.message || 'Failed to get next note ID' }, 500);
  }
});

// ─── GET /api/notes/recent ──────────────────────────────────────────────────
route.get('/api/notes/recent', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const maxLimit = Math.max(1, limit);

    const notes = await db.select({
      id: Notes.id, title: Notes.title, content: Notes.content, contentEncrypted: Notes.contentEncrypted,
      threadId: Notes.threadId, spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic, isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
    }).from(Notes).where(eq(Notes.userId, auth.userId))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(maxLimit);

    const formattedNotes = notes.map(note => ({
      ...note,
      title: note.title || 'Untitled Note',
      contentEncrypted: note.contentEncrypted || false,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
    }));

    return c.json(formattedNotes);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/recent', action: 'get_recent_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/fingerprints ────────────────────────────────────────────
// Memory layer: the user's passage memory fingerprints (meaning + tone + themes per note).
// Powers forgetting-aware resurfacing (Workstream B) on the Home view and the inspector read-out.
route.get('/api/notes/fingerprints', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const fingerprints = await getUserNoteFingerprints(auth.userId);
    const compact = fingerprints.map((f) => ({
      noteId: f.noteId,
      meaningWeight: f.meaningWeight,
      emotionalTone: f.emotionalTone,
      themes: f.themes,
      people: f.people,
      places: f.places,
      passageCount: f.passageCount,
      canonSection: f.canonSection,
      canonSectionLabel: f.canonSectionLabel,
      testament: f.testament,
      canonSections: f.canonSections,
      recallStabilityDays: f.recallStabilityDays,
      lastRecallEngagedAt: f.lastRecallEngagedAt?.toISOString() ?? null,
    }));
    return c.json({ success: true, fingerprints: compact });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/fingerprints', action: 'get_fingerprints' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/crossref-gaps ──────────────────────────────────────────────
// Generative recall Phase 2: passages cross-referenced FROM the user's cited passages that they
// haven't written about yet. Powers the "A link worth making" generative card in the recall carousel.
route.get('/api/notes/crossref-gaps', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gaps = await getCrossRefGaps(auth.userId, { limit: 5 });
    return c.json({ success: true, gaps });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/crossref-gaps', action: 'get_crossref_gaps' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/connect-suggestions ───────────────────────────────────────
// Generative recall Phase 2: strongly-related note pairs with no existing connection edge.
// Powers the "connect two related notes" card; one-tap creates the edge via POST /api/notes/connect-link.
route.get('/api/notes/connect-suggestions', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const suggestions = await getConnectSuggestions(auth.userId, { limit: 3 });
    return c.json({ success: true, suggestions });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-suggestions', action: 'get_connect_suggestions' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/recall-engaged ───────────────────────────────────────────
// Workstream B: user opened a resurfaced note — bump stability and record engagement time.
route.post('/api/notes/recall-engaged', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { noteId } = await c.req.json();
    if (!noteId || typeof noteId !== 'string') {
      return c.json({ error: 'Note ID is required' }, 400);
    }

    const result = await recordNoteRecallEngaged(auth.userId, noteId.trim());
    if (!result) {
      return c.json({ error: 'Note not found or recall state unavailable' }, 404);
    }

    return c.json({
      success: true,
      noteId: result.noteId,
      recallStabilityDays: result.recallStabilityDays,
      lastRecallEngagedAt: result.lastRecallEngagedAt?.toISOString() ?? null,
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/recall-engaged', action: 'recall_engaged' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/auto-tags ──────────────────────────────────────────────
route.post('/api/notes/auto-tags', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { noteId, noteTitle, noteContent, action = 'generate' } = await c.req.json();
    if (!noteId || !noteTitle || !noteContent) return c.json({ error: 'Note ID, title, and content are required' }, 400);

    const noteRow = first(
      await db.select({
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        dismissedAutoTags: Notes.dismissedAutoTags,
      }).from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    const tagExcludes = noteRow ? autoTagExcludeOptionsForNote(noteRow) : { excludeLabels: [], excludeTagNames: [] };

    let result;
    switch (action) {
      case 'generate':
        result = await generateAutoTags(noteTitle, noteContent, auth.userId, 0.7, tagExcludes);
        break;
      case 'apply': {
        const suggestions = await generateAutoTags(noteTitle, noteContent, auth.userId, 0.7, tagExcludes);
        const applied = await applyAutoTags(noteId, suggestions.suggestions, auth.userId);
        result = { ...suggestions, applied };
        break;
      }
      case 'regenerate':
        result = await regenerateAutoTags(noteId, noteTitle, noteContent, auth.userId, 0.7, {
          ...tagExcludes,
          clearDismissed: true,
        });
        break;
      default:
        return c.json({ error: 'Invalid action' }, 400);
    }

    return c.json({ success: true, result });
  } catch (error) {
    console.error('Error with auto tags:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/cleanup-upgrade-note ───────────────────────────────────
route.post('/api/notes/cleanup-upgrade-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { noteId, simpleNoteId } = await c.req.json();
    if (!noteId || !simpleNoteId) return c.json({ error: 'Note ID and simple note ID are required' }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);
    if (existingNote.simpleNoteId !== simpleNoteId) return c.json({ error: 'Simple note ID mismatch' }, 400);

    const noteCreatedAt = existingNote.createdAt;

    const deleted = await deleteSingleNoteCascadeForUser(auth.userId, noteId);
    if (deleted.deletedNoteIds.length === 0) {
      return c.json({ error: 'Note not found or access denied' }, 404);
    }
    await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);

    await revokeXPOnDeletion(auth.userId, noteId, noteCreatedAt);
    await revokeAllXPForItem(auth.userId, noteId);

    const userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (userMetadata) {
      if (userMetadata.highestSimpleNoteId === simpleNoteId) {
        await db.update(UserMetadata).set({ highestSimpleNoteId: simpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      } else if (userMetadata.highestSimpleNoteId > simpleNoteId) {
        const existing = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes)
          .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
          .orderBy(desc(Notes.simpleNoteId)).limit(1);
        const newHighestId = existing.length > 0 ? (existing[0].simpleNoteId || 0) : 0;
        await db.update(UserMetadata).set({ highestSimpleNoteId: newHighestId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      }
    }

    return c.json({ success: true, message: 'Note cleaned up and highestSimpleNoteId reset' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/cleanup-upgrade-note', action: 'cleanup_upgrade_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/delete-all-unorganized ───────────────────────────────
route.delete('/api/notes/delete-all-unorganized', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const unorgNotes = await db.select({ id: Notes.id, createdAt: Notes.createdAt }).from(Notes)
      .where(and(eq(Notes.userId, auth.userId), eq(Notes.threadId, 'thread_unorganized')));
    const noteIds = unorgNotes.map(n => n.id);

    if (noteIds.length > 0) {
      const deleted = await deleteNotesCascadeForUser(auth.userId, noteIds);
      await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
      await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);
      for (const note of unorgNotes) {
        if (!deleted.deletedNoteIds.includes(note.id)) continue;
        // Revoke XP (fire-and-forget to match main delete pattern)
        (async () => {
          try {
            await revokeXPOnDeletion(auth.userId, note.id, note.createdAt);
            await revokeAllXPForItem(auth.userId, note.id);
          } catch {}
        })().catch(() => {});
      }
    }

    return c.json({ success: true, message: 'All notes deleted from unorganized thread' });
  } catch (error) {
    console.error('Error deleting unorganized thread notes:', error);
    return c.json({ error: 'Failed to erase notes from unorganized thread' }, 500);
  }
});

// ─── POST /api/notes/suggest-threads ────────────────────────────────────────
route.post('/api/notes/suggest-threads', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const title = typeof body.title === 'string' ? body.title : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const noteId = typeof body.noteId === 'string' && body.noteId.trim() ? body.noteId.trim() : undefined;

    if (!title && !content) return c.json({ error: 'Title or content is required', code: 'MISSING_CONTENT' }, 400);
    const noteText = `${title || ''} ${content || ''}`.trim();
    if (!noteText) return c.json({ error: 'Note text is required', code: 'EMPTY_CONTENT' }, 400);

    const passageMap = new Map<string, VerseKey>();
    for (const v of detectVerseKeysFromNoteText(title, content)) {
      passageMap.set(`${v.book}|${v.chapter}|${v.verse}`, v);
    }
    if (noteId) {
      for (const v of await getNotePassages(noteId)) {
        passageMap.set(`${v.book}|${v.chapter}|${v.verse}`, v);
      }
    }
    const sourcePassages = [...passageMap.values()];

    const relatedNotes =
      sourcePassages.length > 0
        ? await getRelatedNotesForPassages(auth.userId, sourcePassages, {
            limit: 15,
            excludeNoteId: noteId,
          })
        : [];

    const relatedNoteIds = relatedNotes.map((r) => r.noteId);
    const noteIdToThreadIds = new Map<string, string[]>();
    if (relatedNoteIds.length > 0) {
      const noteThreadRows = await db
        .select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
        .from(NoteThreads)
        .where(inArray(NoteThreads.noteId, relatedNoteIds));
      for (const row of noteThreadRows) {
        const list = noteIdToThreadIds.get(row.noteId) ?? [];
        list.push(row.threadId);
        noteIdToThreadIds.set(row.noteId, list);
      }
    }

    const recentThreadRelations = await db
      .select({ threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt })
      .from(NoteThreads)
      .innerJoin(Notes, eq(NoteThreads.noteId, Notes.id))
      .where(eq(Notes.userId, auth.userId))
      .orderBy(desc(NoteThreads.createdAt))
      .limit(50);
    const recentThreadIds = [...new Set(recentThreadRelations.map((r) => r.threadId))].filter(
      (id) => id !== 'thread_unorganized',
    ).slice(0, 10);

    const allThreads = await db
      .select({ id: Threads.id, title: Threads.title, color: Threads.color })
      .from(Threads)
      .where(eq(Threads.userId, auth.userId));

    const noteKeywordNames = findKeywordsInText(noteText).map((k) => k.keyword.name);
    const keywordNamesFromText = (text: string) => findKeywordsInText(text).map((k) => k.keyword.name);

    const threadKeywordScores = new Map<string, number>();
    for (const thread of allThreads) {
      if (thread.id === 'thread_unorganized') continue;
      const overlap = scoreThreadKeywordOverlap(
        noteKeywordNames,
        thread.title,
        keywordNamesFromText,
        conceptOverlaps,
      );
      if (overlap > 0) threadKeywordScores.set(thread.id, overlap);
    }

    const ranked = rankThreadSuggestions(
      {
        relatedNotes,
        noteIdToThreadIds,
        threadKeywordScores,
        recentThreadIds,
        threadMeta: allThreads.map((t) => ({ id: t.id, title: t.title, color: t.color })),
      },
      { limit: 5 },
    );

    const metaById = new Map(allThreads.map((t) => [t.id, t]));
    const top = ranked.map((s) => {
      const meta = metaById.get(s.threadId)!;
      return { threadId: s.threadId, title: meta.title, color: meta.color, score: s.score, reason: s.reason };
    });

    return c.json({
      success: true,
      suggestedThreadIds: top.map((s) => s.threadId),
      suggestedThreads: top.map((s) => ({ id: s.threadId, title: s.title, color: s.color, reason: s.reason })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/suggest-threads', action: 'suggest_threads' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/:id/tags ────────────────────────────────────────────────
route.get('/api/notes/:id/tags', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'id');

    const note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    const explicitContextRaw = c.req.query('contextSpaceId') ?? c.req.query('spaceId') ?? null;
    const context = await resolveNoteReadContext({
      note,
      viewerUserId: auth.userId,
      explicitSpaceId: explicitContextRaw ? normalizeOwnedNoteSpaceId(explicitContextRaw) : null,
    });
    if (!context) return c.json({ error: 'Note not found' }, 404);

    const tags = await fetchNoteTagsForResponse(noteId, note.userId);
    const visibleTags =
      tags.filter((tag) =>
        canExposeCanonicalTagInContext({
          isAuthor: note.userId === auth.userId,
          hasActiveSharedContext: context.isShared,
          isSystemTag: tag.isSystem,
        }),
      );

    return c.json({
      success: true,
      contextSpaceId: context.space.id,
      tags: visibleTags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to load note tags' }, 500);
  }
});

// ─── GET /api/notes/:id/details ─────────────────────────────────────────────
route.get('/api/notes/:id/details', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'id');
    const explicitContextRaw = c.req.query('contextSpaceId') ?? c.req.query('spaceId') ?? null;
    const explicitContextSpaceId = explicitContextRaw
      ? normalizeOwnedNoteSpaceId(explicitContextRaw)
      : null;
    let note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note) return c.json({ error: 'Note not found or access denied' }, 404);
    const readContext = await resolveNoteReadContext({
      note,
      viewerUserId: auth.userId,
      explicitSpaceId: explicitContextSpaceId,
    });
    if (!readContext) return c.json({ error: 'Note not found or access denied' }, 404);
    const isMemberView = note.userId !== auth.userId;

    // Scripture version
    let version: string | undefined;
    if (note.noteType === 'scripture') {
      try {
        const sm = first(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId)).limit(1));
        version = sm?.translation;
      } catch { version = undefined; }
    }

    // Resource metadata
    let resourceTitle: string | null = null, resourceDescription: string | null = null, resourceImage: string | null = null;
    if (note.noteType === 'resource') {
      try {
        const rm = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).limit(1));
        resourceTitle = rm?.sourceTitle || null;
        resourceDescription = rm?.sourceDescription || null;
        resourceImage = rm?.sourceImage || null;
      } catch {}
    }

    const contextIsMyHome =
      !readContext.isShared && readContext.space.title.trim().toLowerCase() === 'my home';
    const viewerIsSharedOwner =
      readContext.isShared && readContext.space.userId === auth.userId;
    const threadContextWhere = readContext.isShared
      ? and(
          eq(Threads.spaceId, readContext.space.id),
          viewerIsSharedOwner ? undefined : eq(Threads.isPinned, true),
        )
      : contextIsMyHome
        ? eq(Threads.userId, auth.userId)
        : and(eq(Threads.userId, auth.userId), eq(Threads.spaceId, readContext.space.id));

    // Threads selectable in the explicit note context.
    const allUserThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color, isPublic: Threads.isPublic, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
      .from(Threads).where(threadContextWhere);
    const selectableUserThreads = allUserThreads.filter((thread) => {
      if (thread.id === 'thread_unorganized') return false;
      return thread.title?.trim().toLowerCase() !== 'unorganized';
    });

    // Junction threads
    let allThreads: any[] = [];
    try {
      const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
        .from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
        .where(and(
          eq(NoteThreads.noteId, noteId),
          readContext.isShared
            ? and(
                eq(Threads.spaceId, readContext.space.id),
                viewerIsSharedOwner ? undefined : eq(Threads.isPinned, true),
              )
            : contextIsMyHome
              ? or(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized'))
              : and(eq(Threads.userId, auth.userId), eq(Threads.spaceId, readContext.space.id)),
        ));
      allThreads = junctionThreads;
    } catch { allThreads = []; }

    // Heal-on-read: scripture notes can list under threads via NoteScriptureReferences without NoteThreads rows
    if (note.noteType === 'scripture' && note.userId === auth.userId) {
      try {
        const healed = await healScriptureNoteThreadsFromParents(noteId, auth.userId);
        if (healed) {
          const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
            .from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
            .where(and(
              eq(NoteThreads.noteId, noteId),
              or(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized')),
            ));
          allThreads = junctionThreads;
          const refreshed = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
          if (refreshed) note = refreshed;
        }
      } catch (healErr) {
        console.error('[api/notes/:id/details] healScriptureNoteThreadsFromParents:', healErr);
      }
    }

    // Notes that live only in unorganized have no NoteThreads row; include unorganized thread so nav shows My Pile.
    if (!readContext.isShared && allThreads.length === 0 && note.threadId === 'thread_unorganized') {
      await ensureUnorganizedThread(auth.userId);
      const unorganizedRow = first(await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
        .from(Threads)
        .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, auth.userId)))
        .limit(1));
      if (unorganizedRow) {
        const unorganizedCountResult = first(await db.select({ count: count() })
          .from(Notes)
          .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(eq(Notes.userId, auth.userId), isNull(NoteThreads.id)))
          .limit(1));
        allThreads = [{
          ...unorganizedRow,
          title: unorganizedRow.title || MY_PILE_THREAD_TITLE,
          subtitle: unorganizedRow.subtitle || 'Thread',
          count: unorganizedCountResult?.count || 0,
          backgroundGradient: getThreadGradientCSS(unorganizedRow.color || 'paper'),
        }];
      }
    }

    if (readContext.isShared) {
      try {
        const memberSpaceThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
          .from(NoteThreads).innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(
            eq(NoteThreads.noteId, noteId),
            eq(Threads.spaceId, readContext.space.id),
            viewerIsSharedOwner ? undefined : eq(Threads.isPinned, true),
          ));
        const memberThreads = memberSpaceThreads.filter(
          t => t.spaceId === readContext.space.id && t.id !== 'thread_unorganized',
        );
        allThreads = [...memberThreads, ...allThreads];
      } catch {}
    }

    // Member view: NoteThreads→space thread rows can be missing while note.spaceId + Notes.threadId still point at the space thread.
    if (readContext.isShared && allThreads.length === 0 && note.threadId && note.threadId !== 'thread_unorganized') {
      try {
        const fallbackThread = first(
          await db
            .select({
              id: Threads.id,
              title: Threads.title,
              subtitle: Threads.subtitle,
              color: Threads.color,
              spaceId: Threads.spaceId,
              isPublic: Threads.isPublic,
              isPinned: Threads.isPinned,
              createdAt: Threads.createdAt,
              updatedAt: Threads.updatedAt,
            })
            .from(Threads)
            .where(and(
              eq(Threads.id, note.threadId),
              eq(Threads.spaceId, readContext.space.id),
              viewerIsSharedOwner ? undefined : eq(Threads.isPinned, true),
            ))
            .limit(1),
        );
        if (fallbackThread) {
          allThreads = [fallbackThread];
        }
      } catch {
        /* ignore */
      }
    }

    // Format threads with counts and backgroundGradient for nav/NotePage.
    // Counts are batched into at most three grouped queries (instead of one query
    // per thread) keyed by threadId: total junction counts for member-space threads,
    // owner-scoped counts for regular threads, and a single count for unorganized.
    const regularThreadIds = allThreads
      .filter((t: any) => t.id !== 'thread_unorganized' && !(readContext.isShared && t.spaceId))
      .map((t: any) => t.id);
    const memberTotalThreadIds = allThreads
      .filter((t: any) => t.id !== 'thread_unorganized' && readContext.isShared && t.spaceId)
      .map((t: any) => t.id);
    const hasUnorganized = allThreads.some((t: any) => t.id === 'thread_unorganized');

    const [regularCountRows, memberTotalCountRows, unorganizedCountResult] = await Promise.all([
      regularThreadIds.length > 0
        ? db.select({ threadId: NoteThreads.threadId, count: count() })
            .from(Notes)
            .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
            .where(and(inArray(NoteThreads.threadId, regularThreadIds), eq(Notes.userId, auth.userId)))
            .groupBy(NoteThreads.threadId)
        : Promise.resolve([] as Array<{ threadId: string; count: number }>),
      memberTotalThreadIds.length > 0
        ? db.select({ threadId: NoteThreads.threadId, count: count() })
            .from(NoteThreads)
            .where(inArray(NoteThreads.threadId, memberTotalThreadIds))
            .groupBy(NoteThreads.threadId)
        : Promise.resolve([] as Array<{ threadId: string; count: number }>),
      hasUnorganized
        ? db.select({ count: count() })
            .from(Notes)
            .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
            .where(and(eq(Notes.userId, auth.userId), isNull(NoteThreads.id)))
            .limit(1)
            .then(rows => first(rows))
        : Promise.resolve(undefined),
    ]);

    const threadCountMap = new Map<string, number>();
    for (const row of regularCountRows) threadCountMap.set(row.threadId, row.count);
    for (const row of memberTotalCountRows) threadCountMap.set(row.threadId, row.count);
    const unorganizedCount = unorganizedCountResult?.count || 0;

    const formattedThreads = allThreads.map((thread: any) => {
      const threadCount = thread.id === 'thread_unorganized'
        ? unorganizedCount
        : (threadCountMap.get(thread.id) || 0);
      return {
        ...thread,
        subtitle: thread.subtitle || 'Thread',
        count: thread.count != null ? thread.count : threadCount,
        backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color),
      };
    });

    // Comments
    const comments = readContext.isShared
      ? []
      : await db.select({ id: Comments.id, content: Comments.content, createdAt: Comments.createdAt, updatedAt: Comments.updatedAt })
          .from(Comments)
          .where(and(eq(Comments.noteId, noteId), eq(Comments.userId, auth.userId)))
          .orderBy(Comments.createdAt);

    // Tags are canonical private metadata. Shared contexts intentionally expose none
    // until a separate per-space tag model exists.
    const noteTags = readContext.isShared
      ? []
      : await db.select({ id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem, isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt })
          .from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
          .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, note.userId))).orderBy(Tags.name);

    const dedupedNoteTags = dedupeNoteTagsForResponse(noteTags as any) as unknown as Array<(typeof noteTags)[number]>;

    // Referencing notes (for scripture notes)
    let referencingNotes: any[] = [];
    if (note.noteType === 'scripture') {
      try {
        let junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
          .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
          .orderBy(desc(Notes.updatedAt));

        // Heal on read
        if (junctionEntries.length === 0) {
          try {
            const notesWithPill = await db.select({ id: Notes.id }).from(Notes)
              .where(and(eq(Notes.userId, auth.userId), ne(Notes.noteType, 'scripture'), like(Notes.content, `%data-note-id="${noteId}"%`)));
            for (const refNote of notesWithPill) {
              try {
                const ex = first(await db.select().from(NoteScriptureReferences).where(and(eq(NoteScriptureReferences.noteId, refNote.id), eq(NoteScriptureReferences.scriptureNoteId, noteId))).limit(1));
                if (!ex) await db.insert(NoteScriptureReferences).values({ id: `note-scripture-${refNote.id}-${noteId}-${Date.now()}`, noteId: refNote.id, scriptureNoteId: noteId, createdAt: nowISO() });
              } catch {}
            }
            if (notesWithPill.length > 0) {
              junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
                .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
                .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
                .orderBy(desc(Notes.updatedAt));
            }
          } catch {}
        }

        // Resource metadata for referencing notes
        const resourceNoteIds = junctionEntries.filter(e => e.noteType === 'resource').map(e => e.id);
        let resourceMetadataMap: Record<string, any> = {};
        if (resourceNoteIds.length > 0) {
          try {
            const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
              .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
            resourceMetadataMap = Object.fromEntries(rmList.map(m => [m.noteId, m]));
          } catch {}
        }

        referencingNotes = junctionEntries.map(entry => {
          const rm = entry.noteType === 'resource' ? resourceMetadataMap[entry.id] : null;
          return { ...entry, noteType: entry.noteType || 'default', resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null };
        });
      } catch { referencingNotes = []; }
    }

    // Read connections from the NoteConnections graph (many-to-many).
    // linkedFromNotes = edges where this note is the *target* (incoming).
    // linkedToNotes   = edges where this note is the *source* (outgoing).
    let linkedFromNotes: any[] = [];
    let linkedToNotes: any[] = [];
    if (!isMemberView && note.userId === auth.userId) {
      try {
        const [incomingEdges, outgoingEdges] = await Promise.all([
          db.select({ fromNoteId: NoteConnections.fromNoteId, createdAt: NoteConnections.createdAt })
            .from(NoteConnections)
            .where(and(eq(NoteConnections.toNoteId, noteId), eq(NoteConnections.userId, auth.userId)))
            .orderBy(asc(NoteConnections.createdAt))
            .limit(100),
          db.select({ toNoteId: NoteConnections.toNoteId, createdAt: NoteConnections.createdAt })
            .from(NoteConnections)
            .where(and(eq(NoteConnections.fromNoteId, noteId), eq(NoteConnections.userId, auth.userId)))
            .orderBy(asc(NoteConnections.createdAt))
            .limit(100),
        ]);

        const allConnectedIds = [
          ...incomingEdges.map((e) => e.fromNoteId),
          ...outgoingEdges.map((e) => e.toNoteId),
        ];

        if (allConnectedIds.length > 0) {
          const connectedRows = await db.select({
            id: Notes.id, title: Notes.title, content: Notes.content,
            simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
            createdAt: Notes.createdAt, updatedAt: Notes.updatedAt,
          }).from(Notes)
            .where(and(inArray(Notes.id, allConnectedIds), eq(Notes.userId, auth.userId)));

          const connResourceIds = connectedRows.filter((r) => r.noteType === 'resource').map((r) => r.id);
          let connResourceMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null }> = {};
          if (connResourceIds.length > 0) {
            try {
              const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
                .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, connResourceIds));
              connResourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
            } catch { connResourceMap = {}; }
          }

          const rowById = Object.fromEntries(connectedRows.map((r) => [r.id, r]));
          const toRef = (id: string): any | null => {
            const r = rowById[id];
            if (!r) return null;
            const rm = r.noteType === 'resource' ? connResourceMap[r.id] : null;
            return { ...r, noteType: r.noteType || 'default', resourceTitle: rm?.sourceTitle ?? null, resourceDescription: rm?.sourceDescription ?? null, resourceImage: rm?.sourceImage ?? null };
          };

          linkedFromNotes = incomingEdges.map((e) => toRef(e.fromNoteId)).filter(Boolean);
          linkedToNotes = outgoingEdges.map((e) => toRef(e.toNoteId)).filter(Boolean);
        }
      } catch { linkedFromNotes = []; linkedToNotes = []; }
    }

    let studyThreads: any[] = [];
    const loadUnionedStudyThreads = readContext.isShared;

    if ((!isMemberView && note.userId === auth.userId) || loadUnionedStudyThreads || isMemberView) {
      try {
        const stRows = await db
          .select()
          .from(StudyThreadEntries)
          .where(
            loadUnionedStudyThreads
              ? and(
                  eq(StudyThreadEntries.parentNoteId, noteId),
                  eq(StudyThreadEntries.spaceId, readContext.space.id),
                  eq(StudyThreadEntries.isArchived, false),
                )
              : and(
                  eq(StudyThreadEntries.parentNoteId, noteId),
                  eq(StudyThreadEntries.userId, auth.userId),
                  contextIsMyHome
                    ? or(
                        eq(StudyThreadEntries.spaceId, readContext.space.id),
                        isNull(StudyThreadEntries.spaceId),
                      )
                    : eq(StudyThreadEntries.spaceId, readContext.space.id),
                ),
          )
          .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));
        const authorMap = loadUnionedStudyThreads
          ? await batchAuthorAttribution(stRows.map((row) => row.userId))
          : {};
        studyThreads = stRows.map((row) => {
          const mapped = mapStudyRow(row);
          if (!loadUnionedStudyThreads) return mapped;
          const author = authorMap[row.userId];
          return {
            ...mapped,
            authorDisplayName: author?.displayName ?? 'A Harvous User',
            authorColor: author?.userColor ?? 'blue',
            isOwnHighlight: row.userId === auth.userId,
          };
        });
      } catch {
        studyThreads = [];
      }
    }

    const activeAssociationRows = await db
      .select({
        spaceId: SpaceNotes.spaceId,
        spaceTitle: Spaces.title,
        spaceType: Spaces.type,
        isPinned: SpaceNotes.isPinned,
        primaryCollection: SpaceNotes.primaryCollection,
        secondaryCollections: SpaceNotes.secondaryCollections,
        collectionPinned: SpaceNotes.collectionPinned,
        collectionUserOverride: SpaceNotes.collectionUserOverride,
        order: SpaceNotes.order,
      })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .innerJoin(
        SpaceMemberships,
        and(
          eq(SpaceMemberships.spaceId, SpaceNotes.spaceId),
          eq(SpaceMemberships.userId, auth.userId),
        ),
      )
      .where(
        and(
          eq(SpaceNotes.noteId, noteId),
          isNull(SpaceNotes.removedAt),
          note.userId === auth.userId
            ? or(eq(Spaces.type, 'shared'), eq(Spaces.type, 'public'))
            : eq(SpaceNotes.spaceId, readContext.space.id),
        ),
      );
    const currentVersion = note.currentVersionId
      ? first(
          await db
            .select({
              id: NoteVersions.id,
              version: NoteVersions.version,
              source: NoteVersions.source,
              createdAt: NoteVersions.createdAt,
            })
            .from(NoteVersions)
            .where(
              and(
                eq(NoteVersions.id, note.currentVersionId),
                eq(NoteVersions.noteId, note.id),
              ),
            )
            .limit(1),
        )
      : null;
    const contextOrganization = readContext.association
      ? {
          isPinned: readContext.association.isPinned,
          primaryCollection: readContext.association.primaryCollection,
          secondaryCollections: parseNoteSecondaryCollections(readContext.association.secondaryCollections),
          collectionPinned: readContext.association.collectionPinned,
          order: readContext.association.order,
        }
      : null;
    const detailAuthor = readContext.isShared
      ? (await batchAuthorAttribution([note.userId]))[note.userId]
      : null;

    // Same helper the write path uses, so what the client renders as editable and
    // what the server will actually accept can never disagree.
    const detailEditAuth = await resolveNoteEditAuthorization(note.id, auth.userId);
    const detailCanEdit = detailEditAuth?.decision.allowed === true;
    let detailContributors: Array<{ userId: string; displayName: string; color: string }> = [];
    if (note.coEditEnabled) {
      const contributorIds = await resolveNoteContributorIds(note.id, note.userId);
      const contributorPeople = await batchAuthorAttribution(contributorIds);
      // Map over the ordered ids, not the lookup, so the author stays first.
      detailContributors = contributorIds.map((userId) => ({
        userId,
        displayName: contributorPeople[userId]?.displayName ?? 'Member',
        color: contributorPeople[userId]?.userColor ?? 'blue',
      }));
    }

    const detailNote = readContext.isShared
      ? serializeSharedCanonicalNote({
          id: note.id,
          simpleNoteId: note.simpleNoteId,
          title: note.title,
          content: note.content,
          noteType: note.noteType,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          lastVisited: note.lastVisited,
          contextSpaceId: readContext.space.id,
          contextThreadId: formattedThreads[0]?.id ?? null,
          organization: contextOrganization,
          authorUserId: note.userId,
          authorDisplayName: detailAuthor?.displayName ?? 'Member',
          authorColor: detailAuthor?.userColor ?? 'blue',
          isOwnNote: note.userId === auth.userId,
          coEditEnabled: note.coEditEnabled,
          canEdit: detailCanEdit,
          contributors: detailContributors,
          version,
          resourceTitle,
          resourceDescription,
          resourceImage,
        })
      : {
          ...noteJsonWithParsedSecondaries(note),
          simpleNoteId: note.simpleNoteId ?? null,
          contentEncrypted: note.contentEncrypted || false,
          noteType: note.noteType || 'default',
          addedBy: note.addedBy || 'user',
          isOwnNote: !isMemberView && note.userId === auth.userId,
          coEditEnabled: note.coEditEnabled,
          canEdit: detailCanEdit,
          contributors: detailContributors,
          version,
          resourceTitle,
          resourceDescription,
          resourceImage,
        };

    return c.json({
      success: true,
      note: detailNote,
      context: {
        spaceId: readContext.space.id,
        title: readContext.space.title,
        type: readContext.space.type,
        isShared: readContext.isShared,
        organization: contextOrganization,
      },
      activeSharedAssociations: readContext.isShared
        ? [{ spaceId: readContext.space.id, spaceTitle: readContext.space.title, spaceType: readContext.space.type }]
        : activeAssociationRows.map((row) => ({
            ...row,
            secondaryCollections: parseNoteSecondaryCollections(row.secondaryCollections),
          })),
      currentVersion: readContext.isShared
        ? currentVersion
          ? { version: currentVersion.version, createdAt: currentVersion.createdAt }
          : null
        : currentVersion,
      ...(readContext.isShared
        ? {}
        : { currentVersionId: currentVersion?.id ?? note.currentVersionId ?? null }),
      threads: formattedThreads,
      allUserThreads: selectableUserThreads.map(t => ({ id: t.id, title: t.title, color: t.color, isPublic: t.isPublic, createdAt: t.createdAt, updatedAt: t.updatedAt })),
      comments: comments.map(c => ({ id: c.id, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      tags: readContext.isShared
        ? []
        : dedupedNoteTags.map(t => ({ id: t.id, name: t.name, color: t.color, category: t.category, isSystem: t.isSystem, isAutoGenerated: t.isAutoGenerated, confidence: t.confidence })),
      referencingNotes,
      linkedFromNotes,
      linkedToNotes,
      studyThreads,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/details', action: 'get_note_details' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Author-only immutable note history ─────────────────────────────────────
route.get('/api/notes/:noteId/versions', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');
    const note = first(
      await db
        .select({ id: Notes.id, userId: Notes.userId, currentVersionId: Notes.currentVersionId })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1),
    );
    if (!note) return c.json({ error: 'Note not found', code: 'NOTE_VERSION_NOT_FOUND' }, 404);
    if (note.userId !== auth.userId) {
      return c.json(
        { error: 'Only the note author can access or change note history', code: 'NOT_NOTE_AUTHOR' },
        403,
      );
    }
    const versions = await db
      .select({
        id: NoteVersions.id,
        noteId: NoteVersions.noteId,
        version: NoteVersions.version,
        title: NoteVersions.title,
        contentEncrypted: NoteVersions.contentEncrypted,
        source: NoteVersions.source,
        createdAt: NoteVersions.createdAt,
      })
      .from(NoteVersions)
      .where(and(eq(NoteVersions.noteId, noteId), eq(NoteVersions.authorId, auth.userId)))
      .orderBy(desc(NoteVersions.version));
    return c.json({
      success: true,
      currentVersionId: note.currentVersionId,
      currentVersion: versions.find((row) => row.id === note.currentVersionId)?.version ?? null,
      versions,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to load note versions' }, 500);
  }
});

route.get('/api/notes/:noteId/versions/:versionId', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');
    const versionId = requireParam(c, 'versionId');
    const note = first(
      await db.select({ userId: Notes.userId }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
    );
    if (!note) return c.json({ error: 'Note not found', code: 'NOTE_VERSION_NOT_FOUND' }, 404);
    if (note.userId !== auth.userId) {
      return c.json(
        { error: 'Only the note author can access or change note history', code: 'NOT_NOTE_AUTHOR' },
        403,
      );
    }
    const version = first(
      await db
        .select()
        .from(NoteVersions)
        .where(
          and(
            eq(NoteVersions.id, versionId),
            eq(NoteVersions.noteId, noteId),
            eq(NoteVersions.authorId, auth.userId),
          ),
        )
        .limit(1),
    );
    if (!version) return c.json({ error: 'Note version not found', code: 'NOTE_VERSION_NOT_FOUND' }, 404);
    return c.json({ success: true, version });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to load note version' }, 500);
  }
});

route.post('/api/notes/:noteId/versions/:versionId/restore', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');
    const versionId = requireParam(c, 'versionId');
    const body = (await c.req.json().catch(() => ({}))) as { expectedVersion?: number };
    const restored = await db.transaction((tx) =>
      restoreCanonicalNoteVersionInTransaction(tx, {
        noteId,
        versionId,
        actorId: auth.userId,
        expectedVersion:
          body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
        now: nowISO(),
      }),
    );
    await broadcastCanonicalNoteInvalidation(auth.userId, noteId, {
      type: 'note:updated',
      id: noteId,
    });
    return c.json({
      success: true,
      note: noteJsonWithParsedSecondaries(restored.note),
      currentVersion: restored.currentVersion.version,
      currentVersionId: restored.currentVersion.id,
    });
  } catch (error) {
    const mapped = noteVersionErrorResponse(error);
    if (mapped) return c.json({ error: mapped.message, code: mapped.code, ...(mapped.details ?? {}) }, mapped.status);
    throw error;
  }
});

route.get('/api/notes/:noteId/activity', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');
    const note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    const contextRaw = c.req.query('contextSpaceId') ?? c.req.query('spaceId') ?? null;
    const contextSpaceId = contextRaw ? normalizeOwnedNoteSpaceId(contextRaw) : null;
    if (note.userId !== auth.userId && !contextSpaceId) {
      return c.json({ error: 'A shared contextSpaceId is required', code: 'CONTEXT_REQUIRED' }, 400);
    }
    if (contextSpaceId) {
      const readContext = await resolveNoteReadContext({
        note,
        viewerUserId: auth.userId,
        explicitSpaceId: contextSpaceId,
      });
      if (!readContext || !readContext.isShared) return c.json({ error: 'Note not found' }, 404);
    }

    const associations = await db
      .select({ spaceId: SpaceNotes.spaceId, removedAt: SpaceNotes.removedAt })
      .from(SpaceNotes)
      .where(
        contextSpaceId
          ? and(
              eq(SpaceNotes.noteId, noteId),
              eq(SpaceNotes.spaceId, contextSpaceId),
              isNull(SpaceNotes.removedAt),
            )
          : eq(SpaceNotes.noteId, noteId),
      );
    const spaceIds = associations.map((row) => row.spaceId);
    if (spaceIds.length === 0) return c.json({ success: true, groups: [] });
    const [spaces, entries] = await Promise.all([
      db
        .select({ id: Spaces.id, title: Spaces.title, type: Spaces.type, color: Spaces.color })
        .from(Spaces)
        .where(inArray(Spaces.id, spaceIds)),
      db
        .select()
        .from(StudyThreadEntries)
        .where(
          and(
            eq(StudyThreadEntries.parentNoteId, noteId),
            inArray(StudyThreadEntries.spaceId, spaceIds),
          ),
        )
        .orderBy(desc(StudyThreadEntries.updatedAt), desc(StudyThreadEntries.createdAt)),
    ]);
    const authors = await batchAuthorAttribution(entries.map((row) => row.userId));
    const groups = buildSharedNoteActivity({
      noteId,
      noteAuthorId: note.userId,
      contextSpaceId,
      associations,
      spaces,
      entries,
      authors,
    });
    return c.json({ success: true, contextSpaceId, groups });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[noteId]/activity',
      action: 'get_note_activity',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/update-content ─────────────────────────────────────
route.post('/api/notes/:id/update-content', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { content, contentEncrypted, expectedVersion } = await c.req.json();
    if (!content || typeof content !== 'string') return c.json({ success: false, error: 'Content is required' }, 400);

    const editAuth = await resolveNoteEditAuthorization(id, auth.userId);
    if (!editAuth) return c.json({ success: false, error: 'Note not found' }, 404);
    if (!editAuth.decision.allowed) {
      if (editAuth.decision.code === 'ONBOARDING') {
        return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
      }
      return c.json({ success: false, error: 'Note not found' }, 404);
    }
    const note = editAuth.note;
    const actorRole = editAuth.decision.role;

    const targetEncrypted =
      typeof contentEncrypted === 'boolean' ? contentEncrypted : note.contentEncrypted;
    let contentForStore = targetEncrypted
      ? content
      : canonicalizeNoteHtmlLineBreaks(content);
    if (!targetEncrypted) {
      contentForStore = transformCanonicalScriptureContent({
        noteId: id,
        content: contentForStore,
        translation: 'NET',
        pillsOnly: note.noteType === 'default',
      }).updatedContent;
    }
    const updateData: any = { content: contentForStore, updatedAt: nowISO() };
    if (typeof contentEncrypted === 'boolean') {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) { updateData.isPublic = false; updateData.shareToken = null; updateData.shareTokenCreatedAt = null; updateData.coEditEnabled = false; updateData.coEditEnabledAt = null; }
    }

    const versioned = await db.transaction((tx) =>
      updateCanonicalNoteInTransaction(tx, {
        noteId: id,
        actorId: auth.userId,
        expectedVersion: expectedVersion === undefined ? undefined : Number(expectedVersion),
        patch: updateData,
        nextContent: (lockedNote) => ({
          title: lockedNote.title,
          content:
            resolveLockedEncryptionState(contentEncrypted, lockedNote.contentEncrypted)
              ? content
              : contentForStore,
          contentEncrypted: resolveLockedEncryptionState(
            contentEncrypted,
            lockedNote.contentEncrypted,
          ),
        }),
        source: 'save',
        now: nowISO(),
        actorRole,
      }),
    );
    if (!versioned.note.contentEncrypted) {
      try {
        // Owner-scoped (see PUT /api/notes/update) so shared-space edits don't 500.
        await processScriptureReferences(id, versioned.note.userId, undefined, versioned.note.content, 'NET', {
          persistParentContent: false,
        });
      } catch (err: any) {
        console.error('[api/notes/update-content] Scripture processing failed:', err?.message ?? err);
      }
    }
    await broadcastCanonicalNoteInvalidation(auth.userId, id, { type: 'note:updated', id });
    return c.json({
      success: true,
      message: 'Note content updated',
      note: noteJsonWithParsedSecondaries(versioned.note),
      currentVersion: versioned.currentVersion.version,
      currentVersionId: versioned.currentVersion.id,
    });
  } catch (error) {
    console.error('Error updating note content:', error);
    const mapped = noteVersionErrorResponse(error);
    if (mapped) {
      return c.json(
        { success: false, error: mapped.message, code: mapped.code, ...(mapped.details ?? {}) },
        mapped.status,
      );
    }
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/:noteId/inline-image ───────────────────────────────────
route.post('/api/notes/:noteId/inline-image', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');

    const note = first(
      await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);
    if (isOnboardingSystemNote(note)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'Image file is required' }, 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';
    const { uploadInlineNoteImage } = await import('../utils/note-inline-image-upload');
    const result = await uploadInlineNoteImage({
      userId: auth.userId,
      noteId,
      bytes,
      mimeType,
    });

    if (!result.ok) {
      return c.json({ success: false, error: result.error }, result.status);
    }

    return c.json({ success: true, url: result.url });
  } catch (error) {
    console.error('Error uploading inline note image:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/:id/add-thread ─────────────────────────────────────────
route.post('/api/notes/:id/add-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);
    if (threadId.startsWith('thread_onboarding_')) return c.json({ success: false, error: "This thread doesn't take new notes." }, 400);

    try {
      const result = await db.transaction(async (tx) => {
        const policy = await authorizeNoteThreadMutationInTransaction(tx, {
          actorId: auth.userId,
          noteId: id,
          threadId,
          requireCurrent: true,
        });
        const existingRelation = first(
          await tx
            .select()
            .from(NoteThreads)
            .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
            .for('update')
            .limit(1),
        );
        if (existingRelation) return { ...policy, alreadyInThread: true };
        const existingThreadRelations = await tx
          .select()
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, id))
          .for('update');
        await tx.insert(NoteThreads).values({
          id: generateTimestampId('notethread'),
          noteId: id,
          threadId,
          createdAt: nowISO(),
        });
        if (
          !policy.shared &&
          (existingThreadRelations.length === 0 || policy.note.threadId === 'thread_unorganized') &&
          threadId !== 'thread_unorganized'
        ) {
          await tx.update(Notes).set({ threadId }).where(eq(Notes.id, id));
        }
        await tx.update(Threads).set({ updatedAt: nowISO() }).where(eq(Threads.id, threadId));
        return { ...policy, alreadyInThread: false };
      });
      if (result.alreadyInThread) return c.json({ success: true, alreadyInThread: true });
      if (!result.shared) await moveScriptureNotesToThread(id, threadId, auth.userId);
    } catch (insertError) {
      if (insertError instanceof SharedSpaceLifecycleError) {
        return c.json(
          { success: false, error: insertError.message, code: insertError.code },
          insertError.status,
        );
      }
      const standardError = handleAPIError(insertError, { endpoint: '/api/notes/[id]/add-thread', action: 'add_note_to_thread' });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id });
    return c.json({ success: true, message: 'Note added to thread', note: { id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/add-thread', action: 'add_note_to_thread' });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/remove-thread ──────────────────────────────────────
route.post('/api/notes/:id/remove-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);

    // Find note owned by current user, or fall back to Harvous admin notes in user-owned threads
    let note = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).limit(1));
    let isAdminNote = false;

    if (!note) {
      let systemUserId: string | null = null;
      try { systemUserId = getHarvousSystemUserId(); } catch { /* env not set */ }
      if (systemUserId) {
        const adminNote = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, systemUserId))).limit(1));
        if (adminNote) {
          // Allow removal only when the thread being removed is owned by this user
          const userThread = first(await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
          if (userThread) { note = adminNote; isAdminNote = true; }
        }
      }
    }

    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const targetThread = first(
      await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1),
    );
    if (!targetThread) return c.json({ success: false, error: 'Thread not found' }, 404);
    if (targetThread.spaceId) {
      const targetSpace = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, targetThread.spaceId)).limit(1),
      );
      if (targetSpace && targetSpace.type !== 'personal') {
        try {
          await db.transaction(async (tx) => {
            await authorizeNoteThreadMutationInTransaction(tx, {
              actorId: auth.userId,
              noteId: id,
              threadId,
              requireCurrent: true,
            });
            const relation = first(
              await tx
                .select()
                .from(NoteThreads)
                .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
                .for('update')
                .limit(1),
            );
            if (!relation) {
              throw new SharedSpaceLifecycleError(
                'Note is not in this Thread',
                'NOTE_THREAD_NOT_FOUND',
                404,
              );
            }
            await tx.delete(NoteThreads).where(eq(NoteThreads.id, relation.id));
          });
        } catch (error) {
          if (error instanceof SharedSpaceLifecycleError) {
            return c.json(
              { success: false, error: error.message, code: error.code },
              error.status,
            );
          }
          throw error;
        }
        broadcastInvalidation(auth.userId, { type: 'note:updated', id });
        return c.json({ success: true, message: 'Note removed from thread', note: { id, threadId } });
      }
    }

    const existingRelation = first(await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).limit(1));
    if (!existingRelation) return c.json({ success: false, error: 'Note is not in this thread' }, 400);

    try {
      await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));

      if (isAdminNote) {
        // Admin note: check whether the user still has any of their own threads for this note
        const remainingUserThreads = await db
          .select({ threadId: NoteThreads.threadId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, id), eq(Threads.userId, auth.userId)));
        if (remainingUserThreads.length === 0) {
          // Move to unorganized via a junction row so details API returns it correctly
          await ensureUnorganizedThread(auth.userId);
          await db.insert(NoteThreads)
            .values({ id: generateTimestampId('notethread'), noteId: id, threadId: 'thread_unorganized', createdAt: nowISO() })
            .onConflictDoNothing();
        }
        // Do NOT update Notes.threadId — that's the system note's primary home
      } else {
        const remainingThreads = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id));
        if (remainingThreads.length === 0) {
          await ensureUnorganizedThread(auth.userId);
          await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, id));
        } else if (note.threadId === threadId) {
          // If removed thread was the primary, update to next remaining thread
          await db.update(Notes).set({ threadId: remainingThreads[0].threadId }).where(eq(Notes.id, id));
        }
        removeScriptureNotesFromThread(id, threadId, auth.userId).catch(() => {});
      }
    } catch (deleteError) {
      const standardError = handleAPIError(deleteError, { endpoint: '/api/notes/[id]/remove-thread', action: 'remove_note_from_thread' });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id });
    return c.json({ success: true, message: 'Note removed from thread', note: { id: note.id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/remove-thread', action: 'remove_note_from_thread' });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/process-scripture-references ───────────────────────
route.post('/api/notes/:id/process-scripture-references', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'id');

    let threadId: string | undefined;
    let contentOverride: string | undefined;
    let translation: string | undefined;
    let bodyContextSpaceId: string | null = null;
    try {
      const body = await c.req.json();
      threadId = body?.threadId;
      contentOverride = body?.contentOverride;
      translation = body?.translation;
      bodyContextSpaceId =
        typeof body?.contextSpaceId === 'string'
          ? normalizeOwnedNoteSpaceId(body.contextSpaceId)
          : null;
    } catch {
      // Empty body is valid.
    }
    const noteRow = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!noteRow) return c.json({ error: 'Note not found' }, 404);

    const queryContext = c.req.query('contextSpaceId') ?? c.req.query('spaceId') ?? null;
    const explicitContextSpaceId =
      bodyContextSpaceId ?? (queryContext ? normalizeOwnedNoteSpaceId(queryContext) : null);
    const readContext = await resolveNoteReadContext({
      note: noteRow,
      viewerUserId: auth.userId,
      explicitSpaceId: explicitContextSpaceId,
    });
    if (!readContext) return c.json({ error: 'Note not found' }, 404);
    if (readContext.isShared && threadId) {
      const contextThread = first(
        await db
          .select({ id: Threads.id })
          .from(Threads)
          .where(and(eq(Threads.id, threadId), eq(Threads.spaceId, readContext.space.id)))
          .limit(1),
      );
      if (!contextThread) return c.json({ error: 'Thread not found in context' }, 404);
    }
    // Always run as the note owner: lookups, scripture child notes, and metadata are keyed to Notes.userId.
    // Space members may trigger processing for admin/system-owned shared notes; content updates apply for everyone.
    // This endpoint is the load/backfill path (opening a note materializes legacy pills) — skip the parent
    // auto-tag so merely viewing a note never appends new tags, and skip the updatedAt bump so merely
    // viewing a note never changes its "last updated" sort order. Genuine writes (create/update/sync/import)
    // call processScriptureReferences directly and keep both tagging and the updatedAt bump.
    const sourceContent =
      noteRow.userId === auth.userId && typeof contentOverride === 'string'
        ? contentOverride
        : noteRow.content;
    const transformed = noteRow.contentEncrypted
      ? sourceContent
      : transformCanonicalScriptureContent({
          noteId,
          content: sourceContent,
          translation: translation || 'NET',
          pillsOnly: noteRow.noteType === 'default',
        }).updatedContent;
    const didUpdateCanonical =
      noteRow.userId === auth.userId && transformed !== noteRow.content;
    if (didUpdateCanonical) {
      await db.transaction((tx) =>
        updateCanonicalNoteInTransaction(tx, {
          noteId,
          actorId: auth.userId,
          patch: {},
          nextContent: (lockedNote) => ({
            title: lockedNote.title,
            content: transformed,
            contentEncrypted: lockedNote.contentEncrypted,
          }),
          source: 'scripture-processing',
          now: nowISO(),
        }),
      );
    }
    const result = await processScriptureReferences(
      noteId,
      noteRow.userId,
      threadId,
      transformed,
      translation || 'NET',
      { skipParentAutoTag: true, skipUpdatedAt: true, persistParentContent: false },
    );
    if (didUpdateCanonical) {
      await broadcastCanonicalNoteInvalidation(noteRow.userId, noteId, {
        type: 'note:updated',
        id: noteId,
      });
    }
    const finalNote = first(
      await db
        .select({ currentVersionId: Notes.currentVersionId })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1),
    );
    const finalVersion = finalNote?.currentVersionId
      ? first(
          await db
            .select({ version: NoteVersions.version })
            .from(NoteVersions)
            .where(
              and(
                eq(NoteVersions.id, finalNote.currentVersionId),
                eq(NoteVersions.noteId, noteId),
              ),
            )
            .limit(1),
        )
      : null;
    return c.json({
      ...result,
      updatedContent: transformed,
      currentVersion: finalVersion?.version ?? null,
      ...(readContext.isShared ? {} : { currentVersionId: finalNote?.currentVersionId ?? null }),
    });
  } catch (error: any) {
    if (error instanceof ScriptureNoteNotFoundError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    console.error('Error processing scripture references:', error);
    return c.json({ error: error.message || 'Error processing scripture references' }, 500);
  }
});

// ─── POST /api/notes/:noteId/visit ──────────────────────────────────────────
route.post('/api/notes/:noteId/visit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let noteId = requireParam(c, 'noteId');
    if (noteId.startsWith('note/')) noteId = 'note_' + noteId.slice(5);

    const note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    const explicitContextRaw = c.req.query('contextSpaceId') ?? c.req.query('spaceId') ?? null;
    const context = await resolveNoteReadContext({
      note,
      viewerUserId: auth.userId,
      explicitSpaceId: explicitContextRaw ? normalizeOwnedNoteSpaceId(explicitContextRaw) : null,
    });
    if (!context) return c.json({ error: 'Note not found' }, 404);
    if (!context.isShared) {
      await db.update(Notes).set({ lastVisited: nowISO() }).where(eq(Notes.id, noteId));
    }
    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[visit] Error updating note lastVisited:', error);
    return c.json({ error: error.message || 'Failed to update visit' }, 500);
  }
});

// ─── GET /api/notes/:noteId/share ───────────────────────────────────────────
route.get('/api/notes/:noteId/share', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'noteId');

    const note = first(
      await db
        .select({
          id: Notes.id,
          threadId: Notes.threadId,
          addedBy: Notes.addedBy,
          isPublic: Notes.isPublic,
          shareToken: Notes.shareToken,
          shareTokenCreatedAt: Notes.shareTokenCreatedAt,
          userId: Notes.userId,
          noteType: Notes.noteType,
          contentEncrypted: Notes.contentEncrypted,
        })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1)
    );
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) return c.json({ error: 'You do not have permission to access this note' }, 403);
    if (isOnboardingSystemNote(note)) return c.json({ error: 'This note cannot be shared.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);

    let effectiveShareToken = note.shareToken;
    let effectiveShareTokenCreatedAt = note.shareTokenCreatedAt;
    const isScriptureNote = note.noteType === 'scripture';
    const needsToken = isScriptureNote && !note.shareToken && !note.contentEncrypted;

    if (needsToken) {
      const activeAssociation = first(
        await db
          .select({ id: SpaceNotes.id })
          .from(SpaceNotes)
          .where(and(eq(SpaceNotes.noteId, noteId), isNull(SpaceNotes.removedAt)))
          .limit(1),
      );
      if (activeAssociation) {
        return c.json(
          {
            error: 'This note is active in a shared space. Acknowledge that a public link is separate before enabling it.',
            code: 'SHARED_NOTE_PUBLIC_ACK_REQUIRED',
          },
          409,
        );
      }
      const now = nowISO();
      effectiveShareToken = generateShareToken();
      effectiveShareTokenCreatedAt = now;
      await db.update(Notes).set({ isPublic: true, shareToken: effectiveShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/shared/note/${effectiveShareToken}` : null;

    return c.json({
      isPublic: needsToken ? true : note.isPublic,
      shareToken: effectiveShareToken,
      shareUrl,
      shareTokenCreatedAt: effectiveShareTokenCreatedAt,
      noteType: note.noteType || 'default',
      contentEncrypted: note.contentEncrypted || false,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[noteId]/share', action: 'get_share_status', noteId: c.req.param('noteId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:noteId/share ──────────────────────────────────────────
route.post('/api/notes/:noteId/share', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'noteId');

    const { action, acknowledgeSharedContext } = await c.req.json();
    if (!action || !['enable', 'disable', 'refresh'].includes(action)) return c.json({ error: 'Invalid action' }, 400);
    const result = await db.transaction(async (tx) => {
      const note = first(
        await tx.select().from(Notes).where(eq(Notes.id, noteId)).for('update').limit(1),
      );
      if (!note) return { error: 'Note not found', code: 'NOT_FOUND', status: 404 as const };
      if (note.userId !== auth.userId) {
        return { error: 'You do not have permission', code: 'FORBIDDEN', status: 403 as const };
      }
      if (isOnboardingSystemNote(note)) {
        return {
          error: 'This note cannot be shared.',
          code: 'ONBOARDING_NOTE_READ_ONLY',
          status: 400 as const,
        };
      }
      if (note.contentEncrypted && (action === 'enable' || action === 'refresh')) {
        return {
          error: 'Remove the lock first to share it.',
          code: 'ENCRYPTED_NOTE_CANNOT_SHARE',
          status: 400 as const,
        };
      }

      const activeAssociation = first(
        await tx
          .select({ id: SpaceNotes.id })
          .from(SpaceNotes)
          .where(and(eq(SpaceNotes.noteId, noteId), isNull(SpaceNotes.removedAt)))
          .for('update')
          .limit(1),
      );
      const now = nowISO();
      let newShareToken = note.shareToken;
      let isPublic = note.isPublic;

      if (action === 'enable') {
        if (note.isPublic && note.shareToken) {
          return {
            isPublic: true,
            shareToken: note.shareToken,
            shareTokenCreatedAt: note.shareTokenCreatedAt,
          };
        }
        if (activeAssociation && acknowledgeSharedContext !== true) {
          return {
            error: 'This note is active in a shared space. Acknowledge that the public link is separate before enabling it.',
            code: 'SHARED_NOTE_PUBLIC_ACK_REQUIRED',
            status: 409 as const,
          };
        }
        newShareToken = generateShareToken();
        isPublic = true;
        await tx
          .update(Notes)
          .set({ isPublic: true, shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      } else if (action === 'disable') {
        newShareToken = null;
        isPublic = false;
        await tx
          .update(Notes)
          .set({ isPublic: false, shareToken: null, shareTokenCreatedAt: null, updatedAt: now })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      } else {
        if (!note.isPublic || !note.shareToken) {
          return {
            error: 'Cannot refresh share link for a private note',
            code: 'NOT_PUBLIC',
            status: 400 as const,
          };
        }
        newShareToken = generateShareToken();
        isPublic = true;
        await tx
          .update(Notes)
          .set({ shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      }
      return {
        isPublic,
        shareToken: newShareToken,
        shareTokenCreatedAt: action === 'disable' ? null : now,
      };
    });
    if ('error' in result) return c.json({ error: result.error, code: result.code }, result.status);

    if ((action === 'enable' || action === 'refresh') && result.shareToken) {
      queueAudiencefulProductFlagsForUser(auth.userId, { has_shared: true });
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = result.shareToken ? `${origin}/shared/note/${result.shareToken}` : null;

    return c.json({ success: true, ...result, shareUrl });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[noteId]/share', action: 'update_share_status', noteId: c.req.param('noteId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
