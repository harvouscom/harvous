/**
 * Admin routes — Hono port
 *
 * Endpoints:
 *   POST /api/admin/aggregate-analytics
 *   GET  /api/admin/aggregate-analytics
 *   POST /api/admin/backup-exports
 *   GET  /api/admin/cleanup-duplicate-note-threads
 *   GET  /api/admin/cleanup-duplicate-scripture-refs
 *   GET  /api/admin/check-link-integrity
 *   GET  /api/admin/debug-thread-counts
 *   GET  /api/admin/list-threads
 *   POST /api/admin/backfill-auto-tags
 *   POST /api/admin/regenerate-note-tags
 *   POST /api/admin/spaces/:spaceId/members  (body: { userId } — Harvous system-owned spaces only)
 *   GET  /api/admin/usage/overview
 *   GET  /api/admin/usage/trends
 *   GET  /api/admin/usage/discovery
 *   GET  /api/admin/content/spaces
 *   GET  /api/admin/content/spaces/:spaceId/threads
 *   GET  /api/admin/diagnostics/issues
 *   GET  /api/admin/pulse
 *   GET  /api/admin/reports/catalog
 *   GET  /api/admin/reports/:month
 *   POST /api/admin/reports/generate
 *   GET  /api/admin/reports/season/:seasonId
 *   GET  /api/admin/reports/year/:year
 */

import { Hono } from 'hono';
import { repairMissingNoteThreadJunctionsForUser } from '../utils/thread-junction-repair';
import { getStore } from '@netlify/blobs';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  Spaces,
  Notes,
  NoteThreads,
  NoteTags,
  NoteScriptureReferences,
  ScriptureMetadata,
  Threads,
  Members,
  eq,
  and,
} from '../db';
import { nowISO } from '../db/dates';
import { aggregateMonthlyAnalytics, getCurrentMonth, getPreviousMonth } from '../utils/analytics-aggregator';
import { generateUserExport } from '../utils/export-user-data';
import { validateColor, validateContent, validateTitle } from '@/utils/validation';
import { generateNoteId, generateShareToken, generateSpaceId, generateThreadId, generateTimestampId } from '@/utils/ids';
import { getHarvousSystemUserId, requireHarvousAdmin } from '../utils/harvous-admin';
import {
  canAddMemberToSpaceByOwnerId,
  canOwnerAddOneMoreSharedSpace,
  getSpaceMembershipCount,
  getTierForUserId,
  getTierLimits,
} from '../utils/tier-limits';
import { generateAutoTags, applyAutoTags, regenerateAutoTags, AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN } from '../utils/auto-tag-generator';
import { getUsageOverview, getUsageTrends, getUsageDiscovery } from '../utils/admin-usage-stats';
import { getAdminPulse } from '../utils/admin-pulse-stats';
import {
  generateAdminMonthlyReport,
  getStoredMonthlyReport,
  listAdminReportsCatalog,
  isValidMonthKey,
} from '../utils/admin-report-generator';
import { rollupMonthlyReports } from '../utils/admin-report-rollup';
import {
  exportPayloadToJson,
  exportRowsToCsv,
  reportPayloadToExportRows,
  reportRollupToExportRows,
  yearRollupToJson,
} from '../utils/admin-report-export';
import { getSeasonDisplayName, getSeasonMonths, listSeasonsForYear, isAdminReportMonthInCatalog } from '@/utils/season-helpers';
import { cleanupDuplicateNoteThreads, cleanupDuplicateScriptureRefs } from '../utils/admin-cleanup-duplicates';
import { getAdminContentSpaces, getAdminContentSpaceThreads } from '../utils/admin-content-catalog';
import {
  addSupportTicketNote,
  getSupportTicket,
  listSupportTickets,
  parseSupportTicketListFilter,
  patchSupportTicket,
  validatePatchSupportTicketInput,
} from '../utils/admin-support-tickets';
import { checkAndNotifySupportTickets } from '../utils/support-notify';
import {
  countDiagnosticEventsSince,
  getDiagnosticIssueEvents,
  getDiagnosticIssues,
  updateDiagnosticIssueTriage,
  bulkUpdateDiagnosticIssueTriage,
} from '../utils/admin-diagnostics-stats';
import { isDiagnosticTriageStatus } from '@/utils/diagnostic-sources';

const app = new Hono();

// ─── GET /api/admin/usage/* ─────────────────────────────────────────

app.get('/api/admin/usage/overview', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  try {
    const daysParam = parseInt(c.req.query('days') ?? '30', 10);
    const overview = await getUsageOverview(Number.isFinite(daysParam) ? daysParam : 30);
    return c.json(overview);
  } catch (error: unknown) {
    console.error('[admin usage overview]', error);
    return c.json({ error: 'Failed to load usage overview' }, 500);
  }
});

app.get('/api/admin/usage/trends', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  try {
    const daysParam = parseInt(c.req.query('days') ?? '30', 10);
    const trends = await getUsageTrends(Number.isFinite(daysParam) ? daysParam : 30);
    return c.json(trends);
  } catch (error: unknown) {
    console.error('[admin usage trends]', error);
    return c.json({ error: 'Failed to load usage trends' }, 500);
  }
});

