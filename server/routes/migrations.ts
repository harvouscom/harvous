/**
 * Migrations routes — Hono port
 *
 * Endpoints:
 *   POST /api/migrations/backfill-last-visited
 *   POST /api/migrations/retry-failed-users
 *   POST /api/migrations/sync-clerk-to-audienceful
 */

import { Hono } from 'hono';
import { db, Notes, Threads, isNull, eq } from '../db';
import { nowISO } from '../db/dates';
import { createClerkClient } from '@clerk/backend';
import { tagAsAppUser } from '@/utils/audienceful';

const app = new Hono();

// ─── POST /api/migrations/backfill-last-visited ───────────────────────

app.post('/api/migrations/backfill-last-visited', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;

    if (!isAuthorized) {
      return c.json({ error: 'Unauthorized', message: 'Valid migration key required.' }, 401);
    }

    const results = { notesUpdated: 0, threadsUpdated: 0, errors: [] as string[], startTime: Date.now() };
    console.log('[Migration] Starting lastVisited backfill...');

    // Backfill Notes.lastVisited
    try {
      const notesToUpdate = await db.select({ id: Notes.id, updatedAt: Notes.updatedAt, createdAt: Notes.createdAt })
        .from(Notes).where(isNull(Notes.lastVisited)).all();
      console.log(`[Migration] Found ${notesToUpdate.length} notes without lastVisited`);

      const batchSize = 1000;
      for (let i = 0; i < notesToUpdate.length; i += batchSize) {
        const batch = notesToUpdate.slice(i, i + batchSize);
        for (const note of batch) {
          try {
            const fallbackDate = note.updatedAt || note.createdAt;
            if (fallbackDate) {
              await db.update(Notes).set({ lastVisited: fallbackDate }).where(eq(Notes.id, note.id));
              results.notesUpdated++;
            }
          } catch (error: any) {
            results.errors.push(`Note ${note.id}: ${error.message}`);
          }
        }
        console.log(`[Migration] Processed ${Math.min(i + batchSize, notesToUpdate.length)}/${notesToUpdate.length} notes`);
      }
    } catch (error: any) {
      results.errors.push(`Notes migration failed: ${error.message}`);
    }

    // Backfill Threads.lastVisited
    try {
      const threadsToUpdate = await db.select({ id: Threads.id, updatedAt: Threads.updatedAt, createdAt: Threads.createdAt })
        .from(Threads).where(isNull(Threads.lastVisited)).all();
      console.log(`[Migration] Found ${threadsToUpdate.length} threads without lastVisited`);

      const batchSize = 1000;
      for (let i = 0; i < threadsToUpdate.length; i += batchSize) {
        const batch = threadsToUpdate.slice(i, i + batchSize);
        for (const thread of batch) {
          try {
            const fallbackDate = thread.updatedAt || thread.createdAt;
            if (fallbackDate) {
              await db.update(Threads).set({ lastVisited: fallbackDate }).where(eq(Threads.id, thread.id));
              results.threadsUpdated++;
            }
          } catch (error: any) {
            results.errors.push(`Thread ${thread.id}: ${error.message}`);
          }
        }
        console.log(`[Migration] Processed ${Math.min(i + batchSize, threadsToUpdate.length)}/${threadsToUpdate.length} threads`);
      }
    } catch (error: any) {
      results.errors.push(`Threads migration failed: ${error.message}`);
    }

    const duration = ((Date.now() - results.startTime) / 1000).toFixed(2);
    const success = results.errors.length === 0;

    return c.json({
      success,
      message: success ? `Migration completed in ${duration}s` : `Migration completed with errors in ${duration}s`,
      results: {
        notesUpdated: results.notesUpdated,
        threadsUpdated: results.threadsUpdated,
        totalUpdated: results.notesUpdated + results.threadsUpdated,
        duration: `${duration}s`,
        errors: results.errors.slice(0, 10),
      },
    }, success ? 200 : 207);
  } catch (error: any) {
    console.error('[Migration] Fatal error:', error);
    return c.json({ success: false, error: 'Migration failed', message: error.message }, 500);
  }
});

// ─── POST /api/migrations/retry-failed-users ──────────────────────────

