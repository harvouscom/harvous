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
 *   POST /api/user/update-church
 *   POST /api/user/update-credentials
 *   POST /api/user/update-profile
 *   GET  /api/user/xp
 *   GET  /api/user/get-profile
 *   POST /api/user/migrate-to-prototype
 *   GET  /api/user/migrate-to-prototype/status
 *   GET  /api/user/locked-notes
 *   POST /api/user/verify-lock-pin
 *   POST /api/user/set-lock-pin
 *   GET  /api/user/can-create-space
 *   GET  /api/user/can-join-space
 *   GET  /api/user/limits
 *   POST /api/user/import
 *   GET  /api/profile/my-sharing
 *   GET  /api/profile/my-shared-spaces
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db, first, Notes, Threads, Spaces, Tags, NoteTags, NoteThreads, UserMetadata,
  UserXP, Comments, ScriptureMetadata, Members, NoteScriptureReferences, ResourceMetadata,
  StudyThreadEntries, NoteConnections,
  eq, and, or, desc, asc, isNotNull, isNull, sql, inArray,
} from '../db';
import { nowISO } from '../db/dates';

// Server-ported utilities
import { getCachedUserData, invalidateUserCache } from '../utils/user-cache';
import {
  getSeasonalXP, getLifetimeXP, checkLifetimeMilestones, getAllSeasonalXP,
  awardMonthlyAttendanceXP, awardSessionXP, awardChurchAddedXP,
  calculateTotalXP, getXPBreakdown, backfillUserXP,
} from '../utils/xp-system';
import { calculateSessionXP, type SessionData } from '../utils/session-tracker';
import { canCreateSharedSpace, canJoinSpace, getUserLimitsInfo, getSpaceMemberCount } from '../utils/tier-limits';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';

// Pure @/utils (no astro:db)
import { getSeasonDisplayName, getCurrentSeason } from '@/utils/season-helpers';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit, tryConsumeNoteCreates, getClientIP } from '@/utils/rate-limit';
import { validateName, validateColor } from '@/utils/validation';
import { hashPinNew, validatePinFormat, verifyPin } from '@/utils/lock-pin-server';
import { htmlToMarkdown, htmlToPlainText } from '@/utils/html-to-markdown';
import { generateUserExport, generateUserBackupZip, type ExportFormat } from '../utils/export-user-data';
import { generateNoteId, generateThreadId, generateStudyThreadEntryId } from '@/utils/ids';
import { THREAD_COLORS } from '@/utils/colors';
import { parseImportFiles, type ParsedImportRow } from '../utils/parse-import-files';
import type { ParsedMarkdownNote } from '@/utils/markdown-import-parser';
import type { ParsedCSVNote } from '@/utils/csv-parser';
import { markdownToHtml } from '@/utils/markdown-to-html';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';
import { deleteNotesCascadeForUser } from '../utils/delete-note-cascade';
import { getOrCreateTag } from '../utils/tag-helpers';
import { serializeNoteSecondaryCollections } from '../utils/note-secondary-collections';
import {
  runPrototypeUserMigration,
  userNeedsCollectionBackfill,
} from '../utils/prototype-user-migration';
import { isNoteConnectionsTableMissing } from '../utils/pg-undefined-relation';

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
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
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
      await db.delete(Members).where(eq(Members.spaceId, space.id));
    }
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

// ─── POST /api/user/update-church ────────────────────────────────────────────