app.get('/api/admin/usage/discovery', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  try {
    const daysParam = parseInt(c.req.query('days') ?? '30', 10);
    const discovery = await getUsageDiscovery(Number.isFinite(daysParam) ? daysParam : 30);
    return c.json(discovery);
  } catch (error: unknown) {
    console.error('[admin usage discovery]', error);
    return c.json({ error: 'Failed to load usage discovery' }, 500);
  }
});

app.get('/api/admin/pulse', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  try {
    const daysParam = parseInt(c.req.query('days') ?? '7', 10);
    const pulse = await getAdminPulse(Number.isFinite(daysParam) ? daysParam : 7);
    return c.json(pulse);
  } catch (error: unknown) {
    console.error('[admin pulse]', error);
    return c.json({ error: 'Failed to load pulse' }, 500);
  }
});

// ─── GET /api/admin/reports/* ───────────────────────────────────────

app.get('/api/admin/reports/catalog', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  try {
    const catalog = await listAdminReportsCatalog();
    return c.json(catalog);
  } catch (error) {
    console.error('[admin reports catalog]', error);
    return c.json({ error: 'Failed to load reports catalog' }, 500);
  }
});

app.post('/api/admin/reports/generate', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  const month = c.req.query('month');
  if (!month || !isValidMonthKey(month)) {
    return c.json({ error: 'Invalid month format. Use YYYY-MM' }, 400);
  }
  try {
    const payload = await generateAdminMonthlyReport(month);
    if (!payload) {
      return c.json({ error: 'Reports are not tracked before June 2026' }, 400);
    }
    return c.json({ success: true, month, payload });
  } catch (error) {
    console.error('[admin reports generate]', error);
    const details = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'Failed to generate report', details }, 500);
  }
});

app.get('/api/admin/reports/season/:seasonId', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  const seasonId = c.req.param('seasonId');
  const format = c.req.query('format') ?? 'json';
  if (!/^((spring|summer|fall|winter)-\d{4})$/.test(seasonId)) {
    return c.json({ error: 'Invalid season id' }, 400);
  }
  try {
    const months = getSeasonMonths(seasonId);
    const payloads = [];
    for (const month of months) {
      const stored = await getStoredMonthlyReport(month);
      if (stored) payloads.push(stored);
    }
    if (payloads.length === 0) {
      return c.json({ error: 'No stored reports for this season' }, 404);
    }
    const rollup = rollupMonthlyReports('season', seasonId, getSeasonDisplayName(seasonId), payloads);
    if (format === 'csv') {
      const csv = exportRowsToCsv(reportRollupToExportRows(rollup));
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="harvous-report-${seasonId}.csv"`,
        },
      });
    }
    return c.json(rollup);
  } catch (error) {
    console.error('[admin reports season]', error);
    return c.json({ error: 'Failed to load season report' }, 500);
  }
});

app.get('/api/admin/reports/year/:year', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  const yearParam = c.req.param('year');
  const year = parseInt(yearParam, 10);
  const format = c.req.query('format') ?? 'json';
  if (!year || year < 2000 || year > 2100) {
    return c.json({ error: 'Invalid year' }, 400);
  }
  try {
    const seasonIds = listSeasonsForYear(year);
    const seasons = [];
    for (const seasonId of seasonIds) {
      const months = getSeasonMonths(seasonId);
      const payloads = [];
      for (const month of months) {
        const stored = await getStoredMonthlyReport(month);
        if (stored) payloads.push(stored);
      }
      seasons.push({
        seasonId,
        seasonName: getSeasonDisplayName(seasonId),
        rollup: payloads.length > 0 ? rollupMonthlyReports('season', seasonId, getSeasonDisplayName(seasonId), payloads) : null,
        months: payloads,
      });
    }
    const hasAny = seasons.some((s) => s.months.length > 0);
    if (!hasAny) {
      return c.json({ error: 'No stored reports for this year' }, 404);
    }
    if (format === 'csv') {
      const rows = seasons.flatMap((s) => (s.rollup ? reportRollupToExportRows(s.rollup) : []));
      const csv = exportRowsToCsv(rows);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="harvous-report-${year}.csv"`,
        },
      });
    }
    return c.json(JSON.parse(yearRollupToJson(year, seasons)));
  } catch (error) {
    console.error('[admin reports year]', error);
    return c.json({ error: 'Failed to load year report' }, 500);
  }
});

app.get('/api/admin/reports/:month', async (c) => {
  const denied = await requireHarvousAdmin(c);
  if (denied) return denied;
  const month = c.req.param('month');
  const format = c.req.query('format') ?? 'json';
  if (!isValidMonthKey(month)) {
    return c.json({ error: 'Invalid month format. Use YYYY-MM' }, 400);
  }
  try {
    const payload = await getStoredMonthlyReport(month);
    if (!payload) {
      return c.json({ error: 'Report not found for this month' }, 404);
    }
    if (format === 'csv') {
      const csv = exportRowsToCsv(reportPayloadToExportRows('month', month, payload));
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="harvous-report-${month}.csv"`,
        },
      });
    }
    if (format === 'json' && c.req.query('download') === '1') {
      return new Response(exportPayloadToJson(payload), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="harvous-report-${month}.json"`,
        },
      });
    }
    return c.json(payload);
  } catch (error) {
    console.error('[admin reports month]', error);
    return c.json({ error: 'Failed to load monthly report' }, 500);
  }
});

