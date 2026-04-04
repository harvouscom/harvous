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
 */

import { Hono } from 'hono';
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
  eq,
  and,
} from '../db';
import { nowISO } from '../db/dates';
import { aggregateMonthlyAnalytics, getCurrentMonth, getPreviousMonth } from '../utils/analytics-aggregator';
import { generateUserExport } from '../utils/export-user-data';
import { validateColor, validateContent, validateTitle } from '@/utils/validation';
import { generateNoteId, generateShareToken, generateSpaceId, generateThreadId, generateTimestampId } from '@/utils/ids';
import { getHarvousSystemUserId, requireHarvousAdmin } from '../utils/harvous-admin';
import { generateAutoTags, applyAutoTags, regenerateAutoTags, AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN } from '../utils/auto-tag-generator';

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

    for (const note of userNotes) {
      if (note.threadId && note.threadId !== 'thread_unorganized' && threadIdSet.has(note.threadId)) {
        const key = `${note.id}::${note.threadId}`;
        if (!noteThreadPairs.has(key)) {
          report.threadLinks.details.push({ type: 'missing_junction_created', noteId: note.id, threadId: note.threadId });
          if (!dryRun) {
            const id = `nt-heal-${note.id}-${note.threadId}-${Date.now()}`;
            try {
              await db.insert(NoteThreads).values({ id, noteId: note.id, threadId: note.threadId, createdAt: nowISO() });
              report.threadLinks.missingJunctionsCreated++;
            } catch {
              // unique constraint = already exists, skip
            }
          } else {
            report.threadLinks.missingJunctionsCreated++;
          }
        }
      }
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

// ─── Harvous-curated content admin endpoints ───────────────────────────────────

app.post('/api/admin/spaces', async (c) => {
  const gate = requireHarvousAdmin(c);
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
  const gate = requireHarvousAdmin(c);
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

app.post('/api/admin/threads/:threadId/notes', async (c) => {
  const gate = requireHarvousAdmin(c);
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
  const gate = requireHarvousAdmin(c);
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
  const gate = requireHarvousAdmin(c);
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

export default app;
