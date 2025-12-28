import { db, ScriptureMetadata, NoteTags, Tags, MonthlyAnalytics, eq, and, sql, gte, lt } from 'astro:db';

/**
 * Aggregate monthly analytics for Bible books and tags
 * This runs anonymously - no user IDs are stored
 */
export async function aggregateMonthlyAnalytics(month: string): Promise<void> {
  try {
    // Parse month string (YYYY-MM) and create date range
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 1); // First day of next month

    // Aggregate Bible books from ScriptureMetadata
    const bookStats = await db
      .select({
        book: ScriptureMetadata.book,
        count: sql<number>`COUNT(*)`.as('count')
      })
      .from(ScriptureMetadata)
      .where(
        and(
          gte(ScriptureMetadata.createdAt, monthStart),
          lt(ScriptureMetadata.createdAt, monthEnd)
        )
      )
      .groupBy(ScriptureMetadata.book)
      .all();

    // Aggregate tags from NoteTags
    const tagStats = await db
      .select({
        tagName: Tags.name,
        count: sql<number>`COUNT(*)`.as('count')
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(
        and(
          gte(NoteTags.createdAt, monthStart),
          lt(NoteTags.createdAt, monthEnd)
        )
      )
      .groupBy(Tags.name)
      .all();

    // Upsert book stats
    for (const stat of bookStats) {
      if (!stat.book) continue; // Skip null books

      const existing = await db
        .select()
        .from(MonthlyAnalytics)
        .where(
          and(
            eq(MonthlyAnalytics.month, month),
            eq(MonthlyAnalytics.category, 'book'),
            eq(MonthlyAnalytics.bookName, stat.book)
          )
        )
        .get();

      if (existing) {
        await db.update(MonthlyAnalytics)
          .set({ 
            count: stat.count, 
            updatedAt: new Date() 
          })
          .where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_book_${stat.book.replace(/\s+/g, '_')}_${Date.now()}`,
          month,
          bookName: stat.book,
          tagName: null,
          category: 'book',
          count: stat.count,
          createdAt: new Date(),
        });
      }
    }

    // Upsert tag stats
    for (const stat of tagStats) {
      if (!stat.tagName) continue; // Skip null tags

      const existing = await db
        .select()
        .from(MonthlyAnalytics)
        .where(
          and(
            eq(MonthlyAnalytics.month, month),
            eq(MonthlyAnalytics.category, 'tag'),
            eq(MonthlyAnalytics.tagName, stat.tagName)
          )
        )
        .get();

      if (existing) {
        await db.update(MonthlyAnalytics)
          .set({ 
            count: stat.count, 
            updatedAt: new Date() 
          })
          .where(eq(MonthlyAnalytics.id, existing.id));
      } else {
        await db.insert(MonthlyAnalytics).values({
          id: `analytics_${month}_tag_${stat.tagName.replace(/\s+/g, '_')}_${Date.now()}`,
          month,
          bookName: null,
          tagName: stat.tagName,
          category: 'tag',
          count: stat.count,
          createdAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error aggregating analytics for ${month}:`, error);
    throw error;
  }
}

/**
 * Get the current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get the previous month in YYYY-MM format
 */
export function getPreviousMonth(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = String(prev.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Query helpers for future use (not used yet, but ready)
 */
export async function getTopBooksForMonth(month: string, limit: number = 10) {
  return await db
    .select()
    .from(MonthlyAnalytics)
    .where(
      and(
        eq(MonthlyAnalytics.month, month),
        eq(MonthlyAnalytics.category, 'book')
      )
    )
    .orderBy(sql`${MonthlyAnalytics.count} DESC`)
    .limit(limit)
    .all();
}

export async function getTopTagsForMonth(month: string, limit: number = 10) {
  return await db
    .select()
    .from(MonthlyAnalytics)
    .where(
      and(
        eq(MonthlyAnalytics.month, month),
        eq(MonthlyAnalytics.category, 'tag')
      )
    )
    .orderBy(sql`${MonthlyAnalytics.count} DESC`)
    .limit(limit)
    .all();
}