// ─── POST/GET /api/admin/aggregate-analytics ──────────────────────────

async function handleAggregateAnalytics(c: any) {
  const auth = getAuth(c);
  const authHeader = c.req.header('authorization')?.split(',')[0]?.trim();
  const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
  const isAuthenticated = !!auth?.userId;
  const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;

  if (expectedToken && !hasValidToken && !isAuthenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!hasValidToken) {
    const denied = await requireHarvousAdmin(c);
    if (denied) return denied;
  }

  const previous = c.req.query('previous') === 'true';
  const monthParam = c.req.query('month');
  // Default: aggregation only (fast). Pass report=1 for legacy single-call full snapshot.
  const includeReport = c.req.query('report') === '1' || c.req.query('report') === 'true';

  let targetMonth: string;
  if (monthParam) {
    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return c.json({ error: 'Invalid month format. Use YYYY-MM' }, 400);
    }
    targetMonth = monthParam;
  } else if (previous) {
    targetMonth = getPreviousMonth();
  } else {
    targetMonth = getCurrentMonth();
  }

  try {
    await aggregateMonthlyAnalytics(targetMonth);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('Error aggregating analytics:', error);
    return c.json(
      {
        success: false,
        month: targetMonth,
        aggregated: false,
        reportGenerated: false,
        error: 'Aggregation failed',
        details,
      },
      500,
    );
  }

  if (!includeReport) {
    return c.json({
      success: true,
      month: targetMonth,
      aggregated: true,
      reportGenerated: false,
      message: `Analytics aggregated for ${targetMonth}. Run report generate for snapshot.`,
    });
  }

  let reportGenerated = false;
  try {
    const report = await generateAdminMonthlyReport(targetMonth);
    reportGenerated = report != null;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('Error generating monthly report:', error);
    return c.json(
      {
        success: false,
        month: targetMonth,
        aggregated: true,
        reportGenerated: false,
        error: 'Monthly report snapshot failed',
        details,
        message: `Analytics aggregated for ${targetMonth}, but report snapshot failed`,
      },
      500,
    );
  }

  return c.json({
    success: true,
    month: targetMonth,
    aggregated: true,
    reportGenerated,
    message: reportGenerated
      ? `Analytics and monthly report generated for ${targetMonth}`
      : `Analytics aggregated for ${targetMonth} (before reports launch; no report snapshot)`,
  });
}

app.post('/api/admin/aggregate-analytics', handleAggregateAnalytics);
app.get('/api/admin/aggregate-analytics', handleAggregateAnalytics);

// ─── POST /api/admin/backup-exports ────────────────────────────────────
// Scheduled job: export each user with notes to Netlify Blob (CSV), then run retention.
// Env: BACKUP_CRON_SECRET. Retention: BACKUP_RETENTION_DAYS (default 30).

const BACKUP_STORE_NAME = 'user-exports';
const DEFAULT_RETENTION_DAYS = 30;

