/**
 * Analytics aggregator — Drizzle port of src/utils/analytics-aggregator.ts
 */

import { db, ScriptureMetadata, NoteTags, Tags, MonthlyAnalytics, eq, and, sql, gte, lt } from '../db';
import { nowISO } from '../db/dates';
import { adminCalendarMonthRange } from './admin-calendar-range';
import { getUtcMonthKey } from '@/utils/season-helpers';

function analyticsRowId(month: string, category: 'book' | 'tag', name: string, index: number): string {
  const slug = name.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
  return `analytics_${month}_${category}_${slug}_${index}`;
}

/**
 * Aggregate monthly analytics for Bible books and tags
 * This runs anonymously - no user IDs are stored
 */
export async function aggregateMonthlyAnalytics(month: string): Promise<void> {
  try {
    const { since: monthStart, until: monthEnd } = adminCalendarMonthRange(month);

    const [bookStats, tagStats] = await Promise.all([
      db
        .select({
          book: ScriptureMetadata.book,
          count: sql<number>`COUNT(*)`.as('count'),
        })
        .from(ScriptureMetadata)
        .where(and(gte(ScriptureMetadata.createdAt, monthStart), lt(ScriptureMetadata.createdAt, monthEnd)))
        .groupBy(ScriptureMetadata.book),
      db
        .select({
          tagName: Tags.name,
          count: sql<number>`COUNT(*)`.as('count'),
        })
        .from(NoteTags)
        .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
        .where(and(gte(NoteTags.createdAt, monthStart), lt(NoteTags.createdAt, monthEnd)))
        .groupBy(Tags.name),
    ]);

    const createdAt = nowISO();
    const rows: (typeof MonthlyAnalytics.$inferInsert)[] = [];
    let bookIndex = 0;
    for (const stat of bookStats) {
      if (!stat.book) continue;
      rows.push({
        id: analyticsRowId(month, 'book', stat.book, bookIndex++),
        month,
        bookName: stat.book,
        tagName: null,
        category: 'book',
        count: stat.count,
        createdAt,
      });
    }
    let tagIndex = 0;
    for (const stat of tagStats) {
      if (!stat.tagName) continue;
      rows.push({
        id: analyticsRowId(month, 'tag', stat.tagName, tagIndex++),
        month,
        bookName: null,
        tagName: stat.tagName,
        category: 'tag',
        count: stat.count,
        createdAt,
      });
    }

    await db.delete(MonthlyAnalytics).where(eq(MonthlyAnalytics.month, month));
    if (rows.length > 0) {
      await db.insert(MonthlyAnalytics).values(rows);
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
