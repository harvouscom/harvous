/**
 * Analytics aggregator — Drizzle port of src/utils/analytics-aggregator.ts
 */

import { db, first, ScriptureMetadata, NoteTags, Tags, MonthlyAnalytics, eq, and, sql, gte, lt } from '../db';
import { nowISO } from '../db/dates';
import { adminCalendarMonthRange } from './admin-calendar-range';
import { getUtcMonthKey } from '@/utils/season-helpers';

/**
 * Aggregate monthly analytics for Bible books and tags
 * This runs anonymously - no user IDs are stored
 */
export async function aggregateMonthlyAnalytics(month: string): Promise<void> {
  try {
    const { since: monthStart, until: monthEnd } = adminCalendarMonthRange(month);

    // Aggregate Bible books from ScriptureMetadata
    const bookStats = await db
      .select({
        book: ScriptureMetadata.book,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(ScriptureMetadata)
      .where(and(gte(ScriptureMetadata.createdAt, monthStart), lt(ScriptureMetadata.createdAt, monthEnd)))
      .groupBy(ScriptureMetadata.book);

    // Aggregate tags from NoteTags
    const tagStats = await db
      .select({
        tagName: Tags.name,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(gte(NoteTags.createdAt, monthStart), lt(NoteTags.createdAt, monthEnd)))
      .groupBy(Tags.name);

    const seenBookNames = new Set<string>();
    const seenTagNames = new Set<string>();

    // Upsert book stats
    for (const stat of bookStats) {
      if (!stat.book) continue;
      seenBookNames.add(stat.book);

      const existing = first(
        await db
          .select()
          .from(MonthlyAnalytics)
          .where(
            and(
              eq(MonthlyAnalytics.month, month),
              eq(MonthlyAnalytics.category, 'book'),
              eq(MonthlyAnalytics.bookName, stat.book),
            ),
          )
          .limit(1),
      );

      if (existing) {
        await db
          .update(MonthlyAnalytics)
          .set({ count: stat.count, updatedAt: nowISO() })
          .where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_book_${stat.book.replace(/\s+/g, '_')}_${Date.now()}`,
          month,
          bookName: stat.book,
          tagName: null,
          category: 'book',
          count: stat.count,
          createdAt: nowISO(),
        });
      }
    }

    // Upsert tag stats
    for (const stat of tagStats) {
      if (!stat.tagName) continue;
      seenTagNames.add(stat.tagName);

      const existing = first(
        await db
          .select()
          .from(MonthlyAnalytics)
          .where(
            and(
              eq(MonthlyAnalytics.month, month),
              eq(MonthlyAnalytics.category, 'tag'),
              eq(MonthlyAnalytics.tagName, stat.tagName),
            ),
          )
          .limit(1),
      );

      if (existing) {
        await db
          .update(MonthlyAnalytics)
          .set({ count: stat.count, updatedAt: nowISO() })
          .where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_tag_${stat.tagName.replace(/\s+/g, '_')}_${Date.now()}`,
          month,
          bookName: null,
          tagName: stat.tagName,
          category: 'tag',
          count: stat.count,
          createdAt: nowISO(),
        });
      }
    }

    // Remove stale rows from prior runs (books/tags with zero count this month)
    const existingRows = await db.select().from(MonthlyAnalytics).where(eq(MonthlyAnalytics.month, month));
    for (const row of existingRows) {
      if (row.category === 'book' && row.bookName && !seenBookNames.has(row.bookName)) {
        await db.delete(MonthlyAnalytics).where(eq(MonthlyAnalytics.id, row.id));
      }
      if (row.category === 'tag' && row.tagName && !seenTagNames.has(row.tagName)) {
        await db.delete(MonthlyAnalytics).where(eq(MonthlyAnalytics.id, row.id));
      }
    }
  } catch (error) {
    console.error(`Error aggregating analytics for ${month}:`, error);
    throw error;
  }
}

export function getCurrentMonth(): string {
  return getUtcMonthKey(new Date());
}

export function getPreviousMonth(): string {
  const now = new Date();
  return getUtcMonthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}
