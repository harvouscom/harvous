/**
 * Admin routes — Hono port
 *
 * Endpoints:
 *   POST /api/admin/aggregate-analytics
 *   GET  /api/admin/aggregate-analytics
 *   GET  /api/admin/cleanup-duplicate-note-threads
 *   GET  /api/admin/cleanup-duplicate-scripture-refs
 *   GET  /api/admin/debug-thread-counts
 *   GET  /api/admin/list-threads
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import {
  db,
  Notes,
  NoteThreads,
  NoteScriptureReferences,
  ScriptureMetadata,
  Threads,
  eq,
  and,
} from '../db';
import { aggregateMonthlyAnalytics, getCurrentMonth, getPreviousMonth } from '../utils/analytics-aggregator';

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

// ─── GET /api/admin/cleanup-duplicate-note-threads ────────────────────

app.get('/api/admin/cleanup-duplicate-note-threads', async (c) => {
  try {
    console.log('Starting cleanup of duplicate NoteThreads entries...');

    const allEntries = await db.select().from(NoteThreads).all();
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

    const allEntries = await db.select().from(NoteScriptureReferences).all();

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

app.get('/api/admin/debug-thread-counts', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const threadId = c.req.query('threadId');
    if (!threadId) return c.json({ error: 'threadId parameter required' }, 400);

    const allNotes = await db.select({ id: Notes.id, title: Notes.title, noteType: Notes.noteType, content: Notes.content })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, auth.userId)))
      .all();

    const scriptureDetails = await Promise.all(
      allNotes.filter((n) => n.noteType === 'scripture').map(async (note) => {
        const metadata = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id)).get();
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

app.get('/api/admin/list-threads', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const threads = await db.select().from(Threads).where(eq(Threads.userId, auth.userId)).all();

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