app.post('/api/admin/backup-exports', async (c) => {
  try {
    const secret = process.env.BACKUP_CRON_SECRET;
    const authHeader = c.req.header('authorization')?.split(',')[0]?.trim();
    const hasValidSecret = !!secret && authHeader === `Bearer ${secret}`;
    if (!hasValidSecret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const retentionDays = Math.max(1, parseInt(process.env.BACKUP_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS);
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const store = getStore({ name: BACKUP_STORE_NAME });
    const userIdRows = await db.select({ userId: Notes.userId }).from(Notes);
    const userIds = [...new Set(userIdRows.map((r) => r.userId))];

    let exported = 0;
    const errors: string[] = [];
    for (const userId of userIds) {
      try {
        const { content, fileExtension } = await generateUserExport(userId, 'csv-threads');
        const key = `${userId}/${date}.${fileExtension}`;
        await store.set(key, content, { metadata: { contentType: 'text/csv' } });
        exported++;
      } catch (e) {
        errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    let deleted = 0;
    const listResult = await store.list();
    for (const blob of listResult.blobs ?? []) {
      const key = blob.key;
      const match = key.match(/^[^/]+\/(\d{4}-\d{2}-\d{2})\.(csv|md)$/);
      if (match && match[1] < cutoffStr) {
        await store.delete(key);
        deleted++;
      }
    }

    return c.json({
      success: true,
      date,
      usersWithNotes: userIds.length,
      exported,
      retentionDays,
      deletedOld: deleted,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Backup exports error:', error);
    return c.json({ error: error.message || 'Backup failed', success: false }, 500);
  }
});

// ─── GET /api/admin/cleanup-duplicate-note-threads ────────────────────

app.get('/api/admin/cleanup-duplicate-note-threads', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const dryRun = c.req.query('dryRun') === 'true';
    const result = await cleanupDuplicateNoteThreads(dryRun);
    return c.json(result);
  } catch (error: unknown) {
    console.error('Error during cleanup:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ─── GET /api/admin/cleanup-duplicate-scripture-refs ──────────────────

app.get('/api/admin/cleanup-duplicate-scripture-refs', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const dryRun = c.req.query('dryRun') === 'true';
    const result = await cleanupDuplicateScriptureRefs(dryRun);
    return c.json(result);
  } catch (error: unknown) {
    console.error('Error during cleanup:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ─── GET /api/admin/check-link-integrity ──────────────────────────────

app.get('/api/admin/check-link-integrity', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const dryRun = c.req.query('dryRun') === 'true';

    const report = {
      dryRun,
      threadLinks: {
        missingJunctionsCreated: 0,
        orphanJunctionsRemoved: 0,
        details: [] as Array<{ type: string; noteId: string; threadId: string }>,
      },
      scriptureLinks: {
        missingJunctionsCreated: 0,
        orphanJunctionsRemoved: 0,
        details: [] as Array<{ type: string; noteId: string; scriptureNoteId: string }>,
      },
    };

    // ── Thread link repairs ──────────────────────────────────────────────

    // 1. Notes with a real threadId but no matching NoteThreads row
    const userNotes = await db.select({ id: Notes.id, threadId: Notes.threadId, content: Notes.content, noteType: Notes.noteType, contentEncrypted: Notes.contentEncrypted })
      .from(Notes).where(eq(Notes.userId, auth.userId));

    const userThreads = await db.select({ id: Threads.id }).from(Threads).where(eq(Threads.userId, auth.userId));
    const threadIdSet = new Set(userThreads.map(t => t.id));

    const allNoteThreads = await db.select({ id: NoteThreads.id, noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .where(eq(Notes.userId, auth.userId));

    const noteThreadPairs = new Set(allNoteThreads.map(nt => `${nt.noteId}::${nt.threadId}`));
    const noteIdSet = new Set(userNotes.map(n => n.id));

    if (dryRun) {
      for (const note of userNotes) {
        if (note.threadId && note.threadId !== 'thread_unorganized' && threadIdSet.has(note.threadId)) {
          const key = `${note.id}::${note.threadId}`;
          if (!noteThreadPairs.has(key)) {
            report.threadLinks.details.push({ type: 'missing_junction_created', noteId: note.id, threadId: note.threadId });
            report.threadLinks.missingJunctionsCreated++;
          }
        }
      }
    } else {
      report.threadLinks.missingJunctionsCreated = await repairMissingNoteThreadJunctionsForUser(auth.userId);
    }

    // 2. NoteThreads rows pointing to deleted notes or threads
    for (const nt of allNoteThreads) {
      if (!noteIdSet.has(nt.noteId) || !threadIdSet.has(nt.threadId)) {
        report.threadLinks.details.push({ type: 'orphan_junction_removed', noteId: nt.noteId, threadId: nt.threadId });
        if (!dryRun) {
          await db.delete(NoteThreads).where(eq(NoteThreads.id, nt.id));
        }
        report.threadLinks.orphanJunctionsRemoved++;
      }
    }

    // ── Scripture link repairs ────────────────────────────────────────────

    const allScriptureRefs = await db.select({ id: NoteScriptureReferences.id, noteId: NoteScriptureReferences.noteId, scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(Notes.id, NoteScriptureReferences.noteId))
      .where(eq(Notes.userId, auth.userId));

    const existingScriptureRefPairs = new Set(allScriptureRefs.map(r => `${r.noteId}::${r.scriptureNoteId}`));

    // Also gather scripture refs where this user's notes are the *scripture* side
    const allScriptureRefsAsScripture = await db.select({ id: NoteScriptureReferences.id, noteId: NoteScriptureReferences.noteId, scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(Notes.id, NoteScriptureReferences.scriptureNoteId))
      .where(eq(Notes.userId, auth.userId));

    const allScriptureRefsCombined = [...allScriptureRefs];
    const seenRefIds = new Set(allScriptureRefs.map(r => r.id));
    for (const r of allScriptureRefsAsScripture) {
      if (!seenRefIds.has(r.id)) {
        allScriptureRefsCombined.push(r);
        seenRefIds.add(r.id);
      }
    }

    // 1. Scan note content for data-note-id pills and ensure junctions exist
    const dataNoteidRegex = /data-note-id="([^"]+)"/g;
    const scriptureNoteIds = new Set(userNotes.filter(n => n.noteType === 'scripture').map(n => n.id));

    for (const note of userNotes) {
      if (note.contentEncrypted || !note.content || note.noteType === 'scripture') continue;

      let match: RegExpExecArray | null;
      dataNoteidRegex.lastIndex = 0;
      const referencedIds = new Set<string>();
      while ((match = dataNoteidRegex.exec(note.content)) !== null) {
        const refId = match[1];
        if (refId && refId !== 'pending' && scriptureNoteIds.has(refId)) {
          referencedIds.add(refId);
        }
      }

      for (const scriptureNoteId of referencedIds) {
        const key = `${note.id}::${scriptureNoteId}`;
        if (!existingScriptureRefPairs.has(key)) {
          report.scriptureLinks.details.push({ type: 'missing_junction_created', noteId: note.id, scriptureNoteId });
          if (!dryRun) {
            const id = `note-scripture-heal-${note.id}-${scriptureNoteId}-${Date.now()}`;
            try {
              await db.insert(NoteScriptureReferences).values({ id, noteId: note.id, scriptureNoteId, createdAt: nowISO() });
              report.scriptureLinks.missingJunctionsCreated++;
            } catch {
              // unique constraint = already exists, skip
            }
          } else {
            report.scriptureLinks.missingJunctionsCreated++;
          }
          existingScriptureRefPairs.add(key);
        }
      }
    }

    // 2. NoteScriptureReferences rows pointing to deleted notes
    for (const ref of allScriptureRefsCombined) {
      if (!noteIdSet.has(ref.noteId) || !noteIdSet.has(ref.scriptureNoteId)) {
        report.scriptureLinks.details.push({ type: 'orphan_junction_removed', noteId: ref.noteId, scriptureNoteId: ref.scriptureNoteId });
        if (!dryRun) {
          await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, ref.id));
        }
        report.scriptureLinks.orphanJunctionsRemoved++;
      }
    }

    const totalFixed = report.threadLinks.missingJunctionsCreated + report.threadLinks.orphanJunctionsRemoved +
      report.scriptureLinks.missingJunctionsCreated + report.scriptureLinks.orphanJunctionsRemoved;

    return c.json({
      success: true,
      dryRun,
      message: totalFixed === 0
        ? 'All links are healthy. No repairs needed.'
        : dryRun
          ? `Found ${totalFixed} issues. Run without ?dryRun=true to fix.`
          : `Repaired ${totalFixed} link issues.`,
      report,
    });
  } catch (error: any) {
    console.error('Error checking link integrity:', error);
    return c.json({ success: false, error: error.message || 'Unknown error' }, 500);
  }
});

// ─── GET /api/admin/debug-thread-counts ───────────────────────────────

app.get('/api/admin/debug-thread-counts', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threadId = c.req.query('threadId');
    if (!threadId) return c.json({ error: 'threadId parameter required' }, 400);

    const allNotes = await db.select({ id: Notes.id, title: Notes.title, noteType: Notes.noteType, content: Notes.content })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, auth.userId)))
      ;

    const scriptureDetails = await Promise.all(
      allNotes.filter((n) => n.noteType === 'scripture').map(async (note) => {
        const metadata = first(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id)).limit(1));
        return { id: note.id, title: note.title, reference: metadata?.reference || 'Unknown' };
      })
    );

    const counts = {
      all: allNotes.length,
      default: allNotes.filter((n) => !n.noteType || n.noteType === 'default').length,
      scripture: allNotes.filter((n) => n.noteType === 'scripture').length,
      resource: allNotes.filter((n) => n.noteType === 'resource').length,
    };

    return c.json({
      success: true,
      threadId,
      counts,
      notes: allNotes.map((n) => ({
        id: n.id,
        title: n.title || '(no title)',
        noteType: n.noteType || 'default',
        contentPreview: n.content?.substring(0, 100) || '',
      })),
      scriptureNotes: scriptureDetails,
    });
  } catch (error: any) {
    console.error('Error debugging thread counts:', error);
    return c.json({ success: false, error: error.message || 'Unknown error' }, 500);
  }
});

// ─── GET /api/admin/list-threads ──────────────────────────────────────

app.get('/api/admin/list-threads', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threads = await db.select().from(Threads).where(eq(Threads.userId, auth.userId));

    return c.json({
      success: true,
      userId: auth.userId,
      threadCount: threads.length,
      threads: threads.map((t) => ({ id: t.id, title: t.title, isPinned: t.isPinned })),
    });
  } catch (error: any) {
    console.error('Error listing threads:', error);
    return c.json({ success: false, error: error.message || 'Unknown error' }, 500);
  }
});

