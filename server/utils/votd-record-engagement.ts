/**
 * Record prototype / native Today's Passage engagement (dismiss or add-note).
 * Resolves featuredItemId from VotdPublishHistory for the user's local calendar day.
 */

import { db, desc, eq, first, gte, lte } from '../db';
import { now } from '../db/dates';
import { FeaturedItems, UserFeaturedItems, VotdPublishHistory } from '../db/schema';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { awardVotdEngagementXP } from './xp-system';

export type VotdEngagementAction = 'dismiss' | 'add_note';

export async function resolveVotdFeaturedItemIdForLocalDate(localCalendarDate: string): Promise<string | null> {
  const exact = first(
    await db
      .select({ featuredItemId: VotdPublishHistory.featuredItemId })
      .from(VotdPublishHistory)
      .where(eq(VotdPublishHistory.publishedDate, localCalendarDate))
      .limit(1),
  );
  if (exact?.featuredItemId) return exact.featuredItemId;

  const fallback = first(
    await db
      .select({ featuredItemId: VotdPublishHistory.featuredItemId })
      .from(VotdPublishHistory)
      .where(lte(VotdPublishHistory.publishedDate, localCalendarDate))
      .orderBy(desc(VotdPublishHistory.publishedDate))
      .limit(1),
  );
  return fallback?.featuredItemId ?? null;
}

async function markVotdFeaturedItemCompleted(userId: string, featuredItemId: string): Promise<void> {
  const timestamp = now();
  await db
    .insert(UserFeaturedItems)
    .values({
      id: crypto.randomUUID(),
      userId,
      featuredItemId,
      status: 'completed',
      dismissedAt: null,
      completedAt: timestamp,
      createdAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
      set: {
        status: 'completed',
        completedAt: timestamp,
      },
    });
}

export type RecordVotdEngagementResult =
  | { ok: true; featuredItemId: string }
  | { ok: false; reason: 'not_found' };

export async function recordVotdEngagement(
  userId: string,
  action: VotdEngagementAction,
  localCalendarDate: string,
): Promise<RecordVotdEngagementResult> {
  const featuredItemId = await resolveVotdFeaturedItemIdForLocalDate(localCalendarDate);
  if (!featuredItemId) {
    return { ok: false, reason: 'not_found' };
  }

  const featuredItem = first(
    await db
      .select({ contentType: FeaturedItems.contentType })
      .from(FeaturedItems)
      .where(eq(FeaturedItems.id, featuredItemId))
      .limit(1),
  );
  if (!featuredItem || featuredItem.contentType !== 'votd') {
    return { ok: false, reason: 'not_found' };
  }

  if (action === 'dismiss') {
    await markVotdFeaturedItemCompleted(userId, featuredItemId);
    return { ok: true, featuredItemId };
  }

  await awardVotdEngagementXP(userId, featuredItemId, 'create_note');
  await markVotdFeaturedItemCompleted(userId, featuredItemId);
  return { ok: true, featuredItemId };
}

function refsEquivalent(a: string, b: string): boolean {
  const na = normalizeScriptureReference(a.trim()) ?? a.trim();
  const nb = normalizeScriptureReference(b.trim()) ?? b.trim();
  if (!na || !nb) return false;
  return na.localeCompare(nb, undefined, { sensitivity: 'accent' }) === 0;
}

function noteCitesVotdReference(
  note: { title: string | null; content: string | null },
  reference: string,
): boolean {
  const title = (note.title ?? '').trim();
  if (title && refsEquivalent(title, reference)) return true;

  const content = note.content ?? '';
  const pillRefPattern = /data-scripture-reference\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pillRefPattern.exec(content)) !== null) {
    const pillRef = (match[1] ?? '').trim();
    if (pillRef && refsEquivalent(pillRef, reference)) return true;
  }
  return false;
}

/** After note create, match recent VOTD publishes and record add-note engagement once. */
export async function tryRecordVotdAddNoteFromCreatedNote(
  userId: string,
  note: { title: string | null; content: string | null; createdAt: Date | string },
): Promise<void> {
  const createdAtMs =
    note.createdAt instanceof Date ? note.createdAt.getTime() : Date.parse(String(note.createdAt));
  if (!Number.isFinite(createdAtMs)) return;

  const since = new Date(createdAtMs);
  since.setUTCDate(since.getUTCDate() - 30);
  const publishDateMin = since.toISOString().slice(0, 10);

  const publishes = await db
    .select({
      reference: VotdPublishHistory.reference,
      publishedDate: VotdPublishHistory.publishedDate,
    })
    .from(VotdPublishHistory)
    .where(gte(VotdPublishHistory.publishedDate, publishDateMin))
    .orderBy(desc(VotdPublishHistory.publishedDate));

  for (const row of publishes) {
    if (!noteCitesVotdReference(note, row.reference)) continue;
    const publishStartMs = Date.parse(`${row.publishedDate}T00:00:00.000Z`);
    if (!Number.isFinite(publishStartMs) || createdAtMs < publishStartMs) continue;
    await recordVotdEngagement(userId, 'add_note', row.publishedDate);
    return;
  }
}
