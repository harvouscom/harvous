/**
 * Admin routes — Hono port
 *
 * Endpoints:
 *   POST /api/admin/aggregate-analytics
 *   GET  /api/admin/aggregate-analytics
 *   POST /api/admin/backup-exports
 *   GET  /api/admin/cleanup-duplicate-note-threads
 *   GET  /api/admin/cleanup-duplicate-scripture-refs
 *   GET  /api/admin/debug-thread-counts
 *   GET  /api/admin/list-threads
 */

import { Hono } from 'hono';
import { getStore } from '@netlify/blobs';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  Notes,
  NoteThreads,
  NoteScriptureReferences,
  ScriptureMetadata,
  Threads,
  eq,
  and,
} from '../db';
import { aggregateMonthlyAnalytics, getCurrentMonth, getPreviousMonth } from '../utils/analytics-aggregator';
import { generateUserExport } from '../utils/export-user-data';

const app = new Hono();

// ─── POST/GET /api/admin/aggregate-analytics ──────────────────────────

async function handleAggregateAnalytics(c: any) {
  try {
    const auth = getAuth(c);
    const authHeader = c.req.header('authorization');
    const expectedToken = process.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const isAuthenticated = !!auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;

    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const previous = c.req.query('previous') === 'true';
    const monthParam = c.req.query('month');

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

    await aggregateMonthlyAnalytics(targetMonth);

    return c.json({ success: true, month: targetMonth, message: `Analytics aggregated for ${targetMonth}` });
  } catch (error) {
    console.error('Error aggregating analytics:', error);
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, 500);
  }
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
    const authHeader = c.req.header('authorization');
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
  try {
    console.log('Starting cleanup of duplicate NoteThreads entries...');

    const allEntries = await db.select().from(NoteThreads);
    console.log(`Total NoteThreads entries: ${allEntries.length}`);

    const groupedEntries = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.threadId}`;
      if (!groupedEntries.has(key)) groupedEntries.set(key, []);
      groupedEntries.get(key)!.push(entry);
    }

    const duplicateGroups = Array.from(groupedEntries.entries()).filter(([_, entries]) => entries.length > 1);
    console.log(`Found ${duplicateGroups.length} groups with duplicates`);

    if (duplicateGroups.length === 0) {
      return c.json({ success: true, message: 'No duplicates found. Database is clean!', deleted: 0 });
    }

    let totalDeleted = 0;
    const report: Array<{ noteId: string; threadId: string; kept: string; deleted: string[] }> = [];

    for (const [_key, entries] of duplicateGroups) {
      // Sort by createdAt (oldest first) — dates are ISO strings, string comparison works
      const sorted = entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const [kept, ...toDelete] = sorted;

      for (const entry of toDelete) {
        await db.delete(NoteThreads).where(eq(NoteThreads.id, entry.id));
        totalDeleted++;
      }

      report.push({ noteId: kept.noteId, threadId: kept.threadId, kept: kept.id, deleted: toDelete.map((e) => e.id) });
    }

    return c.json({
      success: true,
      message: `Cleanup complete! Deleted ${totalDeleted} duplicate NoteThreads entries.`,
      deleted: totalDeleted,
      duplicateGroups: report.length,
      report,
    });
  } catch (error: any) {
    console.error('Error during cleanup:', error);
    return c.json({ success: false, error: error.message || 'Unknown error' }, 500);
  }
});

// ─── GET /api/admin/cleanup-duplicate-scripture-refs ──────────────────

app.get('/api/admin/cleanup-duplicate-scripture-refs', async (c) => {
  try {
    console.log('Starting cleanup of duplicate scripture reference entries...');

    const allEntries = await db.select().from(NoteScriptureReferences);

    const groupedEntries = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.scriptureNoteId}`;
      if (!groupedEntries.has(key)) groupedEntries.set(key, []);
      groupedEntries.get(key)!.push(entry);
    }

    const duplicateGroups = Array.from(groupedEntries.entries()).filter(([_, entries]) => entries.length > 1);
    console.log(`Found ${duplicateGroups.length} groups with duplicates`);

    if (duplicateGroups.length === 0) {
      return c.json({ success: true, message: 'No duplicates found. Database is clean!', deleted: 0 });
    }

    let totalDeleted = 0;
    const report: Array<{ noteId: string; scriptureNoteId: string; kept: string; deleted: string[] }> = [];

    for (const [_key, entries] of duplicateGroups) {
      const sorted = entries.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const [kept, ...toDelete] = sorted;

      for (const entry of toDelete) {
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, entry.id));
        totalDeleted++;
      }

      report.push({ noteId: kept.noteId, scriptureNoteId: kept.scriptureNoteId, kept: kept.id, deleted: toDelete.map((e) => e.id) });
    }

    return c.json({
      success: true,
      message: `Cleanup complete! Deleted ${totalDeleted} duplicate entries.`,
      deleted: totalDeleted,
      duplicateGroups: report.length,
      report,
    });
  } catch (error: any) {
    console.error('Error during cleanup:', error);
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

export default app;