// ─── Harvous-curated content catalog ───────────────────────────────────────────

app.get('/api/admin/content/spaces', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const origin = new URL(c.req.url).origin;
    const spaces = await getAdminContentSpaces(systemUserId, origin);
    return c.json({ success: true, spaces });
  } catch (error: unknown) {
    console.error('[admin content spaces]', error);
    return c.json({ error: 'Failed to load curated spaces' }, 500);
  }
});

app.get('/api/admin/content/spaces/:spaceId/threads', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const spaceId = c.req.param('spaceId');
    if (!spaceId) return c.json({ error: 'Space ID is required' }, 400);

    const threads = await getAdminContentSpaceThreads(systemUserId, spaceId);
    if (threads === null) return c.json({ error: 'Space not found' }, 404);

    return c.json({ success: true, spaceId, threads });
  } catch (error: unknown) {
    console.error('[admin content threads]', error);
    return c.json({ error: 'Failed to load threads' }, 500);
  }
});

// ─── Harvous-curated content admin endpoints ───────────────────────────────────

app.post('/api/admin/spaces', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const body = await c.req.json().catch(() => ({} as any));

    const title = typeof body.title === 'string' ? body.title : '';
    const description = typeof body.description === 'string' ? body.description : null;
    const color = typeof body.color === 'string' && body.color ? body.color : 'paper';
    const isFeatured = body.isFeatured === true;

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const now = nowISO();
    const capitalizedTitle = title.trim().charAt(0).toUpperCase() + title.trim().slice(1);
    const shareToken = generateShareToken();

    const space = first(
      await db
        .insert(Spaces)
        .values({
          id: generateSpaceId(),
          title: capitalizedTitle,
          description,
          color,
          backgroundGradient: null,
          userId: systemUserId,
          isPublic: true,
          isFeatured,
          isActive: true,
          order: 0,
          shareToken,
          shareTokenCreatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )!;

    const origin = new URL(c.req.url).origin;
    return c.json({
      success: true,
      space,
      joinUrl: `${origin}/spaces/join/${shareToken}`,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Error creating space' }, 500);
  }
});

app.post('/api/admin/spaces/:spaceId/threads', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const spaceId = c.req.param('spaceId');
    if (!spaceId) return c.json({ error: 'Space ID is required' }, 400);

    const space = first(
      await db
        .select({ id: Spaces.id, userId: Spaces.userId })
        .from(Spaces)
        .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, systemUserId)))
        .limit(1),
    );
    if (!space) return c.json({ error: 'Space not found' }, 404);

    const body = await c.req.json().catch(() => ({} as any));
    const title = typeof body.title === 'string' ? body.title : '';
    const subtitle = typeof body.subtitle === 'string' ? body.subtitle : null;
    const color = typeof body.color === 'string' && body.color ? body.color : null;

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const now = nowISO();
    const capitalizedTitle = title.trim().charAt(0).toUpperCase() + title.trim().slice(1);

    const thread = first(
      await db
        .insert(Threads)
        .values({
          id: generateThreadId(),
          title: capitalizedTitle,
          subtitle,
          spaceId,
          userId: systemUserId,
          isPublic: false,
          isPinned: false,
          color,
          order: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )!;

    return c.json({ success: true, thread });
  } catch (error: any) {
    return c.json({ error: error.message || 'Error creating thread' }, 500);
  }
});

