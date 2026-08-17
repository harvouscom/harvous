/**
 * User + Profile routes — Hono port of src/pages/api/user/*.ts and src/pages/api/profile/*.ts
 *
 * Endpoints:
 *   GET  /api/user/achievements
 *   POST /api/user/check-monthly-attendance
 *   POST /api/user/migrate-to-prototype
 *   DELETE /api/user/clear-data
 *   DELETE /api/user/delete-account
 *   GET  /api/user/export
 *   POST /api/user/session
 *   GET  /api/user/churches/hmc/search
 *   POST /api/user/update-church
 *   POST /api/user/update-credentials
 *   POST /api/user/update-profile
 *   GET  /api/user/xp
 *   GET  /api/user/get-profile
 *   GET  /api/user/church-staff-status
 *   POST /api/user/update-shared-space-switcher-order
 *   POST /api/user/migrate-to-prototype
 *   GET  /api/user/migrate-to-prototype/status
 *   GET  /api/user/locked-notes
 *   POST /api/user/verify-lock-pin
 *   POST /api/user/set-lock-pin
 *   GET  /api/user/can-create-space
 *   GET  /api/user/can-join-space
 *   GET  /api/user/limits
 *   POST /api/user/import
 *   POST /api/user/audienceful-milestones
 *   GET  /api/profile/my-sharing
 *   GET  /api/profile/my-shared-spaces
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db, first, Notes, Threads, Spaces, Tags, NoteThreads, UserMetadata,
  UserXP, Comments, Members, SpaceMemberships, SpaceInvites, NoteScriptureReferences, ResourceMetadata,
  NoteConnections, ImportSessionItems,
  eq, and, ne, or, desc, asc, isNotNull, isNull, sql, inArray,
} from '../db';
import { nowISO } from '../db/dates';
import {
  HmcPartnerError,
  hmcDenormFields,
  hmcFillMissingCity,
  hmcGetChurchByIdForDenorm,
  hmcSearchChurches,
  hmcSubmitUnlistedChurch,
} from '../utils/hmc-partner';
import {
  getHmcCountry,
  hmcCountryForRegion,
  matchesHmcDirectoryCountry,
  normalizeHmcRegionCode,
} from '@/utils/hmc-directory';
import {
  isUnitedStatesCountryLabel,
  isUsChurchLocation,
  normalizeUsStateCode,
} from '@/utils/us-states';

// Server-ported utilities
import { getCachedUserData, invalidateUserCache } from '../utils/user-cache';
import {
  getSeasonalXP, getLifetimeXP, checkLifetimeMilestones, getAllSeasonalXP,
  awardMonthlyAttendanceXP, awardSessionXP, awardChurchAddedXP,
  calculateTotalXP, getXPBreakdown, backfillUserXP,
} from '../utils/xp-system';
import { calculateSessionXP, type SessionData } from '../utils/session-tracker';
import { canCreateSharedSpace, getUserLimitsInfo, getSpaceMemberCount } from '../utils/tier-limits';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { connectionFieldsForHmcChurchId } from '../utils/church-connection';
import { isChurchStaffForOrg } from '../utils/church-staff';
import { fetchClerkOrgMemberships } from '../utils/clerk-org';
import {
  capabilitiesForChurchRole,
  NO_CHURCH_CAPABILITIES,
} from '../utils/church-role-capabilities';

// Pure @/utils (no astro:db)
import { getSeasonDisplayName, getCurrentSeason } from '@/utils/season-helpers';
import { handleAPIError } from '@/utils/error-handling';
import {
  rateLimit,
  tryConsumeNoteCreates,
  tryConsumeImportNoteCreates,
  getClientIP,
} from '@/utils/rate-limit';
import { queueAudiencefulProductFlagsForUser } from '../utils/audienceful-product-flags';
import type { AudiencefulProductFlags } from '@/utils/audienceful';
import { validateName, validateColor } from '@/utils/validation';
import {
  serializeLastReadPosition,
  validateLastReadPositionInput,
} from '@/utils/last-read-position';
import { hashPinNew, validatePinFormat, verifyPin } from '@/utils/lock-pin-server';
import { generateUserExport, generateUserBackupZip, type ExportFormat } from '../utils/export-user-data';
import {
  parseImportFiles,
  parseImportEntry,
  importFormatForFileName,
  type ImportFormat,
  type ParsedImportRow,
} from '../utils/parse-import-files';
import {
  capitalizeForStorage,
  commitImportItem,
  loadUserDedupeIndex,
  resolveImportNoteFields,
} from '../utils/import-commit';
import {
  IMPORT_LIMITS,
  abandonImportSession,
  buildImportItemSummary,
  buildImportSessionSummary,
  bumpImportSessionCounters,
  countImportSessionFiles,
  countImportSessionItems,
  createImportSession,
  finalizeImportSession,
  getImportSession,
  getImportSessionItems,
  getOpenImportSession,
  importItemPayloadToRow,
  insertImportItems,
  isSupportedImportExtension,
  setImportItemsIncluded,
  storeImportManifest,
  undoImportSession,
} from '../utils/import-session';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { broadcastInvalidation } from '../utils/realtime';
import { deleteNotesCascadeForUser } from '../utils/delete-note-cascade';
import {
  runPrototypeUserMigration,
  userNeedsCollectionBackfill,
} from '../utils/prototype-user-migration';
import {
  isNoteConnectionsTableMissing,
  isPrototypeFolderStatsColumnMissing,
} from '../utils/pg-undefined-relation';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { enrichImportedNote } from '../utils/import-enrichment';

const app = new Hono();

// ─── GET /api/user/achievements ──────────────────────────────────────────────

app.get('/api/user/achievements', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const [seasonalXP, lifetimeXP, milestoneIds, allSeasons] = await Promise.all([
      getSeasonalXP(auth.userId),
      getLifetimeXP(auth.userId),
      checkLifetimeMilestones(auth.userId),
      getAllSeasonalXP(auth.userId)
    ]);

    const currentSeason = getCurrentSeason();
    const pastSeasons = allSeasons.filter(s => s.season !== currentSeason);

    const milestoneDefinitions = [
      { id: 'first_hundred', name: 'First Steps', description: 'Earn 100 lifetime XP', xp: 100 },
      { id: 'five_hundred', name: 'Growing Strong', description: 'Earn 500 lifetime XP', xp: 500 },
      { id: 'thousand', name: 'Thousand Club', description: 'Earn 1,000 lifetime XP', xp: 1000 },
      { id: 'five_thousand', name: 'Five Thousand Club', description: 'Earn 5,000 lifetime XP', xp: 5000 },
      { id: 'ten_thousand', name: 'Ten Thousand Club', description: 'Earn 10,000 lifetime XP', xp: 10000 },
      { id: 'twenty_five_thousand', name: 'Twenty-Five Thousand Club', description: 'Earn 25,000 lifetime XP', xp: 25000 },
      { id: 'fifty_thousand', name: 'Fifty Thousand Club', description: 'Earn 50,000 lifetime XP', xp: 50000 },
    ];

    const milestones = milestoneDefinitions.map(m => ({ ...m, achieved: milestoneIds.includes(m.id) }));

    return c.json({ seasonalXP, lifetimeXP, seasonName: getSeasonDisplayName(), milestones, allSeasons: pastSeasons });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/achievements', action: 'get_achievements' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/check-monthly-attendance ─────────────────────────────────

app.post('/api/user/check-monthly-attendance', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const awarded = await awardMonthlyAttendanceXP(auth.userId);
    return c.json({ success: true, awardedXP: awarded, xpAmount: awarded ? 25 : 0 });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/check-monthly-attendance', action: 'check_monthly_attendance' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/migrate-to-prototype ─────────────────────────────────────
// Idempotent Classic → 2.0 backfill for the signed-in user:
// thread titles → folder labels; linkedFromNoteId → NoteConnections edges.

app.post('/api/user/migrate-to-prototype', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const result = await runPrototypeUserMigration(auth.userId);
    const needsCollectionBackfill = await userNeedsCollectionBackfill(auth.userId);
    const showFoldersBanner = result.collectionsUpdated > 0;
    return c.json({
      success: true,
      ...result,
      needsCollectionBackfill,
      showFoldersBanner,
    });
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) {
      return c.json(
        {
          error: 'NoteConnections table missing. Run `npm run db:push` on the target database.',
          code: 'SCHEMA_NOT_READY',
        },
        503,
      );
    }
    const e = handleAPIError(error, { endpoint: '/api/user/migrate-to-prototype', action: 'migrate_to_prototype' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/migrate-to-prototype/status ───────────────────────────────
// Lightweight check for whether folder backfill may still be needed (banner hint).

app.get('/api/user/migrate-to-prototype/status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const needsCollectionBackfill = await userNeedsCollectionBackfill(auth.userId);
    return c.json({ success: true, needsCollectionBackfill });
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isPrototypeFolderStatsColumnMissing(error)) {
      return c.json(
        {
          error: 'Prototype migration schema not ready. Run `npm run db:push` on the target database.',
          code: 'SCHEMA_NOT_READY',
          success: false,
          needsCollectionBackfill: false,
        },
        503,
      );
    }
    const e = handleAPIError(error, { endpoint: '/api/user/migrate-to-prototype/status', action: 'migrate_to_prototype_status' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── DELETE /api/user/clear-data ─────────────────────────────────────────────

app.delete('/api/user/clear-data', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, auth.userId));
    const noteIds = userNotes.map(n => n.id);
    await deleteNotesCascadeForUser(auth.userId, noteIds);

    await db.delete(Threads).where(eq(Threads.userId, auth.userId));

    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, auth.userId));
    for (const space of userSpaces) {
      await db.delete(SpaceMemberships).where(eq(SpaceMemberships.spaceId, space.id));
      await db.delete(SpaceInvites).where(eq(SpaceInvites.spaceId, space.id));
      // Hygiene deletes on the frozen v1 tables (kept until they are dropped)
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
    // Own membership rows in spaces owned by other people.
    await db.delete(SpaceMemberships).where(eq(SpaceMemberships.userId, auth.userId));
    await db.delete(Members).where(eq(Members.userId, auth.userId));
    await db.delete(Spaces).where(eq(Spaces.userId, auth.userId));
    await db.delete(Tags).where(eq(Tags.userId, auth.userId));

    return c.json({ success: true, message: 'All data cleared' });
  } catch (error: any) {
    console.error('Clear data error:', error);
    return c.json({ error: error.message || 'Failed to clear data' }, 500);
  }
});

// ─── DELETE /api/user/delete-account ─────────────────────────────────────────

app.delete('/api/user/delete-account', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    // Delete data (same as clear-data)
    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, auth.userId));
    const noteIds = userNotes.map(n => n.id);
    await deleteNotesCascadeForUser(auth.userId, noteIds);
    await db.delete(Threads).where(eq(Threads.userId, auth.userId));

    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, auth.userId));
    for (const space of userSpaces) {
      await db.delete(SpaceMemberships).where(eq(SpaceMemberships.spaceId, space.id));
      await db.delete(SpaceInvites).where(eq(SpaceInvites.spaceId, space.id));
      // Hygiene deletes on the frozen v1 tables (kept until they are dropped)
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
    // Own membership rows in spaces owned by other people.
    await db.delete(SpaceMemberships).where(eq(SpaceMemberships.userId, auth.userId));
    await db.delete(Members).where(eq(Members.userId, auth.userId));
    await db.delete(Spaces).where(eq(Spaces.userId, auth.userId));
    await db.delete(Tags).where(eq(Tags.userId, auth.userId));
    await db.delete(UserXP).where(eq(UserXP.userId, auth.userId));
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, auth.userId));

    // Delete from Clerk
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const resp = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
        });
        if (!resp.ok) {
          console.error('Clerk API error during user deletion:', resp.status);
        }
      }
    } catch (clerkError: any) {
      console.error('Error deleting Clerk user:', clerkError.message);
    }

    return c.json({ success: true, message: 'Account and all data deleted' });
  } catch (error: any) {
    console.error('Delete account error:', error);
    return c.json({ error: error.message || 'Failed to delete account' }, 500);
  }
});

// ─── GET /api/user/export ────────────────────────────────────────────────────

app.get('/api/user/export', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formatParam = (c.req.query('format') || 'markdown') as string;
    const timestamp = new Date().toISOString().split('T')[0];

    if (formatParam === 'backup') {
      const { content, fileExtension } = await generateUserBackupZip(auth.userId);
      const filename = `harvous-backup-${timestamp}.${fileExtension}`;
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"` },
      });
    }

    const format: ExportFormat =
      formatParam === 'csv-threads' ? 'csv-threads' : formatParam === 'text' ? 'text' : 'markdown';

    const { content, fileExtension } = await generateUserExport(auth.userId, format);

    const contentType =
      fileExtension === 'csv' ? 'text/csv' : fileExtension === 'md' ? 'text/markdown' : 'text/plain';
    const filename = `harvous-export-${timestamp}.${fileExtension}`;
    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return c.json({ error: error.message || 'Failed to export data' }, 500);
  }
});

// ─── POST /api/user/session ──────────────────────────────────────────────────

app.post('/api/user/session', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { activities, startTime, lastActivityTime } = body;

    if (!activities || !Array.isArray(activities)) {
      return c.json({ error: 'Invalid session data' }, 400);
    }

    const sessionData: SessionData = {
      userId: auth.userId,
      startTime: new Date(startTime),
      activities: activities.map((a: any) => ({
        actionType: a.actionType, timestamp: new Date(a.timestamp), relatedId: a.relatedId || undefined
      })),
      lastActivityTime: new Date(lastActivityTime)
    };

    const sessionXP = calculateSessionXP(sessionData);
    if (sessionXP === 0) {
      return c.json({ success: true, awardedXP: 0, message: 'Session did not meet minimum requirements' });
    }

    const awarded = await awardSessionXP(auth.userId, sessionXP);
    return c.json({ success: true, awardedXP: awarded ? sessionXP : 0, message: awarded ? 'Session XP awarded' : 'Daily session cap reached' });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/session', action: 'end_session' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/churches/hmc/search ───────────────────────────────────────

app.get('/api/user/churches/hmc/search', requireAuth, async (c) => {
  try {
    const q = String(c.req.query('q') ?? '');
    const state = String(c.req.query('state') ?? '');
    const limitRaw = Number(c.req.query('limit') ?? 20);
    const results = await hmcSearchChurches({
      q,
      state,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
    });
    return c.json({ success: true, results, query: q.trim() });
  } catch (error) {
    if (error instanceof HmcPartnerError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 429 | 502 | 503);
    }
    const e = handleAPIError(error, { endpoint: '/api/user/churches/hmc/search', action: 'hmc_search' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/update-church ────────────────────────────────────────────

app.post('/api/user/update-church', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const hmcChurchIdRaw =
      body.hmcChurchId === null
        ? null
        : typeof body.hmcChurchId === 'string'
          ? body.hmcChurchId.trim() || null
          : undefined;

    const hasManualKeys =
      'churchName' in body ||
      'churchCity' in body ||
      'churchState' in body ||
      'churchCountry' in body;

    const intentRaw = typeof body.intent === 'string' ? body.intent.trim() : '';
    // Legacy aliases: outside_us → outside_directory, unlisted_us → unlisted.
    const intent =
      intentRaw === 'outside_directory' || intentRaw === 'outside_us'
        ? 'outside_directory'
        : intentRaw === 'unlisted' || intentRaw === 'unlisted_us'
          ? 'unlisted'
          : undefined;
    if (intentRaw && !intent) {
      return c.json({ error: 'Invalid church intent', code: 'CHURCH_INTENT_INVALID' }, 400);
    }

    const readOptionalString = (value: unknown): string | null => {
      if (typeof value === 'string') return value.trim() || null;
      if (value === null) return null;
      return null;
    };

    let normalizedHmcChurchId: string | null | undefined = hmcChurchIdRaw;
    let normalizedChurchName: string | null | undefined;
    let normalizedChurchCity: string | null | undefined;
    let normalizedChurchState: string | null | undefined;
    let normalizedChurchCountry: string | null | undefined;
    let applyChurchUpdate = false;

    if (hmcChurchIdRaw) {
      if (intent) {
        return c.json(
          { error: 'Church intent cannot be combined with a directory pick', code: 'CHURCH_INTENT_MISMATCH' },
          400,
        );
      }
      const hmc = await hmcGetChurchByIdForDenorm(hmcChurchIdRaw);
      if (!hmc) {
        return c.json({ error: 'Here’s My Church record not found', code: 'HMC_CHURCH_NOT_FOUND' }, 404);
      }
      const denorm = hmcDenormFields(hmc);
      normalizedHmcChurchId = hmc.id;
      normalizedChurchName = denorm.name;
      normalizedChurchCity = denorm.city;
      normalizedChurchState = denorm.state;
      normalizedChurchCountry = denorm.country;
      applyChurchUpdate = true;
    } else if (hmcChurchIdRaw === null && !hasManualKeys) {
      if (intent) {
        return c.json(
          { error: 'Church intent cannot be combined with clear', code: 'CHURCH_INTENT_MISMATCH' },
          400,
        );
      }
      // Explicit clear — wipe HMC link and denorm fields.
      normalizedHmcChurchId = null;
      normalizedChurchName = null;
      normalizedChurchCity = null;
      normalizedChurchState = null;
      normalizedChurchCountry = null;
      applyChurchUpdate = true;
    } else if (intent === 'outside_directory') {
      // Country not in HMC’s directory — Harvous DB only, never HMC.
      normalizedHmcChurchId = null;
      normalizedChurchName = readOptionalString(body.churchName);
      normalizedChurchCity = readOptionalString(body.churchCity);
      normalizedChurchState = readOptionalString(body.churchState);
      normalizedChurchCountry = readOptionalString(body.churchCountry);
      if (!normalizedChurchName) {
        return c.json({ error: 'Church name is required', code: 'CHURCH_NAME_REQUIRED' }, 400);
      }
      if (!normalizedChurchCountry) {
        return c.json({ error: 'Country is required', code: 'CHURCH_COUNTRY_REQUIRED' }, 400);
      }
      if (matchesHmcDirectoryCountry(normalizedChurchCountry)) {
        return c.json(
          {
            error: 'Use the directory or “Not in the directory” for countries Here’s My Church covers',
            code: 'CHURCH_INTENT_MISMATCH',
          },
          400,
        );
      }
      applyChurchUpdate = true;
    } else if (intent === 'unlisted') {
      // Unlisted church in a directory country — name + freeform address (city/region inside).
      normalizedHmcChurchId = null;
      normalizedChurchName = readOptionalString(body.churchName);
      const churchAddress = readOptionalString(body.churchAddress);
      const legacyCity = readOptionalString(body.churchCity);
      const legacyRegion = normalizeHmcRegionCode(readOptionalString(body.churchState));
      const countryHint = readOptionalString(body.churchCountry);
      const hintCode =
        countryHint && getHmcCountry(countryHint)
          ? countryHint.trim().toUpperCase()
          : countryHint && matchesHmcDirectoryCountry(countryHint)
            ? hmcCountryForRegion(legacyRegion)
            : null;
      const countryCode = hintCode || hmcCountryForRegion(legacyRegion);
      if (
        countryHint &&
        !matchesHmcDirectoryCountry(countryHint) &&
        !isUnitedStatesCountryLabel(countryHint)
      ) {
        return c.json(
          {
            error: 'Unlisted churches must use a Here’s My Church directory country',
            code: 'CHURCH_INTENT_MISMATCH',
          },
          400,
        );
      }
      if (!normalizedChurchName) {
        return c.json({ error: 'Church name is required', code: 'CHURCH_NAME_REQUIRED' }, 400);
      }
      if (!countryCode) {
        return c.json({ error: 'Select a directory country', code: 'CHURCH_COUNTRY_REQUIRED' }, 400);
      }
      if (!churchAddress && !(legacyCity && legacyRegion)) {
        return c.json(
          { error: 'Address is required (include city and region)', code: 'CHURCH_ADDRESS_REQUIRED' },
          400,
        );
      }

      normalizedChurchCountry = countryCode;
      normalizedChurchCity = churchAddress || legacyCity;
      normalizedChurchState = legacyRegion;

      try {
        const submitted = await hmcSubmitUnlistedChurch({
          name: normalizedChurchName,
          country: countryCode,
          address: churchAddress,
          city: legacyCity,
          state: legacyRegion,
        });
        if (submitted.church) {
          const enriched = await hmcFillMissingCity(submitted.church);
          const denorm = hmcDenormFields(enriched);
          normalizedHmcChurchId = enriched.id;
          normalizedChurchName = denorm.name;
          normalizedChurchCity = denorm.city;
          normalizedChurchState = denorm.state;
          normalizedChurchCountry = denorm.country;
        } else if (submitted.place) {
          normalizedChurchCity = submitted.place.city;
          normalizedChurchState = submitted.place.state;
          normalizedChurchCountry = submitted.place.country;
        }
      } catch (error) {
        if (error instanceof HmcPartnerError && error.code === 'HMC_RATE_LIMITED') {
          return c.json({ error: error.message, code: error.code }, 429);
        }
        // Geocode / add failures fall through to free-text save.
      }
      applyChurchUpdate = true;
    } else if (hasManualKeys) {
      // Legacy manual entry (no intent): outside-US free-text, or U.S. unlisted (HMC).
      normalizedHmcChurchId = null;
      normalizedChurchName = readOptionalString(body.churchName);
      normalizedChurchCity = readOptionalString(body.churchCity);
      normalizedChurchState = readOptionalString(body.churchState);
      normalizedChurchCountry = readOptionalString(body.churchCountry);
      const clearingManual =
        !normalizedChurchName &&
        !normalizedChurchCity &&
        !normalizedChurchState &&
        !normalizedChurchCountry;
      if (!clearingManual && !normalizedChurchName) {
        return c.json({ error: 'Church name is required', code: 'CHURCH_NAME_REQUIRED' }, 400);
      }

      if (
        !clearingManual &&
        normalizedChurchName &&
        isUsChurchLocation({
          churchState: normalizedChurchState,
          churchCountry: normalizedChurchCountry,
        })
      ) {
        const usState = normalizeUsStateCode(normalizedChurchState);
        if (!normalizedChurchCity) {
          return c.json(
            { error: 'City is required for U.S. churches', code: 'CHURCH_CITY_REQUIRED' },
            400,
          );
        }
        if (!usState) {
          return c.json(
            { error: 'Select a U.S. state', code: 'CHURCH_STATE_REQUIRED' },
            400,
          );
        }
        normalizedChurchState = usState;
        normalizedChurchCountry = 'US';
        try {
          const submitted = await hmcSubmitUnlistedChurch({
            name: normalizedChurchName,
            city: normalizedChurchCity,
            state: usState,
            country: 'US',
          });
          if (submitted.church) {
            const enriched = await hmcFillMissingCity(submitted.church);
            const denorm = hmcDenormFields(enriched);
            normalizedHmcChurchId = enriched.id;
            normalizedChurchName = denorm.name;
            normalizedChurchCity = denorm.city;
            normalizedChurchState = denorm.state;
            normalizedChurchCountry = denorm.country;
          }
        } catch (error) {
          if (error instanceof HmcPartnerError && error.code === 'HMC_RATE_LIMITED') {
            return c.json({ error: error.message, code: error.code }, 429);
          }
          // Geocode / add failures fall through to free-text save.
        }
      }
      applyChurchUpdate = true;
    }

    const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1);

    if (!applyChurchUpdate) {
      const existing = existingRecord[0];
      return c.json({
        success: true,
        message: 'No church changes',
        church: {
          hmcChurchId: existing?.hmcChurchId ?? null,
          churchName: existing?.churchName ?? null,
          churchCity: existing?.churchCity ?? null,
          churchState: existing?.churchState ?? null,
          churchCountry: existing?.churchCountry ?? null,
          connectedChurchId: existing?.connectedChurchId ?? null,
          connectedOrgId: existing?.connectedOrgId ?? null,
          connectedChurchAt: existing?.connectedChurchAt ?? null,
        },
      });
    }

    const nextHmc = normalizedHmcChurchId ?? null;
    const connection = await connectionFieldsForHmcChurchId(nextHmc);
    const existing = existingRecord[0];
    if (
      connection.connectedChurchId &&
      existing?.connectedChurchId === connection.connectedChurchId &&
      existing.connectedChurchAt
    ) {
      connection.connectedChurchAt = existing.connectedChurchAt;
    }

    if (existingRecord.length > 0) {
      const isFirstTimeAddingChurch =
        !existing.hmcChurchId &&
        !existing.churchName &&
        !existing.churchCity &&
        !existing.churchState &&
        !existing.churchCountry &&
        Boolean(
          nextHmc ||
            normalizedChurchName ||
            normalizedChurchCity ||
            normalizedChurchState ||
            normalizedChurchCountry,
        );

      await db
        .update(UserMetadata)
        .set({
          hmcChurchId: nextHmc,
          churchName: normalizedChurchName ?? null,
          churchCity: normalizedChurchCity ?? null,
          churchState: normalizedChurchState ?? null,
          churchCountry: normalizedChurchCountry ?? null,
          connectedChurchId: connection.connectedChurchId,
          connectedOrgId: connection.connectedOrgId,
          connectedChurchAt: connection.connectedChurchAt,
          churchAddedAt: isFirstTimeAddingChurch ? nowISO() : existing.churchAddedAt,
          updatedAt: nowISO(),
        })
        .where(eq(UserMetadata.userId, auth.userId));

      if (isFirstTimeAddingChurch) {
        await awardChurchAddedXP(auth.userId);
      }
    } else {
      const hasChurchData =
        nextHmc ||
        normalizedChurchName ||
        normalizedChurchCity ||
        normalizedChurchState ||
        normalizedChurchCountry;
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        hmcChurchId: nextHmc,
        churchName: normalizedChurchName ?? null,
        churchCity: normalizedChurchCity ?? null,
        churchState: normalizedChurchState ?? null,
        churchCountry: normalizedChurchCountry ?? null,
        connectedChurchId: connection.connectedChurchId,
        connectedOrgId: connection.connectedOrgId,
        connectedChurchAt: connection.connectedChurchAt,
        churchAddedAt: hasChurchData ? nowISO() : null,
        highestSimpleNoteId: 0,
        userColor: 'blue',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      if (hasChurchData) await awardChurchAddedXP(auth.userId);
    }

    return c.json({
      success: true,
      message: 'Church information updated',
      church: {
        hmcChurchId: nextHmc,
        churchName: normalizedChurchName ?? null,
        churchCity: normalizedChurchCity ?? null,
        churchState: normalizedChurchState ?? null,
        churchCountry: normalizedChurchCountry ?? null,
        connectedChurchId: connection.connectedChurchId,
        connectedOrgId: connection.connectedOrgId,
        connectedChurchAt: connection.connectedChurchAt,
      },
    });
  } catch (error) {
    if (error instanceof HmcPartnerError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400 | 429 | 502 | 503);
    }
    const e = handleAPIError(error, { endpoint: '/api/user/update-church', action: 'update_church_info' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/update-credentials ───────────────────────────────────────

app.post('/api/user/update-credentials', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { newEmail, currentPassword, newPassword } = body;

    if (!newEmail && !newPassword) return c.json({ error: 'At least one field must be provided' }, 400);
    if (newPassword && newPassword.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return c.json({ error: 'Server configuration error' }, 500);

    const updateData: any = {};
    if (newEmail) updateData.email_address = newEmail;
    if (newPassword) {
      if (!currentPassword) return c.json({ error: 'Current password is required to change password' }, 400);
      updateData.password = newPassword;
    }

    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      let errorMessage = 'Failed to update credentials';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors?.[0]) {
          const code = errorData.errors[0].code;
          const codeMap: Record<string, string> = {
            form_password_incorrect: 'Current password is incorrect',
            form_password_pwned: 'This password has been found in a data breach',
            form_password_too_common: 'This password is too common',
            form_email_address_invalid: 'Please enter a valid email address',
            form_email_address_already_exists: 'This email address is already in use',
          };
          errorMessage = codeMap[code] || errorData.errors[0].longMessage || errorMessage;
        }
      } catch (_) { /* use default */ }
      return c.json({ error: errorMessage }, 400);
    }

    return c.json({ success: true, message: 'Credentials updated' });
  } catch (error) {
    console.error('Error updating credentials:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/user/update-profile ───────────────────────────────────────────

app.post('/api/user/update-profile', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { firstName, lastName, color } = body;

    const fnv = validateName(firstName, 'First name', true);
    if (!fnv.isValid) return c.json({ error: fnv.error, code: fnv.code }, 400);
    const lnv = validateName(lastName, 'Last name', true);
    if (!lnv.isValid) return c.json({ error: lnv.error, code: lnv.code }, 400);
    const cv = validateColor(color);
    if (!cv.isValid) return c.json({ error: cv.error, code: cv.code }, 400);

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return c.json({ error: 'Server configuration error' }, 500);

    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, public_metadata: { userColor: color } })
    });

    if (!clerkResponse.ok) {
      return c.json({ error: 'Failed to update profile in Clerk' }, 500);
    }

    try { await invalidateUserCache(auth.userId); } catch (_) { /* non-fatal */ }

    try {
      const existingMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
      await db.update(UserMetadata).set({
        firstName, lastName, userColor: color,
        churchName: existingMetadata?.churchName ?? null,
        churchCity: existingMetadata?.churchCity ?? null,
        churchState: existingMetadata?.churchState ?? null,
        updatedAt: nowISO()
      }).where(eq(UserMetadata.userId, auth.userId));
    } catch (_) { /* non-fatal */ }

    return c.json({
      success: true, message: 'Profile updated',
      user: {
        firstName, lastName, color,
        initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
        displayName: `${firstName} ${lastName.charAt(0)}`.trim()
      }
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/update-profile', action: 'update_profile' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/audienceful-milestones ───────────────────────────────────
// Client-only product signals (note opened, upgrade viewed, checkout started).

const AUDIENCEFUL_MILESTONE_TO_FLAG = {
  note_opened: 'has_opened_note',
  upgrade_viewed: 'upgrade_viewed',
  checkout_started: 'checkout_started',
} as const;

type AudiencefulMilestone = keyof typeof AUDIENCEFUL_MILESTONE_TO_FLAG;

app.post('/api/user/audienceful-milestones', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { milestones?: unknown };
    const raw = Array.isArray(body.milestones) ? body.milestones : [];
    const flags: AudiencefulProductFlags = {};

    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const flagKey = AUDIENCEFUL_MILESTONE_TO_FLAG[item as AudiencefulMilestone];
      if (flagKey) flags[flagKey] = true;
    }

    queueAudiencefulProductFlagsForUser(auth.userId, flags);
    return c.json({ success: true }, 200);
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/user/audienceful-milestones', action: 'audienceful_milestones' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/xp ────────────────────────────────────────────────────────

app.get('/api/user/xp', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const shouldBackfill = c.req.query('backfill') === 'true';
    const season = c.req.query('season');

    if (shouldBackfill) await backfillUserXP(auth.userId);

    const [seasonalXP, lifetimeXP, breakdown] = await Promise.all([
      getSeasonalXP(auth.userId, season || undefined),
      getLifetimeXP(auth.userId),
      getXPBreakdown(auth.userId)
    ]);

    return c.json({
      seasonalXP, lifetimeXP, totalXP: lifetimeXP,
      season: season || getCurrentSeason(),
      seasonName: getSeasonDisplayName(season || undefined),
      breakdown, backfilled: shouldBackfill
    });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/user/xp', action: 'get_user_xp' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/get-profile ───────────────────────────────────────────────

app.get('/api/user/get-profile', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    console.log('[api/user/get-profile] auth.userId', auth.userId);

    const userData = await getCachedUserData(auth.userId);
    console.log('[api/user/get-profile] userData loaded', { displayName: userData.displayName });

    let churchData = {
      hmcChurchId: null as string | null,
      churchName: null as string | null,
      churchCity: null as string | null,
      churchState: null as string | null,
      churchCountry: null as string | null,
      connectedChurchId: null as string | null,
      connectedOrgId: null as string | null,
      connectedChurchAt: null as string | null,
    };
    let defaultTranslation = 'NET';
    let appearanceSettings: string | null = null;
    let lastReadPosition: string | null = null;
    let sharedSpaceSwitcherOrder: string[] | null = null;
    try {
      const um = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
      if (um) {
        churchData = {
          hmcChurchId: um.hmcChurchId ?? null,
          churchName: um.churchName ?? null,
          churchCity: um.churchCity ?? null,
          churchState: um.churchState ?? null,
          churchCountry: um.churchCountry ?? null,
          connectedChurchId: um.connectedChurchId ?? null,
          connectedOrgId: um.connectedOrgId ?? null,
          connectedChurchAt: um.connectedChurchAt ?? null,
        };
        defaultTranslation = um.defaultTranslation ?? 'NET';
        appearanceSettings = um.appearanceSettings ?? null;
        lastReadPosition = um.lastReadPosition ?? null;
        sharedSpaceSwitcherOrder = parseSharedSpaceSwitcherOrder(um.sharedSpaceSwitcherOrder);

        // Reconcile: user picked HMC before the church was registered on Harvous.
        if (churchData.hmcChurchId && !churchData.connectedOrgId) {
          try {
            const connection = await connectionFieldsForHmcChurchId(churchData.hmcChurchId);
            if (connection.connectedOrgId) {
              await db
                .update(UserMetadata)
                .set({
                  connectedChurchId: connection.connectedChurchId,
                  connectedOrgId: connection.connectedOrgId,
                  connectedChurchAt: connection.connectedChurchAt,
                  updatedAt: nowISO(),
                })
                .where(eq(UserMetadata.userId, auth.userId));
              churchData = { ...churchData, ...connection };
            }
          } catch (_) { /* non-fatal reconcile */ }
        }
      }
    } catch (_) { /* non-fatal */ }

    let hasLockPinSet = false;
    try {
      const lockMeta = first(await db.select({ lockPinHash: UserMetadata.lockPinHash })
        .from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
      hasLockPinSet = !!(lockMeta?.lockPinHash);
    } catch (_) { /* non-fatal */ }

    let isHomeChurchStaff = false;
    if (churchData.connectedOrgId) {
      try {
        isHomeChurchStaff = await isChurchStaffForOrg(auth.userId, churchData.connectedOrgId);
      } catch (_) { /* non-fatal */ }
    }

    let emailVerified = false;
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
          headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' }
        });
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          emailVerified = clerkUser.email_addresses?.[0]?.verification?.status === 'verified';
        }
      }
    } catch (_) { /* non-fatal */ }

    return c.json({
      firstName: userData.firstName, lastName: userData.lastName,
      userColor: userData.userColor, email: userData.email,
      profileImageUrl: userData.profileImageUrl ?? null,
      emailVerified,
      hmcChurchId: churchData.hmcChurchId,
      churchName: churchData.churchName, churchCity: churchData.churchCity, churchState: churchData.churchState, churchCountry: churchData.churchCountry,
      connectedChurchId: churchData.connectedChurchId,
      connectedOrgId: churchData.connectedOrgId,
      connectedChurchAt: churchData.connectedChurchAt,
      isHomeChurchStaff,
      defaultTranslation,
      appearanceSettings,
      lastReadPosition,
      sharedSpaceSwitcherOrder,
      hasLockPinSet
    // Overrides app.ts's blanket `private, max-age=30, stale-while-revalidate=60` default.
    // That default assumes "user-specific data unlikely to change within seconds" — this
    // endpoint doesn't fit it: several POST handlers (update-translation, edit-name-color,
    // connect-church, ...) mutate the exact fields returned here, in the same session, and
    // the client's own invalidateQueries()-triggered refetch has no power to see past this
    // header — the browser's HTTP cache serves the pre-mutation response straight from disk
    // without ever reaching the server, so React Query "successfully" refetches stale data.
    // Confirmed live: a translation change committed server-side while this response stayed
    // cached, silently reverting the account's default translation in the UI for up to 90s
    // (max-age + stale-while-revalidate) after every edit. Same `no-store` override already
    // used by sibling per-user endpoints in this file (`/api/user/limits`, `/api/profile/my-
    // sharing`, `/api/profile/my-shared-spaces`) for the same reason.
    }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/get-profile', action: 'get_user_profile' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/church-staff-status ───────────────────────────────────────
/** Live staff check for a church org (createdBy, space staff, or Clerk org member). */
app.get('/api/user/church-staff-status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();
    if (!orgId) {
      return c.json({ error: 'orgId is required', code: 'ORG_ID_REQUIRED' }, 400);
    }
    const isStaff = await isChurchStaffForOrg(auth.userId, orgId);
    if (!isStaff) {
      return c.json({ orgId, isStaff: false, role: null, capabilities: NO_CHURCH_CAPABILITIES });
    }

    // Role-gated surfaces are decided here, not on the client. A Clerk outage
    // degrades to plain staff (publish only) rather than to nothing — losing
    // the sermon template is better than losing the ability to publish.
    let role: string | null = null;
    try {
      const roster = await fetchClerkOrgMemberships(orgId);
      role = roster.find((member) => member.userId === auth.userId)?.role ?? null;
    } catch (error) {
      console.warn('[church-staff-status] Clerk role lookup failed; defaulting to staff', {
        orgId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return c.json({ orgId, isStaff: true, role, capabilities: capabilitiesForChurchRole(role) });
  } catch (error) {
    const e = handleAPIError(error, {
      endpoint: '/api/user/church-staff-status',
      action: 'church_staff_status',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

function parseSharedSpaceSwitcherOrder(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => (id.startsWith('space_') ? id : `space_${id}`));
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

// ─── POST /api/user/update-shared-space-switcher-order ────────────────────────

/**
 * Per-user preference for space switcher order. Covers every list the switcher shows —
 * My Home's personal Shared Spaces and a church's spaces/channels — in one array; each
 * list picks out its own ids and ignores the rest.
 *
 * Drops ids the user cannot access. Church-scoped spaces are allowed now (they were
 * excluded by an `orgId IS NULL` narrowing), but the gate is unchanged: an id survives
 * only if the caller owns the space or holds a membership in it. Following a channel
 * creates that membership, so a followed channel qualifies and an unfollowed one does
 * not. Order here is a private display preference and changes nothing for anyone else.
 */
app.post('/api/user/update-shared-space-switcher-order', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => ({})) as { spaceIds?: unknown };
    if (!Array.isArray(body.spaceIds)) {
      return c.json({ error: 'spaceIds must be an array', code: 'INVALID_SPACE_IDS' }, 400);
    }
    if (body.spaceIds.length > 100) {
      return c.json({ error: 'Too many space ids', code: 'SPACE_IDS_TOO_LONG' }, 400);
    }

    const requested = body.spaceIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => (id.startsWith('space_') ? id.trim() : `space_${id.trim()}`));
    const uniqueRequested = [...new Set(requested)];

    let allowedIds = new Set<string>();
    if (uniqueRequested.length > 0) {
      // 'public' covers ministry channels (public + orgId); 'personal' stays out — My Home
      // is not a row anyone can drag.
      const orderableTypes = ['shared', 'public'] as const;
      const owned = await db
        .select({ id: Spaces.id })
        .from(Spaces)
        .where(
          and(
            eq(Spaces.userId, auth.userId),
            inArray(Spaces.type, [...orderableTypes]),
            isNull(Spaces.deletedAt),
            inArray(Spaces.id, uniqueRequested),
          ),
        );
      const memberRows = await db
        .select({ id: Spaces.id })
        .from(SpaceMemberships)
        .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
        .where(
          and(
            eq(SpaceMemberships.userId, auth.userId),
            inArray(Spaces.type, [...orderableTypes]),
            isNull(Spaces.deletedAt),
            inArray(Spaces.id, uniqueRequested),
          ),
        );
      allowedIds = new Set([...owned, ...memberRows].map((r) => r.id));
    }

    const cleaned = uniqueRequested.filter((id) => allowedIds.has(id));
    const sharedSpaceSwitcherOrder = cleaned.length > 0 ? JSON.stringify(cleaned) : null;

    const existing = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (existing) {
      await db
        .update(UserMetadata)
        .set({ sharedSpaceSwitcherOrder, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));
    } else {
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        sharedSpaceSwitcherOrder,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }

    broadcastInvalidation(auth.userId, { type: 'userMetadata:updated' });

    return c.json({ success: true, sharedSpaceSwitcherOrder: cleaned });
  } catch (error) {
    const e = handleAPIError(error, {
      endpoint: '/api/user/update-shared-space-switcher-order',
      action: 'update_shared_space_switcher_order',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/update-appearance ────────────────────────────────────────

/** Structural guard for a stored ProtoBg (color | image-preset | null). */
function isValidProtoBg(v: unknown): boolean {
  if (v === null) return true;
  if (!v || typeof v !== 'object') return false;
  const bg = v as Record<string, unknown>;
  if (bg.kind === 'color') {
    return typeof bg.value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(bg.value);
  }
  if (bg.kind === 'image-preset') {
    if (typeof bg.presetId !== 'string' || bg.presetId.length > 64) return false;
    return bg.tint === undefined || (typeof bg.tint === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(bg.tint));
  }
  return false;
}

app.post('/api/user/update-appearance', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const { colorScheme, bgLight, bgDark } = body ?? {};

    if (colorScheme !== 'system' && colorScheme !== 'light' && colorScheme !== 'dark') {
      return c.json({ error: 'Invalid colorScheme' }, 400);
    }
    if (!isValidProtoBg(bgLight) || !isValidProtoBg(bgDark)) {
      return c.json({ error: 'Invalid background' }, 400);
    }

    const appearanceSettings = JSON.stringify({
      colorScheme,
      bgLight: bgLight ?? null,
      bgDark: bgDark ?? null,
    });

    const existing = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (existing) {
      await db.update(UserMetadata)
        .set({ appearanceSettings, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));
    } else {
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        appearanceSettings,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }

    broadcastInvalidation(auth.userId, { type: 'userMetadata:updated' });

    return c.json({ success: true, appearanceSettings });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/update-appearance', action: 'update_appearance' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

/**
 * Record where the reader is, so Home can offer to continue from it.
 *
 * Written when a chapter opens rather than when reading ends, which is what makes it
 * useful: the reader who closes a laptop mid-chapter is precisely the one who wants to
 * continue, and no reading event exists for them yet.
 */
app.post('/api/user/update-last-read', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();

    const input = validateLastReadPositionInput(body);
    if (!input) {
      return c.json({ error: 'Invalid reading position', code: 'LAST_READ_INVALID' }, 400);
    }

    // `readAt` lives inside the JSON, so it is an ISO string — `nowISO` is a Date shim.
    const lastReadPosition = serializeLastReadPosition(input, new Date().toISOString());

    const existing = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (existing) {
      await db.update(UserMetadata)
        .set({ lastReadPosition, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));
    } else {
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        lastReadPosition,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }

    broadcastInvalidation(auth.userId, { type: 'userMetadata:updated' });

    return c.json({ success: true, lastReadPosition });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/update-last-read', action: 'update_last_read' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/update-translation ───────────────────────────────────────

app.post('/api/user/update-translation', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { defaultTranslation } = await c.req.json();

    if (!defaultTranslation || typeof defaultTranslation !== 'string') {
      return c.json({ error: 'defaultTranslation is required' }, 400);
    }

    // Validate against known translations
    const { TRANSLATIONS } = await import('../../src/data/translations');
    if (!TRANSLATIONS[defaultTranslation]) {
      return c.json({ error: 'Invalid translation ID' }, 400);
    }

    const existing = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (existing) {
      await db.update(UserMetadata)
        .set({ defaultTranslation, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, auth.userId));
    } else {
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        defaultTranslation,
        createdAt: nowISO(),
      });
    }

    return c.json({ success: true, defaultTranslation });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/update-translation', action: 'update_default_translation' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/locked-notes ──────────────────────────────────────────────

app.get('/api/user/locked-notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const includeContent = c.req.query('content') === 'true';

    const lockedOnly = await db
      .select(includeContent ? { id: Notes.id, content: Notes.content } : { id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.userId, auth.userId), eq(Notes.contentEncrypted, true)))
      ;

    const result = includeContent
      ? lockedOnly.map((n: any) => ({ id: n.id, content: n.content }))
      : lockedOnly.map(n => ({ id: n.id }));

    // Overrides app.ts's blanket cache default (see GET /api/user/get-profile's comment) —
    // locking/unlocking a note changes exactly this list, and this is security-adjacent
    // state where a stale answer is worse than an ordinary staleness bug.
    return c.json({ notes: result }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/locked-notes', action: 'get_locked_notes' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/verify-lock-pin ──────────────────────────────────────────

app.post('/api/user/verify-lock-pin', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { pin } = body;

    if (!pin || !validatePinFormat(pin)) return c.json({ error: 'PIN must be exactly 4 digits', code: 'INVALID_PIN' }, 400);

    const existing = first(await db.select({ lockPinSalt: UserMetadata.lockPinSalt, lockPinHash: UserMetadata.lockPinHash })
      .from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));

    if (!existing?.lockPinSalt || !existing?.lockPinHash) return c.json({ error: 'No lock PIN set', code: 'NO_LOCK_PIN' }, 400);

    const valid = verifyPin(pin, existing.lockPinSalt, existing.lockPinHash);
    if (!valid) return c.json({ error: 'Incorrect PIN', code: 'INCORRECT_PIN' }, 401);

    return c.json({ success: true, valid: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/verify-lock-pin', action: 'verify_lock_pin' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/set-lock-pin ─────────────────────────────────────────────

app.post('/api/user/set-lock-pin', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { pin, currentPin, newPin } = body;

    const isChange = typeof currentPin === 'string' && typeof newPin === 'string';
    const pinToSet = isChange ? newPin : pin;

    if (!pinToSet || !validatePinFormat(pinToSet)) return c.json({ error: 'PIN must be exactly 4 digits', code: 'INVALID_PIN' }, 400);

    const existing = first(await db.select({ lockPinSalt: UserMetadata.lockPinSalt, lockPinHash: UserMetadata.lockPinHash })
      .from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));

    if (!existing) return c.json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' }, 400);

    if (isChange) {
      if (!existing.lockPinSalt || !existing.lockPinHash) return c.json({ error: 'No lock PIN set', code: 'NO_LOCK_PIN' }, 400);
      if (!validatePinFormat(currentPin)) return c.json({ error: 'Current PIN must be exactly 4 digits', code: 'INVALID_PIN' }, 400);
      if (!verifyPin(currentPin, existing.lockPinSalt, existing.lockPinHash)) return c.json({ error: 'Incorrect current PIN', code: 'INCORRECT_PIN' }, 401);
    }

    const { salt, hash } = hashPinNew(pinToSet);
    await db.update(UserMetadata).set({ lockPinSalt: salt, lockPinHash: hash, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, auth.userId));

    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/set-lock-pin', action: 'set_lock_pin' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/can-create-space ──────────────────────────────────────────

app.get('/api/user/can-create-space', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const canCreate = await canCreateSharedSpace(auth.userId, auth);
    return c.json(canCreate);
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/user/can-create-space', action: 'check_can_create_space' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/can-join-space ────────────────────────────────────────────

app.get('/api/user/can-join-space', requireAuth, rateLimit('read'), async (c) => {
  try {
    getAuthenticatedAuth(c);

    // Joining shared spaces is free and uncapped on every plan.
    return c.json({ allowed: true, limit: null });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/user/can-join-space', action: 'check_can_join_space' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/user/limits ────────────────────────────────────────────────────

app.get('/api/user/limits', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const limitsInfo = await getUserLimitsInfo(auth.userId, auth);
    return c.json(limitsInfo, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/user/limits', action: 'get_user_limits' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/user/import/preview ───────────────────────────────────────────

app.post('/api/user/import/preview', requireAuth, async (c) => {
  try {
    getAuthenticatedAuth(c);
    const formData = await c.req.formData();
    const format = formData.get('format') as string;
    if (!format || (format !== 'markdown' && format !== 'csv-threads')) {
      return c.json({ error: 'Invalid format. Must be "markdown" or "csv-threads"' }, 400);
    }
    const files: File[] = [];
    const filesEntry = formData.getAll('files') as File[];
    if (filesEntry?.length > 0) files.push(...filesEntry);
    else {
      const fileEntry = formData.get('file') as File;
      if (fileEntry) files.push(fileEntry);
    }
    if (files.length === 0) return c.json({ error: 'At least one file is required' }, 400);

    const { rows, warnings, unsupported } = await parseImportFiles(files, format as 'markdown' | 'csv-threads');
    if (rows.length === 0) return c.json({ error: 'No notes found in files', warnings, unsupported }, 400);

    return c.json({
      documents: rows.map((r) => ({
        index: r.index,
        fileName: r.fileName,
        title: r.title,
        highlightCount: r.highlightCount,
        tagCount: r.tagCount,
        sourceType: r.sourceType,
        folderPath: r.folderPath,
        primaryCollection: r.primaryCollection,
        secondaryCollections: r.secondaryCollections,
      })),
      warnings,
      unsupported,
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/preview', action: 'import_preview' });
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /api/user/import ───────────────────────────────────────────────────

app.post('/api/user/import', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formData = await c.req.formData();
    const format = formData.get('format') as string;
    if (!format || (format !== 'markdown' && format !== 'csv-threads')) {
      return c.json({ error: 'Invalid format. Must be "markdown" or "csv-threads"' }, 400);
    }

    const selectedRaw = formData.get('selectedIndices') as string | null;
    let selectedSet: Set<number> | null = null;
    if (selectedRaw) {
      try {
        const arr = JSON.parse(selectedRaw) as number[];
        if (Array.isArray(arr)) selectedSet = new Set(arr.filter((n) => typeof n === 'number'));
      } catch {
        /* import all */
      }
    }

    const files: File[] = [];
    const fileEntry = formData.get('file') as File;
    const filesEntry = formData.getAll('files') as File[];
    if (fileEntry) files.push(fileEntry);
    else if (filesEntry?.length > 0) files.push(...filesEntry);
    else return c.json({ error: 'At least one file is required' }, 400);

    const parsed = await parseImportFiles(files, format as 'markdown' | 'csv-threads');
    let allParsedNotes: ParsedImportRow[] = parsed.rows;
    if (selectedSet && selectedSet.size > 0) {
      allParsedNotes = allParsedNotes.filter((r) => selectedSet!.has(r.index));
    }
    if (allParsedNotes.length === 0) return c.json({ error: 'No notes found in files' }, 400);

    await ensureUnorganizedThread(auth.userId);

    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes).where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`, userId: auth.userId,
        highestSimpleNoteId: highestExistingId, userColor: 'blue', currentSeason: getCurrentSeason(), createdAt: nowISO()
      });
      userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1))!;
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const defaultTranslation = userMetadata.defaultTranslation?.trim() || 'NET';
    let notesImported = 0, threadsCreated = 0, tagsCreated = 0, duplicatesSkipped = 0, highlightsImported = 0;
    let scriptureProcessed = 0, autoTagsApplied = 0;
    const errors: string[] = [];
    const createdThreadIds = new Set<string>();
    const createdFolders = new Set<string>();
    // Map portable note id (from frontmatter/manifest) → newly inserted note id, for connection restore.
    const sourceIdToNewId = new Map<string, string>();

    const dedupeIndex = await loadUserDedupeIndex(auth.userId);
    let highestSimpleNoteId = effectiveHighest;

    for (let i = 0; i < allParsedNotes.length; i++) {
      const parsedRow = allParsedNotes[i];
      const outcome = await commitImportItem(parsedRow, {
        userId: auth.userId,
        format: format as ImportFormat,
        highestSimpleNoteId,
        dedupeIndex,
        consumeRateSlot: () => tryConsumeNoteCreates(auth.userId, getClientIP(c.req.raw), 1),
      });

      if (outcome.status === 'duplicate') {
        if (outcome.sourceId && outcome.noteId) sourceIdToNewId.set(outcome.sourceId, outcome.noteId);
        duplicatesSkipped++;
        continue;
      }
      if (outcome.status === 'rate-limited') {
        errors.push(`Import paused: ${outcome.error}`);
        break;
      }
      if (outcome.status === 'failed') {
        errors.push(`Failed to import note ${i + 1}: ${outcome.error}`);
        continue;
      }

      highestSimpleNoteId = outcome.highestSimpleNoteId;
      if (outcome.sourceId) sourceIdToNewId.set(outcome.sourceId, outcome.noteId);
      if (outcome.primaryCollection) createdFolders.add(outcome.primaryCollection);
      for (const sc of outcome.secondaryCollections) createdFolders.add(sc);
      if (!createdThreadIds.has(outcome.threadId) && outcome.threadId !== 'thread_unorganized') {
        createdThreadIds.add(outcome.threadId);
        threadsCreated++;
      }
      tagsCreated += outcome.tagsCreated;
      highlightsImported += outcome.highlightsImported;
      errors.push(...outcome.warnings);

      // Match create/update: auto-tags + scripture pills (body + portable refs). Non-fatal.
      const resolved = resolveImportNoteFields(parsedRow, format as ImportFormat);
      const stored = capitalizeForStorage(resolved.title, resolved.content);
      try {
        const enrichment = await enrichImportedNote({
          noteId: outcome.noteId,
          userId: auth.userId,
          threadId: outcome.threadId,
          title: stored.title,
          content: stored.content,
          noteType: resolved.scriptureReference ? 'scripture' : 'default',
          primaryCollection: outcome.primaryCollection,
          secondaryCollections: outcome.secondaryCollections,
          manualTagNames: resolved.tags,
          additionalReferences: resolved.portableRefs,
          defaultTranslation: resolved.scriptureTranslation || defaultTranslation,
        });
        autoTagsApplied += enrichment.autoTagsApplied;
        scriptureProcessed += enrichment.scriptureResultCount;
      } catch (enrichErr) {
        errors.push(
          `Failed to enrich note ${i + 1} (tags/scripture): ${
            enrichErr instanceof Error ? enrichErr.message : 'Unknown error'
          }`,
        );
      }

      notesImported++;
    }

    // Restore the note-connection graph from a backup manifest (ids remapped to new notes).
    let connectionsImported = 0;
    if (parsed.connections.length > 0 && sourceIdToNewId.size > 0) {
      const connRows: (typeof NoteConnections.$inferInsert)[] = [];
      const seenPairs = new Set<string>();
      for (const conn of parsed.connections) {
        const from = sourceIdToNewId.get(conn.fromNoteId);
        const to = sourceIdToNewId.get(conn.toNoteId);
        if (!from || !to || from === to) continue;
        const key = `${from}→${to}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        connRows.push({
          id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          fromNoteId: from, toNoteId: to, userId: auth.userId, spaceId: null, createdAt: nowISO(),
        });
      }
      if (connRows.length > 0) {
        try { await db.insert(NoteConnections).values(connRows); connectionsImported = connRows.length; }
        catch (err) { errors.push('Failed to restore some note connections.'); }
      }
    }

    return c.json({
      success: true,
      notesImported,
      threadsCreated,
      tagsCreated,
      foldersCreated: createdFolders.size,
      duplicatesSkipped,
      highlightsImported,
      connectionsImported,
      scriptureProcessed,
      autoTagsApplied,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return c.json({ error: error.message || 'Failed to import data' }, 500);
  }
});

// ─── Import sessions (/api/user/import/session/*) ────────────────────────────
//
// The import surface drives these: one request per uploaded file, then small
// commit and enrich batches, then finalize. Splitting the work this way is what
// makes honest per-file progress possible and keeps every request comfortably
// inside the function timeout, however large the import is.

/** UserMetadata must exist before notes can be numbered; imports may be a user's first write. */
async function ensureUserMetadataForImport(userId: string) {
  const existing = first(
    await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1),
  );
  if (existing) return existing;

  const existingNotes = await db
    .select({ simpleNoteId: Notes.simpleNoteId })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
    .orderBy(desc(Notes.simpleNoteId))
    .limit(1);
  await db.insert(UserMetadata).values({
    id: `user_metadata_${userId}`,
    userId,
    highestSimpleNoteId: existingNotes.length > 0 ? existingNotes[0].simpleNoteId || 0 : 0,
    userColor: 'blue',
    currentSeason: getCurrentSeason(),
    createdAt: nowISO(),
  });
  return first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1))!;
}

app.post('/api/user/import/session', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await createImportSession(auth.userId);
    return c.json({
      sessionId: session.id,
      expiresAt: session.expiresAt,
      limits: {
        maxFileBytes: IMPORT_LIMITS.maxFileBytes,
        maxFiles: IMPORT_LIMITS.maxFiles,
        maxItems: IMPORT_LIMITS.maxItems,
        maxCommitBatch: IMPORT_LIMITS.maxCommitBatch,
        maxEnrichBatch: IMPORT_LIMITS.maxEnrichBatch,
      },
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session', action: 'import_session_create' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/files', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getOpenImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found or already finished' }, 404);

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ error: 'A file is required' }, 400);

    const fileName = file.name || 'import';
    if (!isSupportedImportExtension(fileName)) {
      return c.json({ error: `${fileName}: unsupported file type`, unsupported: [fileName] }, 400);
    }
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
      const mb = Math.round(IMPORT_LIMITS.maxFileBytes / (1024 * 1024));
      return c.json({ error: `${fileName} is larger than the ${mb}MB limit` }, 413);
    }

    const [fileCount, itemCount] = await Promise.all([
      countImportSessionFiles(session.id),
      countImportSessionItems(session.id),
    ]);
    if (fileCount >= IMPORT_LIMITS.maxFiles) {
      return c.json({ error: `This import already has ${IMPORT_LIMITS.maxFiles} files.` }, 409);
    }
    if (itemCount >= IMPORT_LIMITS.maxItems) {
      return c.json({ error: `This import already has ${IMPORT_LIMITS.maxItems} notes.` }, 409);
    }

    const folderPathRaw = formData.get('folderPath');
    const folderPath = typeof folderPathRaw === 'string' && folderPathRaw.trim() ? folderPathRaw.trim() : null;
    const clientFileIdRaw = formData.get('clientFileId');
    const clientFileId = typeof clientFileIdRaw === 'string' && clientFileIdRaw ? clientFileIdRaw : null;

    const parsed = await parseImportEntry(
      {
        fileName,
        folderPath,
        text: () => file.text(),
        buffer: () => file.arrayBuffer(),
      },
      importFormatForFileName(fileName),
      itemCount,
    );

    const warnings = [...parsed.warnings];
    let rows = parsed.rows;
    if (rows.length > IMPORT_LIMITS.maxItemsPerFile) {
      warnings.push(
        `${fileName}: only the first ${IMPORT_LIMITS.maxItemsPerFile} of ${rows.length} notes were read.`,
      );
      rows = rows.slice(0, IMPORT_LIMITS.maxItemsPerFile);
    }
    if (rows.length > IMPORT_LIMITS.maxItems - itemCount) {
      rows = rows.slice(0, Math.max(0, IMPORT_LIMITS.maxItems - itemCount));
      warnings.push(`${fileName}: import is full at ${IMPORT_LIMITS.maxItems} notes.`);
    }

    // Advisory duplicate badge. Only the preserved-id case is checked here — it's a
    // single indexed lookup, where content dedupe would mean reading the whole
    // library for every file. Commit re-checks both, authoritatively.
    const sourceIds = rows
      .map((row) => (row.note as { portable?: { meta?: { id?: string } } }).portable?.meta?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const existingIds = new Set<string>();
    if (sourceIds.length > 0) {
      const found = await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), inArray(Notes.id, sourceIds)));
      for (const row of found) existingIds.add(row.id);
    }

    const items = await insertImportItems({
      sessionId: session.id,
      userId: auth.userId,
      clientFileId,
      fileSize: file.size,
      rows,
      startOrd: itemCount,
      duplicateHintFor: (row) => {
        const sourceId =
          (row.note as { portable?: { meta?: { id?: string } } }).portable?.meta?.id ?? null;
        return { hint: sourceId && existingIds.has(sourceId) ? 'id' : null, sourceId };
      },
    });

    return c.json({
      items: items.map(buildImportItemSummary),
      warnings,
      unsupported: parsed.unsupported,
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/files', action: 'import_session_file' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/manifest', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getOpenImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found or already finished' }, 404);

    const body = await c.req.json<{ connections?: Array<{ fromNoteId?: string; toNoteId?: string }> }>();
    const stored = await storeImportManifest(
      session.id,
      (body.connections ?? []).filter(
        (conn): conn is { fromNoteId: string; toNoteId: string } => !!conn?.fromNoteId && !!conn?.toNoteId,
      ),
    );
    return c.json({ connections: stored });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/manifest', action: 'import_session_manifest' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/exclude', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getOpenImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found or already finished' }, 404);

    const body = await c.req.json<{ itemIds?: string[]; included?: boolean }>();
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((id) => typeof id === 'string') : [];
    await setImportItemsIncluded(session.id, itemIds, body.included !== false);
    return c.json({ success: true, updated: itemIds.length });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/exclude', action: 'import_session_exclude' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/commit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getOpenImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found or already finished' }, 404);

    const body = await c.req.json<{ itemIds?: string[] }>();
    const requestedIds = (Array.isArray(body.itemIds) ? body.itemIds : [])
      .filter((id): id is string => typeof id === 'string')
      .slice(0, IMPORT_LIMITS.maxCommitBatch);
    if (requestedIds.length === 0) return c.json({ error: 'itemIds is required' }, 400);

    const items = await db
      .select()
      .from(ImportSessionItems)
      .where(
        and(
          eq(ImportSessionItems.sessionId, session.id),
          eq(ImportSessionItems.userId, auth.userId),
          eq(ImportSessionItems.status, 'parsed'),
          inArray(ImportSessionItems.id, requestedIds),
        ),
      )
      .orderBy(ImportSessionItems.ord);

    await ensureUnorganizedThread(auth.userId);
    await ensureUserMetadataForImport(auth.userId);

    const dedupeIndex = await loadUserDedupeIndex(auth.userId);
    let highestSimpleNoteId = await getEffectiveHighestSimpleNoteId(auth.userId);
    const ip = getClientIP(c.req.raw);

    const results: Array<{
      itemId: string;
      status: 'committed' | 'duplicate' | 'failed';
      noteId?: string;
      highlightsImported?: number;
      error?: string;
    }> = [];
    const counters = {
      notesImported: 0,
      threadsCreated: 0,
      tagsCreated: 0,
      duplicatesSkipped: 0,
      highlightsImported: 0,
    };
    let rateLimited: { retryAfterSeconds: number; message: string } | null = null;

    for (const item of items) {
      const row = importItemPayloadToRow(item);
      const outcome = await commitImportItem(row, {
        userId: auth.userId,
        format: importFormatForFileName(item.fileName),
        highestSimpleNoteId,
        dedupeIndex,
        consumeRateSlot: () => tryConsumeImportNoteCreates(auth.userId, ip, 1),
      });

      if (outcome.status === 'rate-limited') {
        // Stop the batch, but report what already landed — a partial commit is a
        // pause, not a failure, and the client resumes from the remaining items.
        rateLimited = { retryAfterSeconds: outcome.retryAfterSec, message: outcome.error };
        break;
      }

      if (outcome.status === 'duplicate') {
        counters.duplicatesSkipped++;
        await db
          .update(ImportSessionItems)
          .set({ status: 'duplicate', resultNoteId: outcome.noteId, updatedAt: new Date() })
          .where(eq(ImportSessionItems.id, item.id));
        results.push({ itemId: item.id, status: 'duplicate', noteId: outcome.noteId ?? undefined });
        continue;
      }

      if (outcome.status === 'failed') {
        await db
          .update(ImportSessionItems)
          .set({ status: 'failed', error: outcome.error, updatedAt: new Date() })
          .where(eq(ImportSessionItems.id, item.id));
        results.push({ itemId: item.id, status: 'failed', error: outcome.error });
        continue;
      }

      highestSimpleNoteId = outcome.highestSimpleNoteId;
      counters.notesImported++;
      counters.tagsCreated += outcome.tagsCreated;
      counters.highlightsImported += outcome.highlightsImported;
      if (outcome.threadCreated) counters.threadsCreated++;

      await db
        .update(ImportSessionItems)
        .set({ status: 'committed', resultNoteId: outcome.noteId, error: null, updatedAt: new Date() })
        .where(eq(ImportSessionItems.id, item.id));
      results.push({
        itemId: item.id,
        status: 'committed',
        noteId: outcome.noteId,
        highlightsImported: outcome.highlightsImported,
      });
    }

    await bumpImportSessionCounters(session.id, counters);

    return c.json({
      results,
      rateLimited: rateLimited
        ? { retryAfterSeconds: rateLimited.retryAfterSeconds, message: rateLimited.message }
        : undefined,
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/commit', action: 'import_session_commit' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/enrich', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getOpenImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found or already finished' }, 404);

    const body = await c.req.json<{ itemIds?: string[] }>();
    const requestedIds = (Array.isArray(body.itemIds) ? body.itemIds : [])
      .filter((id): id is string => typeof id === 'string')
      .slice(0, IMPORT_LIMITS.maxEnrichBatch);
    if (requestedIds.length === 0) return c.json({ error: 'itemIds is required' }, 400);

    const items = await db
      .select()
      .from(ImportSessionItems)
      .where(
        and(
          eq(ImportSessionItems.sessionId, session.id),
          eq(ImportSessionItems.userId, auth.userId),
          eq(ImportSessionItems.status, 'committed'),
          isNull(ImportSessionItems.enrichedAt),
          inArray(ImportSessionItems.id, requestedIds),
        ),
      );

    const metadata = await ensureUserMetadataForImport(auth.userId);
    const defaultTranslation = metadata.defaultTranslation?.trim() || 'NET';

    const results: Array<{
      itemId: string;
      autoTagsApplied: number;
      scriptureProcessed: number;
      skipped?: string;
    }> = [];
    const counters = { scriptureProcessed: 0, autoTagsApplied: 0 };

    for (const item of items) {
      if (!item.resultNoteId) {
        results.push({ itemId: item.id, autoTagsApplied: 0, scriptureProcessed: 0, skipped: 'No note' });
        continue;
      }
      const note = first(
        await db
          .select()
          .from(Notes)
          .where(and(eq(Notes.id, item.resultNoteId), eq(Notes.userId, auth.userId)))
          .limit(1),
      );
      if (!note) {
        results.push({ itemId: item.id, autoTagsApplied: 0, scriptureProcessed: 0, skipped: 'Note missing' });
        continue;
      }

      const row = importItemPayloadToRow(item);
      const resolved = resolveImportNoteFields(row, importFormatForFileName(item.fileName));
      const noteThread = first(
        await db
          .select({ threadId: NoteThreads.threadId })
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, note.id))
          .limit(1),
      );

      try {
        const enrichment = await enrichImportedNote({
          noteId: note.id,
          userId: auth.userId,
          threadId: noteThread?.threadId || 'thread_unorganized',
          title: note.title,
          content: note.content,
          noteType: (note.noteType as 'default' | 'scripture' | 'resource') || 'default',
          primaryCollection: note.primaryCollection,
          secondaryCollections: row.secondaryCollections,
          manualTagNames: resolved.tags,
          additionalReferences: resolved.portableRefs,
          defaultTranslation: resolved.scriptureTranslation || defaultTranslation,
        });
        counters.autoTagsApplied += enrichment.autoTagsApplied;
        // Report the pills the user will actually see in the note rather than the
        // processor's internal result count, which excludes references that resolved
        // to scripture the account already had.
        const enriched = first(
          await db
            .select({ content: Notes.content })
            .from(Notes)
            .where(eq(Notes.id, note.id))
            .limit(1),
        );
        const pillCount = (enriched?.content.match(/data-scripture-reference=/g) ?? []).length;
        const scriptureProcessed = Math.max(pillCount, enrichment.scriptureResultCount);
        counters.scriptureProcessed += scriptureProcessed;
        results.push({
          itemId: item.id,
          autoTagsApplied: enrichment.autoTagsApplied,
          scriptureProcessed,
        });
      } catch (enrichErr) {
        // The note is already saved; a scripture/tagging failure must not undo it.
        results.push({
          itemId: item.id,
          autoTagsApplied: 0,
          scriptureProcessed: 0,
          skipped: enrichErr instanceof Error ? enrichErr.message : 'Enrichment failed',
        });
      }

      await db
        .update(ImportSessionItems)
        .set({ enrichedAt: new Date(), updatedAt: new Date() })
        .where(eq(ImportSessionItems.id, item.id));
    }

    await bumpImportSessionCounters(session.id, counters);

    return c.json({ results });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/enrich', action: 'import_session_enrich' });
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/user/import/session/:id/finalize', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const finalized = await finalizeImportSession(c.req.param('id') ?? '', auth.userId);
    if (!finalized) return c.json({ error: 'Import session not found' }, 404);

    invalidateUserCache(auth.userId);
    broadcastInvalidation(auth.userId, { type: 'sync:batch' });
    return c.json(finalized);
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id/finalize', action: 'import_session_finalize' });
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/user/import/session/:id', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found' }, 404);
    const items = await getImportSessionItems(session.id);
    // Overrides app.ts's blanket cache default (see GET /api/user/get-profile's comment) —
    // this is a progress-polling endpoint. A client polling this same URL every few seconds
    // during an active import would otherwise see the same cached snapshot for up to 30s at
    // a stretch, and the progress bar would look frozen mid-import.
    return c.json(
      {
        summary: buildImportSessionSummary(session),
        expiresAt: session.expiresAt,
        items: items.map(buildImportItemSummary),
      },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id', action: 'import_session_get' });
    return c.json({ error: e.message }, 500);
  }
});

app.delete('/api/user/import/session/:id', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const session = await getImportSession(c.req.param('id') ?? '', auth.userId);
    if (!session) return c.json({ error: 'Import session not found' }, 404);

    // An unfinished session only holds parsed rows — dropping it costs the user
    // nothing. A finished one means undo: take back the notes it created.
    if (session.status !== 'done') {
      await abandonImportSession(session.id, auth.userId);
      return c.json({ success: true, undone: false });
    }

    const undone = await undoImportSession(session.id, auth.userId);
    invalidateUserCache(auth.userId);
    broadcastInvalidation(auth.userId, { type: 'sync:batch' });
    return c.json({
      success: true,
      undone: true,
      deletedNotes: undone?.deletedNoteIds.length ?? 0,
      keptEditedNotes: undone?.keptEditedNoteIds.length ?? 0,
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/user/import/session/:id', action: 'import_session_delete' });
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /api/profile/my-sharing ─────────────────────────────────────────────

app.get('/api/profile/my-sharing', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const origin = new URL(c.req.url).origin;

    const [threadRows, noteRows] = await Promise.all([
      db.select({ id: Threads.id, title: Threads.title, color: Threads.color, shareToken: Threads.shareToken })
        .from(Threads).where(and(eq(Threads.userId, auth.userId), isNotNull(Threads.shareToken)))
        .orderBy(desc(Threads.shareTokenCreatedAt)),
      db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        shareToken: Notes.shareToken,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
      })
        .from(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.noteType, 'default'), isNotNull(Notes.shareToken)))
        .orderBy(desc(Notes.shareTokenCreatedAt))
    ]);

    const threads = threadRows
      .filter((t): t is typeof t & { shareToken: string } => t.shareToken != null)
      .map(t => ({
        id: t.id, title: t.title || 'Untitled thread', color: t.color ?? undefined,
        shareToken: t.shareToken, shareUrl: `${origin}/shared/thread/${t.shareToken}`
      }));

    const notes = noteRows
      .filter((n): n is typeof n & { shareToken: string } => n.shareToken != null)
      .map(n => {
        const title = n.title?.trim() || (n.content?.split('\n')[0]?.trim().slice(0, 80) || 'Untitled note');
        const preview = n.content ? stripHtmlForListPreview(n.content, 80) : undefined;
        return {
          id: n.id,
          title: title.length > 80 ? title.slice(0, 77) + '...' : title,
          preview: preview || undefined,
          updatedAt: n.updatedAt ?? undefined,
          createdAt: n.createdAt,
          shareToken: n.shareToken,
          shareUrl: `${origin}/shared/note/${n.shareToken}`,
        };
      });

    return c.json({ threads, notes }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/profile/my-sharing', action: 'get_my_sharing' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/profile/my-shared-spaces ───────────────────────────────────────

app.get('/api/profile/my-shared-spaces', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const origin = new URL(c.req.url).origin;

    const ownedSpacesRows = await db.select({
      id: Spaces.id, title: Spaces.title, color: Spaces.color,
    }).from(Spaces).where(and(eq(Spaces.userId, auth.userId), eq(Spaces.type, 'shared')))
      .orderBy(
        asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Spaces.lastVisited)
      );

    const owned: Array<{ id: string; title: string; color?: string | null; memberCount: number; shareUrl?: string }> = [];
    for (const space of ownedSpacesRows) {
      const memberCount = await getSpaceMemberCount(space.id);
      const activeInvite = first(await db.select({ token: SpaceInvites.token })
        .from(SpaceInvites)
        .where(and(eq(SpaceInvites.spaceId, space.id), isNull(SpaceInvites.revokedAt)))
        .orderBy(desc(SpaceInvites.createdAt))
        .limit(1));
      owned.push({
        id: space.id, title: space.title || 'Untitled space', color: space.color ?? undefined,
        memberCount,
        shareUrl: activeInvite ? `${origin}/spaces/join/${activeInvite.token}` : undefined,
      });
    }

    const memberRows = await db.select({ spaceId: SpaceMemberships.spaceId })
      .from(SpaceMemberships).where(eq(SpaceMemberships.userId, auth.userId));
    const ownedSpaceIds = new Set(ownedSpacesRows.map(s => s.id));
    const memberOf: Array<{ id: string; title: string; color?: string | null; memberCount: number }> = [];

    for (const m of memberRows) {
      if (ownedSpaceIds.has(m.spaceId)) continue;
      const spaceRow = first(await db.select({ id: Spaces.id, title: Spaces.title, color: Spaces.color })
        .from(Spaces).where(and(eq(Spaces.id, m.spaceId), ne(Spaces.type, 'personal'))).limit(1));
      if (spaceRow) {
        const memberCount = await getSpaceMemberCount(spaceRow.id);
        memberOf.push({ id: spaceRow.id, title: spaceRow.title || 'Untitled space', color: spaceRow.color ?? undefined, memberCount });
      }
    }

    return c.json({ owned, memberOf }, 200, { 'Cache-Control': 'private, max-age=0, no-store' });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: '/api/profile/my-shared-spaces', action: 'get_my_shared_spaces' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
