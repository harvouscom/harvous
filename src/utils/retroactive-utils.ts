/**
 * Retroactive Utilities
 * 
 * General utilities for applying new features to existing data
 * without affecting new data creation.
 */

import { db, Notes, Tags, NoteTags, eq, and, isNull, sql } from 'astro:db';

export interface RetroactiveProcessResult {
  total: number;
  processed: number;
  successful: number;
  errors: number;
  results: Array<{
    id: string;
    title?: string;
    success: boolean;
    error?: string;
    details?: any;
  }>;
}

export interface RetroactiveProcessOptions {
  userId: string;
  batchSize?: number;
  dryRun?: boolean;
  onProgress?: (current: number, total: number, item: any) => void;
}

/**
 * Base class for retroactive processing operations
 */
export abstract class RetroactiveProcessor<T> {
  protected userId: string;
  protected batchSize: number;
  protected dryRun: boolean;
  protected onProgress?: (current: number, total: number, item: any) => void;

  constructor(options: RetroactiveProcessOptions) {
    this.userId = options.userId;
    this.batchSize = options.batchSize || 10;
    this.dryRun = options.dryRun || false;
    this.onProgress = options.onProgress;
  }

  /**
   * Find items that need processing
   */
  abstract findItemsToProcess(): Promise<T[]>;

  /**
   * Process a single item
   */
  abstract processItem(item: T): Promise<{ success: boolean; error?: string; details?: any }>;

  /**
   * Get a human-readable identifier for the item
   */
  abstract getItemIdentifier(item: T): string;

  /**
   * Run the retroactive process
   */
  async run(): Promise<RetroactiveProcessResult> {
    const items = await this.findItemsToProcess();
    const result: RetroactiveProcessResult = {
      total: items.length,
      processed: 0,
      successful: 0,
      errors: 0,
      results: []
    };

    console.log(`🚀 Starting retroactive process for ${items.length} items`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const identifier = this.getItemIdentifier(item);

      try {
        if (this.onProgress) {
          this.onProgress(i + 1, items.length, item);
        }

        if (this.dryRun) {
          console.log(`[DRY RUN] Would process: ${identifier}`);
          result.results.push({
            id: identifier,
            success: true,
            details: { dryRun: true }
          });
        } else {
          const processResult = await this.processItem(item);
          result.results.push({
            id: identifier,
            success: processResult.success,
            error: processResult.error,
            details: processResult.details
          });

          if (processResult.success) {
            result.successful++;
          } else {
            result.errors++;
          }
        }

        result.processed++;
      } catch (error) {
        console.error(`❌ Error processing ${identifier}:`, error);
        result.results.push({
          id: identifier,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        result.errors++;
        result.processed++;
      }
    }

    console.log(`🎉 Retroactive process completed:`, {
      total: result.total,
      processed: result.processed,
      successful: result.successful,
      errors: result.errors
    });

    return result;
  }
}

/**
 * Utility to find notes without tags
 */
export async function findNotesWithoutTags(userId: string): Promise<Array<{
  id: string;
  title?: string;
  content?: string;
  createdAt: Date;
}>> {
  return await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      createdAt: Notes.createdAt
    })
    .from(Notes)
    .leftJoin(NoteTags, eq(Notes.id, NoteTags.noteId))
    .where(
      and(
        eq(Notes.userId, userId),
        isNull(NoteTags.noteId)
      )
    )
    .groupBy(Notes.id);
}

/**
 * Utility to find notes with specific criteria
 */
export async function findNotesWithCriteria(
  userId: string, 
  criteria: {
    hasTags?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
    titleContains?: string;
    contentContains?: string;
  }
): Promise<Array<{
  id: string;
  title?: string;
  content?: string;
  createdAt: Date;
}>> {
  let query = db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      createdAt: Notes.createdAt
    })
    .from(Notes)
    .where(eq(Notes.userId, userId));

  // Add tag criteria
  if (criteria.hasTags !== undefined) {
    if (criteria.hasTags) {
      query = query.innerJoin(NoteTags, eq(Notes.id, NoteTags.noteId));
    } else {
      query = query.leftJoin(NoteTags, eq(Notes.id, NoteTags.noteId))
        .where(and(eq(Notes.userId, userId), isNull(NoteTags.noteId)));
    }
  }

  // Add date criteria
  if (criteria.createdAfter) {
    query = query.where(and(eq(Notes.userId, userId), sql`${Notes.createdAt} > ${criteria.createdAfter}`));
  }
  if (criteria.createdBefore) {
    query = query.where(and(eq(Notes.userId, userId), sql`${Notes.createdAt} < ${criteria.createdBefore}`));
  }

  // Add text search criteria
  if (criteria.titleContains) {
    query = query.where(and(eq(Notes.userId, userId), sql`${Notes.title} LIKE '%${criteria.titleContains}%'`));
  }
  if (criteria.contentContains) {
    query = query.where(and(eq(Notes.userId, userId), sql`${Notes.content} LIKE '%${criteria.contentContains}%'`));
  }

  return await query.groupBy(Notes.id);
}

/**
 * Utility to get processing statistics
 */
export async function getProcessingStats(userId: string) {
  const totalNotes = await db
    .select({ count: sql`count(*)` })
    .from(Notes)
    .where(eq(Notes.userId, userId));

  const notesWithTags = await db
    .select({ count: sql`count(distinct ${Notes.id})` })
    .from(Notes)
    .innerJoin(NoteTags, eq(Notes.id, NoteTags.noteId))
    .where(eq(Notes.userId, userId));

  const notesWithoutTags = await db
    .select({ count: sql`count(*)` })
    .from(Notes)
    .leftJoin(NoteTags, eq(Notes.id, NoteTags.noteId))
    .where(
      and(
        eq(Notes.userId, userId),
        isNull(NoteTags.noteId)
      )
    )
    .groupBy(Notes.id);

  return {
    totalNotes: totalNotes[0]?.count || 0,
    notesWithTags: notesWithTags[0]?.count || 0,
    notesWithoutTags: notesWithoutTags.length,
    tagCoverage: totalNotes[0]?.count ? 
      Math.round((notesWithTags[0]?.count || 0) / totalNotes[0].count * 100) : 0
  };
}