/** Add a Clerk user as member of a Harvous system-owned space (curated / Easter, etc.). */
app.post('/api/admin/spaces/:spaceId/members', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const spaceId = c.req.param('spaceId');
    if (!spaceId) return c.json({ error: 'Space ID is required' }, 400);

    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return c.json({ error: 'userId is required' }, 400);

    const space = first(
      await db
        .select()
        .from(Spaces)
        .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, systemUserId)))
        .limit(1),
    );
    if (!space) {
      return c.json({ error: 'Space not found or not owned by Harvous system user' }, 404);
    }

    if (space.userId === userId) {
      return c.json({ error: 'User is already the space owner' }, 400);
    }

    const existing = first(
      await db
        .select()
        .from(Members)
        .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
        .limit(1),
    );
    if (existing) {
      return c.json({ success: true, alreadyMember: true, spaceId, userId });
    }

    const memberCheck = await canAddMemberToSpaceByOwnerId(spaceId, systemUserId);
    if (!memberCheck.allowed) {
      return c.json({ error: memberCheck.reason, code: 'MEMBER_LIMIT_EXCEEDED' }, 403);
    }

    const sharedCheck = await canOwnerAddOneMoreSharedSpace(systemUserId, spaceId);
    if (!sharedCheck.allowed) {
      return c.json({ error: sharedCheck.reason, code: 'SHARED_SPACE_LIMIT_EXCEEDED' }, 403);
    }

    const granteeTier = await getTierForUserId(userId);
    const granteeLimits = getTierLimits(granteeTier);
    if (granteeLimits.joinableSpaces !== Infinity) {
      const membershipCount = await getSpaceMembershipCount(userId);
      if (membershipCount >= granteeLimits.joinableSpaces) {
        return c.json(
          {
            error: `That user is at their limit of ${granteeLimits.joinableSpaces} joined spaces for their plan.`,
            code: 'JOIN_LIMIT_EXCEEDED',
          },
          403,
        );
      }
    }

    const now = nowISO();
    const member = first(
      await db
        .insert(Members)
        .values({
          id: `member_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          spaceId,
          userId,
          role: 'member',
          joinedAt: now,
          createdAt: now,
        })
        .returning(),
    )!;

    return c.json({ success: true, spaceId, userId, member });
  } catch (error: any) {
    return c.json({ error: error.message || 'Error adding member' }, 500);
  }
});

app.post('/api/admin/threads/:threadId/notes', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const threadId = c.req.param('threadId');
    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);

    const thread = first(
      await db
        .select({ id: Threads.id, spaceId: Threads.spaceId, userId: Threads.userId })
        .from(Threads)
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, systemUserId)))
        .limit(1),
    );
    if (!thread) return c.json({ error: 'Thread not found' }, 404);

    const body = await c.req.json().catch(() => ({} as any));
    const title = typeof body.title === 'string' ? body.title : null;
    const content = typeof body.content === 'string' ? body.content : '';
    const noteType = typeof body.noteType === 'string' ? body.noteType : 'default';

    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);
    if (title != null) {
      const titleValidation = validateTitle(title, false);
      if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    }

    const now = nowISO();
    const note = first(
      await db
        .insert(Notes)
        .values({
          id: generateNoteId(),
          title,
          content,
          noteType,
          threadId,
          spaceId: thread.spaceId ?? null,
          userId: systemUserId,
          isPublic: false,
          isFeatured: false,
          order: 0,
          addedBy: 'harvous',
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )!;

    // Ensure junction exists for the thread (most code expects it).
    await db
      .insert(NoteThreads)
      .values({ id: generateTimestampId('notethread'), noteId: note.id, threadId, createdAt: now })
      .onConflictDoNothing();

    try {
      const tagResult = await generateAutoTags(title || '', content, systemUserId, AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN);
      if (tagResult.suggestions.length > 0) {
        await applyAutoTags(note.id, tagResult.suggestions, systemUserId);
      }
    } catch (tagErr: unknown) {
      console.error('[admin create note] auto-tags failed (non-critical):', tagErr instanceof Error ? tagErr.message : tagErr);
    }

    return c.json({ success: true, note });
  } catch (error: any) {
    return c.json({ error: error.message || 'Error creating note' }, 500);
  }
});

// ─── POST /api/admin/regenerate-note-tags ───────────────────────────────
// Re-apply keyword auto-tags for one Harvous-owned note (server-loaded content).

app.post('/api/admin/regenerate-note-tags', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
    if (!noteId) return c.json({ error: 'noteId is required' }, 400);

    const note = first(
      await db
        .select({
          id: Notes.id,
          title: Notes.title,
          content: Notes.content,
          contentEncrypted: Notes.contentEncrypted,
          userId: Notes.userId,
        })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1),
    );
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== systemUserId) {
      return c.json({ error: 'Note is not Harvous system-owned content' }, 403);
    }
    if (note.contentEncrypted) {
      return c.json({ error: 'Cannot regenerate tags for encrypted notes' }, 400);
    }

    const { applied, errors, suggestionCount } = await regenerateAutoTags(
      note.id,
      note.title ?? '',
      note.content ?? '',
      systemUserId,
      AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN,
      { removeAllNoteTagLinks: true },
    );

    return c.json({
      success: true,
      applied,
      suggestionCount,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error('[admin regenerate-note-tags]', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

// ─── POST /api/admin/backfill-auto-tags ───────────────────────────────
// Re-run keyword auto-tags for Harvous system user notes (e.g. thin content or
// older notes). Harvous Admin only.

app.post('/api/admin/backfill-auto-tags', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const systemUserId = getHarvousSystemUserId();
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dryRun === true;
    const minConfidence =
      typeof body.minConfidence === 'number' && body.minConfidence >= 0 && body.minConfidence <= 1
        ? body.minConfidence
        : AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN;
    const onlyWithoutTags = body.onlyWithoutTags !== false;
    const noteIdsFilter = Array.isArray(body.noteIds)
      ? (body.noteIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : null;

    const allNotes = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        contentEncrypted: Notes.contentEncrypted,
      })
      .from(Notes)
      .where(eq(Notes.userId, systemUserId));

    let candidates = allNotes.filter((n) => !n.contentEncrypted);
    if (noteIdsFilter && noteIdsFilter.length > 0) {
      const idSet = new Set(noteIdsFilter);
      candidates = candidates.filter((n) => idSet.has(n.id));
    }

    if (onlyWithoutTags) {
      const taggedRows = await db
        .select({ noteId: NoteTags.noteId })
        .from(NoteTags)
        .innerJoin(Notes, eq(Notes.id, NoteTags.noteId))
        .where(eq(Notes.userId, systemUserId));
      const taggedSet = new Set(taggedRows.map((r) => r.noteId));
      candidates = candidates.filter((n) => !taggedSet.has(n.id));
    }

    const details: Array<{
      noteId: string;
      title: string | null;
      suggestionCount: number;
      keywords: string[];
      applied: number;
    }> = [];
    let notesWithSuggestions = 0;
    let totalApplied = 0;

    for (const note of candidates) {
      const result = await generateAutoTags(note.title || '', note.content || '', systemUserId, minConfidence);
      const keywords = result.suggestions.map((s) => s.keyword);

      if (result.suggestions.length === 0) {
        details.push({
          noteId: note.id,
          title: note.title ?? null,
          suggestionCount: 0,
          keywords: [],
          applied: 0,
        });
        continue;
      }

      notesWithSuggestions++;

      if (dryRun) {
        details.push({
          noteId: note.id,
          title: note.title ?? null,
          suggestionCount: result.suggestions.length,
          keywords,
          applied: 0,
        });
        continue;
      }

      const { applied } = await applyAutoTags(note.id, result.suggestions, systemUserId);
      totalApplied += applied;
      details.push({
        noteId: note.id,
        title: note.title ?? null,
        suggestionCount: result.suggestions.length,
        keywords,
        applied,
      });
    }

    return c.json({
      success: true,
      dryRun,
      minConfidence,
      onlyWithoutTags,
      candidateCount: candidates.length,
      notesWithSuggestions,
      totalApplied: dryRun ? 0 : totalApplied,
      details,
    });
  } catch (error: unknown) {
    console.error('[admin backfill-auto-tags]', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

// ─── GET/PATCH /api/admin/support/tickets ─────────────────────────────────────

app.get('/api/admin/support/tickets', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const status = parseSupportTicketListFilter(c.req.query('status') ?? undefined);
    const limitParam = parseInt(c.req.query('limit') ?? '50', 10);
    const offsetParam = parseInt(c.req.query('offset') ?? '0', 10);
    const limit = Number.isFinite(limitParam) ? limitParam : 50;
    const offset = Number.isFinite(offsetParam) ? offsetParam : 0;
    const result = await listSupportTickets(status, limit, offset);
    return c.json({ success: true, status, ...result });
  } catch (error: unknown) {
    console.error('[admin support tickets list]', error);
    return c.json({ error: 'Failed to load support tickets' }, 500);
  }
});

app.get('/api/admin/support/tickets/:id', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const id = c.req.param('id')?.trim() ?? '';
    if (!id) return c.json({ error: 'id is required' }, 400);
    const ticket = await getSupportTicket(id);
    if (!ticket) return c.json({ error: 'Ticket not found' }, 404);
    return c.json({ success: true, ticket });
  } catch (error: unknown) {
    console.error('[admin support ticket detail]', error);
    return c.json({ error: 'Failed to load support ticket' }, 500);
  }
});

app.patch('/api/admin/support/tickets/:id', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const id = c.req.param('id')?.trim() ?? '';
    if (!id) return c.json({ error: 'id is required' }, 400);

    const body = await c.req.json().catch(() => null);
    const patch = validatePatchSupportTicketInput(body);
    if (!patch) return c.json({ error: 'Invalid patch payload' }, 400);

    const ticket = await patchSupportTicket(id, patch);
    if (!ticket) return c.json({ error: 'Ticket not found' }, 404);
    return c.json({ success: true, ticket });
  } catch (error: unknown) {
    console.error('[admin support ticket patch]', error);
    return c.json({ error: 'Failed to update support ticket' }, 500);
  }
});

const MAX_SUPPORT_NOTE_LENGTH = 2000;

app.post('/api/admin/support/tickets/:id/notes', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const id = c.req.param('id')?.trim() ?? '';
    if (!id) return c.json({ error: 'id is required' }, 400);

    const body = await c.req.json().catch(() => null);
    const note = typeof (body as { note?: unknown })?.note === 'string' ? (body as { note: string }).note.trim() : '';
    if (!note || note.length > MAX_SUPPORT_NOTE_LENGTH) {
      return c.json({ error: 'Invalid note' }, 400);
    }

    const ticket = await addSupportTicketNote(id, note);
    if (!ticket) return c.json({ error: 'Ticket not found' }, 404);
    return c.json({ success: true, ticket });
  } catch (error: unknown) {
    console.error('[admin support ticket add note]', error);
    return c.json({ error: 'Failed to add note' }, 500);
  }
});

// ─── POST/GET /api/admin/support/notify-check (cron: hourly Slack ping) ───────

async function handleSupportNotifyCheck(c: any) {
  // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
  const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
  const expectedToken = process.env.SUPPORT_NOTIFY_SECRET_TOKEN;
  const auth = getAuth(c);
  const isAuthenticated = !!auth?.userId;
  const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;

  if (expectedToken && !hasValidToken && !isAuthenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (!expectedToken) {
    const gate = await requireHarvousAdmin(c);
    if (gate) return gate;
  }

  try {
    const result = await checkAndNotifySupportTickets();
    return c.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('[admin support notify-check]', error);
    return c.json({ error: 'Failed to run notify-check' }, 500);
  }
}

app.post('/api/admin/support/notify-check', handleSupportNotifyCheck);
app.get('/api/admin/support/notify-check', handleSupportNotifyCheck);

// ─── GET/PATCH /api/admin/diagnostics/* ───────────────────────────────────────

app.get('/api/admin/diagnostics/issues', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const daysParam = parseInt(c.req.query('days') ?? '7', 10);
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 7;
    const includeDev = c.req.query('includeDev') === '1';
    const sourceEnv = includeDev ? undefined : 'prod';
    const issues = await getDiagnosticIssues(days, sourceEnv);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const eventsLast24h = await countDiagnosticEventsSince(since24h, sourceEnv);
    const openCount = issues.filter((i) => i.status === 'open').length;
    return c.json({ success: true, days, openCount, eventsLast24h, issues });
  } catch (error: unknown) {
    console.error('[admin diagnostics issues]', error);
    return c.json({ error: 'Failed to load diagnostic issues' }, 500);
  }
});

app.get('/api/admin/diagnostics/issues/:signature/events', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const signature = c.req.param('signature')?.trim() ?? '';
    if (!signature) return c.json({ error: 'signature is required' }, 400);
    const limitParam = parseInt(c.req.query('limit') ?? '20', 10);
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const events = await getDiagnosticIssueEvents(signature, limit);
    return c.json({ success: true, issueSignature: signature, events });
  } catch (error: unknown) {
    console.error('[admin diagnostics events]', error);
    return c.json({ error: 'Failed to load diagnostic events' }, 500);
  }
});

app.patch('/api/admin/diagnostics/issues/bulk', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const status = typeof body.status === 'string' ? body.status : '';
    if (!isDiagnosticTriageStatus(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    const raw = body.signatures;
    const signatures = Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === 'string').map((s) => s.trim()).filter(Boolean)
      : [];
    if (signatures.length === 0) {
      return c.json({ error: 'signatures array is required' }, 400);
    }
    const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes : null;
    const updated = await bulkUpdateDiagnosticIssueTriage(signatures, status, adminNotes);
    return c.json({ success: true, updated, status });
  } catch (error: unknown) {
    console.error('[admin diagnostics bulk triage]', error);
    return c.json({ error: 'Failed to update triage' }, 500);
  }
});

app.patch('/api/admin/diagnostics/issues/:signature', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const signature = c.req.param('signature')?.trim() ?? '';
    if (!signature) return c.json({ error: 'signature is required' }, 400);

    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const status = typeof body.status === 'string' ? body.status : '';
    if (!isDiagnosticTriageStatus(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes : null;

    await updateDiagnosticIssueTriage(signature, status, adminNotes);
    return c.json({ success: true, issueSignature: signature, status });
  } catch (error: unknown) {
    console.error('[admin diagnostics triage]', error);
    return c.json({ error: 'Failed to update triage' }, 500);
  }
});

export default app;