app.post('/api/migrations/retry-failed-users', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;
    if (!isAuthorized) return c.json({ error: 'Unauthorized' }, 401);

    let body: any;
    try {
      body = await c.req.json();
    } catch (error: any) {
      return c.json({ error: 'Bad Request', message: 'Invalid JSON' }, 400);
    }

    const userIds = body.userIds || [];
    const emails = body.emails || [];
    if (userIds.length === 0 && emails.length === 0) {
      return c.json({ error: 'Bad Request', message: 'Must provide either userIds or emails array' }, 400);
    }

    const results = { totalUsers: 0, successful: 0, failed: 0, skipped: 0, errors: [] as any[], startTime: Date.now() };

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });

    if (!process.env.AUDIENCEFUL_API_KEY) throw new Error('AUDIENCEFUL_API_KEY not configured');

    // Process by user ID
    for (const userId of userIds) {
      results.totalUsers++;
      try {
        const user = await clerkClient.users.getUser(userId);
        const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        if (!primaryEmail) { results.skipped++; continue; }
        const email = primaryEmail.emailAddress;
        try {
          await tagAsAppUser(email, userId, user.firstName || undefined, user.lastName || undefined);
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({ userId, email, error: error.message });
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({ userId, email: 'unknown', error: `Failed to fetch user: ${error.message}` });
      }
    }

    // Process by email
    for (const email of emails) {
      results.totalUsers++;
      try {
        const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
        if (users.length === 0) { results.skipped++; results.errors.push({ userId: 'unknown', email, error: 'Not found in Clerk' }); continue; }
        const user = users[0];
        try {
          await tagAsAppUser(email, user.id, user.firstName || undefined, user.lastName || undefined);
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({ userId: user.id, email, error: error.message });
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({ userId: 'unknown', email, error: `Failed to process: ${error.message}` });
      }
    }

    const durationSeconds = ((Date.now() - results.startTime) / 1000).toFixed(2);
    return c.json({
      success: true,
      message: 'Retry complete',
      results: { ...results, startTime: undefined, durationSeconds: parseFloat(durationSeconds) },
    });
  } catch (error: any) {
    console.error('[Retry Migration] Fatal error:', error);
    return c.json({ error: 'Retry failed', message: error.message }, 500);
  }
});

// ─── POST /api/migrations/sync-clerk-to-audienceful ───────────────────

app.post('/api/migrations/sync-clerk-to-audienceful', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const migrationKey = process.env.MIGRATION_KEY;
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;
    if (!isAuthorized) return c.json({ error: 'Unauthorized' }, 401);

    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    const dryRunParam = c.req.query('dryRun');

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const dryRun = dryRunParam === 'true';

    const results = { totalUsers: 0, successful: 0, failed: 0, skipped: 0, errors: [] as any[], dryRun, startTime: Date.now() };

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY not configured');
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });

    if (!process.env.AUDIENCEFUL_API_KEY && !dryRun) throw new Error('AUDIENCEFUL_API_KEY not configured');

    let hasMore = true;
    let currentOffset = offset;
    const batchSize = 100;

    while (hasMore) {
      const { data: users, totalCount } = await clerkClient.users.getUserList({
        limit: limit ? Math.min(batchSize, limit - results.totalUsers) : batchSize,
        offset: currentOffset,
      });

      for (const user of users) {
        results.totalUsers++;
        const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
        if (!primaryEmail) { results.skipped++; continue; }
        const email = primaryEmail.emailAddress;

        if (dryRun) { results.successful++; continue; }

        try {
          await tagAsAppUser(email, user.id, user.firstName || undefined, user.lastName || undefined);
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({ userId: user.id, email, error: error.message });
        }
      }

      hasMore = users.length === batchSize && (!limit || results.totalUsers < limit);
      currentOffset += users.length;
      if (hasMore) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const durationSeconds = ((Date.now() - results.startTime) / 1000).toFixed(2);
    return c.json({
      success: true,
      message: dryRun ? 'Dry run complete' : 'Migration complete',
      results: { ...results, startTime: undefined, durationSeconds: parseFloat(durationSeconds) },
    });
  } catch (error: any) {
    console.error('[Migration] Fatal error:', error);
    const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');
    return c.json({ error: 'Migration failed', message: error.message, isTimeout }, isTimeout ? 504 : 500);
  }
});

export default app;