app.post('/api/user/update-church', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { churchName, churchCity, churchState, churchCountry } = body;

    const normalizedChurchName = typeof churchName === 'string' ? (churchName.trim() || null) : (churchName ?? null);
    const normalizedChurchCity = typeof churchCity === 'string' ? (churchCity.trim() || null) : (churchCity ?? null);
    const normalizedChurchState = typeof churchState === 'string' ? (churchState.trim() || null) : (churchState ?? null);
    const normalizedChurchCountry = typeof churchCountry === 'string' ? (churchCountry.trim() || null) : (churchCountry ?? null);

    const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1);

    if (existingRecord.length > 0) {
      const existing = existingRecord[0];
      const isFirstTimeAddingChurch = !existing.churchName && !existing.churchCity && !existing.churchState && !existing.churchCountry &&
        (normalizedChurchName || normalizedChurchCity || normalizedChurchState || normalizedChurchCountry);

      await db.update(UserMetadata).set({
        churchName: normalizedChurchName,
        churchCity: normalizedChurchCity,
        churchState: normalizedChurchState,
        churchCountry: normalizedChurchCountry,
        churchAddedAt: isFirstTimeAddingChurch ? nowISO() : existing.churchAddedAt,
        updatedAt: nowISO()
      }).where(eq(UserMetadata.userId, auth.userId));

      if (isFirstTimeAddingChurch) {
        await awardChurchAddedXP(auth.userId);
      }
    } else {
      const hasChurchData = normalizedChurchName || normalizedChurchCity || normalizedChurchState || normalizedChurchCountry;
      await db.insert(UserMetadata).values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        churchName: normalizedChurchName,
        churchCity: normalizedChurchCity,
        churchState: normalizedChurchState,
        churchCountry: normalizedChurchCountry,
        churchAddedAt: hasChurchData ? nowISO() : null,
        highestSimpleNoteId: 0,
        userColor: 'blue',
        createdAt: nowISO(),
        updatedAt: nowISO()
      });
      if (hasChurchData) await awardChurchAddedXP(auth.userId);
    }

    return c.json({
      success: true, message: 'Church information updated',
      church: { churchName: normalizedChurchName, churchCity: normalizedChurchCity, churchState: normalizedChurchState, churchCountry: normalizedChurchCountry }
    });
  } catch (error) {
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

    let churchData = { churchName: null as string | null, churchCity: null as string | null, churchState: null as string | null, churchCountry: null as string | null };
    let defaultTranslation = 'NET';
    try {
      const um = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
      if (um) {
        churchData = { churchName: um.churchName ?? null, churchCity: um.churchCity ?? null, churchState: um.churchState ?? null, churchCountry: um.churchCountry ?? null };
        defaultTranslation = um.defaultTranslation ?? 'NET';
      }
    } catch (_) { /* non-fatal */ }

    let hasLockPinSet = false;
    try {
      const lockMeta = first(await db.select({ lockPinHash: UserMetadata.lockPinHash })
        .from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
      hasLockPinSet = !!(lockMeta?.lockPinHash);
    } catch (_) { /* non-fatal */ }

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
      churchName: churchData.churchName, churchCity: churchData.churchCity, churchState: churchData.churchState, churchCountry: churchData.churchCountry,
      defaultTranslation,
      hasLockPinSet
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/get-profile', action: 'get_user_profile' });
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

    return c.json({ notes: result });
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
    const auth = getAuthenticatedAuth(c);

    const canJoin = await canJoinSpace(auth.userId, auth);
    return c.json(canJoin);
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
    let notesImported = 0, threadsCreated = 0, tagsCreated = 0, duplicatesSkipped = 0, highlightsImported = 0;
    const errors: string[] = [];
    const createdThreadIds = new Set<string>();
    const createdFolders = new Set<string>();
    // Map portable note id (from frontmatter/manifest) → newly inserted note id, for connection restore.
    const sourceIdToNewId = new Map<string, string>();

    for (let i = 0; i < allParsedNotes.length; i++) {
      try {
        const { note: parsedNote, portableBuild, primaryCollection, secondaryCollections } = allParsedNotes[i];
        let title: string | null = null, content = '', threadColor: string | null = null;
        let tags: string[] = [], createdDate: Date = new Date();
        let scriptureReference: string | null = null, scriptureTranslation: string | null = null;
        let sourceId: string | null = null;
        // Folders come from frontmatter/directory structure (resolved in parseImportFiles).
        const threadName: string | null = primaryCollection;

        if (format === 'csv-threads') {
          const csvNote = parsedNote as ParsedCSVNote;
          title = csvNote.noteTitle || null; content = csvNote.content;
          threadColor = csvNote.threadColor || null;
          tags = csvNote.tags || [];
          createdDate = parseExportDate(csvNote.createdDate);
        } else {
          const mdNote = parsedNote as ParsedMarkdownNote;
          title = mdNote.title || null;
          sourceId = mdNote.portable?.meta.id || null;
          if (portableBuild) {
            content = portableBuild.htmlContent;
          } else {
            content = markdownToHtml(mdNote.content);
          }
          if (mdNote.threadColor && THREAD_COLORS.includes(mdNote.threadColor as any)) {
            threadColor = mdNote.threadColor;
          }
          tags = mdNote.tags || [];
          createdDate = parseExportDate(mdNote.createdDate);
          scriptureReference = mdNote.scriptureReference || null;
          scriptureTranslation = mdNote.scriptureTranslation || null;
        }

        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : null;

        if (await isDuplicateNote(auth.userId, capitalizedTitle, capitalizedContent)) { duplicatesSkipped++; continue; }

        const slot = tryConsumeNoteCreates(auth.userId, getClientIP(c.req.raw), 1);
        if (!slot.allowed) {
          errors.push(`Import paused: ${slot.error}`);
          break;
        }

        const threadId = await getOrCreateThread(auth.userId, threadName || '', threadColor);
        if (!createdThreadIds.has(threadId) && threadId !== 'thread_unorganized') { createdThreadIds.add(threadId); threadsCreated++; }

        const nextSimpleNoteId: number = i === 0 ? effectiveHighest + 1 : (userMetadata!.highestSimpleNoteId ?? 0) + 1;
        let noteType: 'default' | 'scripture' | 'resource' = scriptureReference ? 'scripture' : 'default';

        const secondarySerialized = serializeNoteSecondaryCollections(secondaryCollections);
        const newNote = first(await db.insert(Notes).values({
          id: generateNoteId(), content: capitalizedContent, title: capitalizedTitle,
          threadId: 'thread_unorganized', spaceId: null, simpleNoteId: nextSimpleNoteId,
          noteType, userId: auth.userId, isPublic: false, createdAt: createdDate, contentEncrypted: false,
          // Modern folder system (what the 2.0 UI displays). Explicit folders mark an override
          // so auto-collection suggestion doesn't reshuffle the user's imported structure.
          primaryCollection: primaryCollection || null,
          secondaryCollections: secondarySerialized,
          collectionUserOverride: !!primaryCollection,
        }).returning())!;

        if (sourceId) sourceIdToNewId.set(sourceId, newNote.id);
        if (primaryCollection) createdFolders.add(primaryCollection);
        for (const sc of secondaryCollections) createdFolders.add(sc);

        await db.update(UserMetadata).set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
          .where(eq(UserMetadata.userId, auth.userId));
        userMetadata = { ...userMetadata!, highestSimpleNoteId: nextSimpleNoteId };

        if (threadId !== 'thread_unorganized') {
          await db.insert(NoteThreads).values({
            id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            noteId: newNote.id, threadId, createdAt: nowISO()
          });
          await db.update(Threads).set({ updatedAt: nowISO() })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
        }

        // Resolve tag ids (sequential for dedup) then insert the note↔tag rows in one batch.
        const noteTagRows: (typeof NoteTags.$inferInsert)[] = [];
        const seenTagIds = new Set<string>();
        for (const tagName of tags) {
          try {
            const { tagId, created: tagCreated } = await getOrCreateTag(auth.userId, tagName);
            if (tagCreated) tagsCreated++;
            if (seenTagIds.has(tagId)) continue;
            seenTagIds.add(tagId);
            noteTagRows.push({
              id: `note-tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              noteId: newNote.id, tagId, isAutoGenerated: false, confidence: null, createdAt: nowISO(),
            });
          } catch (tagError) { errors.push(`Failed to create tag "${tagName}" for note ${i + 1}`); }
        }
        if (noteTagRows.length > 0) {
          try { await db.insert(NoteTags).values(noteTagRows); }
          catch (tagError) { errors.push(`Failed to attach tags for note ${i + 1}`); }
        }

        if (scriptureReference && noteType === 'scripture') {
          try {
            const parsed = parseScriptureReference(scriptureReference);
            if (parsed) {
              const verse = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
              const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
              await db.insert(ScriptureMetadata).values({
                id: `scripture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                noteId: newNote.id, reference: scriptureReference, book: parsed.book,
                chapter: parsed.chapter, verse, verseEnd, translation: scriptureTranslation || 'NET',
                originalText: '', createdAt: nowISO()
              });
            }
          } catch (err) { errors.push(`Failed to create scripture metadata for note ${i + 1}`); }
        }

        if (portableBuild && portableBuild.studyInserts.length > 0) {
          try {
            for (const row of portableBuild.studyInserts) {
              await db.insert(StudyThreadEntries).values({
                ...row,
                parentNoteId: newNote.id,
                userId: auth.userId,
              });
              highlightsImported++;
            }
          } catch (err) {
            errors.push(`Failed to import highlights for note ${i + 1}`);
          }
        }

        notesImported++;
      } catch (noteError) {
        errors.push(`Failed to import note ${i + 1}: ${noteError instanceof Error ? noteError.message : 'Unknown error'}`);
      }
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

    return c.json({ success: true, notesImported, threadsCreated, tagsCreated, foldersCreated: createdFolders.size, duplicatesSkipped, highlightsImported, connectionsImported, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    console.error('Import error:', error);
    return c.json({ error: error.message || 'Failed to import data' }, 500);
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
      db.select({ id: Notes.id, title: Notes.title, content: Notes.content, shareToken: Notes.shareToken })
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
        return {
          id: n.id, title: title.length > 80 ? title.slice(0, 77) + '...' : title,
          shareToken: n.shareToken, shareUrl: `${origin}/shared/note/${n.shareToken}`
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
      id: Spaces.id, title: Spaces.title, color: Spaces.color, shareToken: Spaces.shareToken
    }).from(Spaces).where(eq(Spaces.userId, auth.userId))
      .orderBy(
        asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Spaces.lastVisited)
      );

    const owned: Array<{ id: string; title: string; color?: string | null; memberCount: number; shareToken?: string | null; shareUrl?: string }> = [];
    for (const space of ownedSpacesRows) {
      const memberCount = await getSpaceMemberCount(space.id);
      const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
      if (memberCount > 0 || hasShareLink) {
        owned.push({
          id: space.id, title: space.title || 'Untitled space', color: space.color ?? undefined,
          memberCount, shareToken: space.shareToken ?? undefined,
          shareUrl: space.shareToken ? `${origin}/spaces/join/${space.shareToken}` : undefined
        });
      }
    }

    const memberships = await db.select({ spaceId: Members.spaceId }).from(Members).where(eq(Members.userId, auth.userId));
    const ownedSpaceIds = new Set(ownedSpacesRows.map(s => s.id));
    const memberOf: Array<{ id: string; title: string; color?: string | null; memberCount: number }> = [];

    for (const m of memberships) {
      if (ownedSpaceIds.has(m.spaceId)) continue;
      const spaceRow = first(await db.select({ id: Spaces.id, title: Spaces.title, color: Spaces.color })
        .from(Spaces).where(eq(Spaces.id, m.spaceId)).limit(1));
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

// ─── Import helper functions ─────────────────────────────────────────────────

function getFolderPath(file: File): string | null {
  const relativePath = (file as any).webkitRelativePath;
  if (relativePath) {
    const pathParts = relativePath.split('/');
    if (pathParts.length > 1) { pathParts.pop(); return pathParts.join('/'); }
  }
  const fileName = file.name || '';
  if (fileName.includes('/')) { const parts = fileName.split('/'); parts.pop(); return parts.join('/'); }
  return null;
}


function parseExportDate(dateString: string | null): Date {
  if (!dateString) return new Date();
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getThreadColorFromTitle(threadTitle: string): string {
  const availableColors = THREAD_COLORS.filter(color => color !== 'paper');
  let hash = 0;
  for (let i = 0; i < threadTitle.length; i++) {
    hash = ((hash << 5) - hash) + threadTitle.charCodeAt(i);
    hash = hash & hash;
  }
  return availableColors[Math.abs(hash) % availableColors.length];
}

async function getOrCreateThread(userId: string, threadTitle: string, threadColor?: string | null): Promise<string> {
  if (!threadTitle || threadTitle.trim() === '' || isMyPileDisplayTitle(threadTitle)) {
    await ensureUnorganizedThread(userId);
    return 'thread_unorganized';
  }
  const existingThread = first(await db.select().from(Threads)
    .where(and(eq(Threads.userId, userId), eq(Threads.title, threadTitle.trim()))).limit(1));
  if (existingThread) return existingThread.id;

  const capitalizedTitle = threadTitle.trim().charAt(0).toUpperCase() + threadTitle.trim().slice(1);
  let finalColor: string | null = null;
  if (threadColor && THREAD_COLORS.includes(threadColor as any)) finalColor = threadColor;
  else finalColor = getThreadColorFromTitle(threadTitle.trim());

  const newThread = first(await db.insert(Threads).values({
    id: generateThreadId(), title: capitalizedTitle, subtitle: null, spaceId: null,
    userId, isPublic: false, color: finalColor, isPinned: false, createdAt: nowISO(),
  }).returning())!;
  return newThread.id;
}

async function isDuplicateNote(userId: string, title: string | null, content: string): Promise<boolean> {
  const normalizedContent = htmlToPlainText(content).toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedTitle = (title || '').toLowerCase().trim();

  const existingNotes = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content })
    .from(Notes).where(eq(Notes.userId, userId));

  for (const note of existingNotes) {
    const et = (note.title || '').toLowerCase().trim();
    const ec = htmlToPlainText(note.content || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (et === normalizedTitle && ec === normalizedContent) return true;
  }
  return false;
}

export default app;
