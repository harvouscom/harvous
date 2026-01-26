/**
 * Admin API endpoint to cleanup duplicate scripture reference entries
 * GET /api/admin/cleanup-duplicate-scripture-refs
 *
 * This endpoint finds and removes duplicate entries from NoteScriptureReferences table
 * keeping only the oldest entry for each (noteId, scriptureNoteId) pair
 */

import type { APIRoute } from 'astro';
import { db, NoteScriptureReferences, eq } from 'astro:db';

export const GET: APIRoute = async ({ request }) => {
  try {
    console.log('Starting cleanup of duplicate scripture reference entries...');

    // Find all entries grouped by noteId and scriptureNoteId
    const allEntries = await db.select()
      .from(NoteScriptureReferences)
      .all();

    // Group entries by (noteId, scriptureNoteId) combination
    const groupedEntries = new Map<string, typeof allEntries>();

    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.scriptureNoteId}`;
      if (!groupedEntries.has(key)) {
        groupedEntries.set(key, []);
      }
      groupedEntries.get(key)!.push(entry);
    }

    // Find groups with duplicates
    const duplicateGroups = Array.from(groupedEntries.entries())
      .filter(([_, entries]) => entries.length > 1);

    console.log(`Found ${duplicateGroups.length} groups with duplicates`);

    if (duplicateGroups.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No duplicates found. Database is clean!',
        deleted: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let totalDeleted = 0;
    const report: Array<{ noteId: string; scriptureNoteId: string; kept: string; deleted: string[] }> = [];

    // For each duplicate group, keep the oldest entry and delete the rest
    for (const [key, entries] of duplicateGroups) {
      // Sort by createdAt (oldest first)
      const sorted = entries.sort((a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime()
      );

      const [kept, ...toDelete] = sorted;

      // Delete all but the first (oldest) entry
      for (const entry of toDelete) {
        await db.delete(NoteScriptureReferences)
          .where(eq(NoteScriptureReferences.id, entry.id));
        totalDeleted++;
      }

      report.push({
        noteId: kept.noteId,
        scriptureNoteId: kept.scriptureNoteId,
        kept: kept.id,
        deleted: toDelete.map(e => e.id)
      });

      console.log(`Processed ${key}: kept ${kept.id}, deleted ${toDelete.length} duplicates`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Cleanup complete! Deleted ${totalDeleted} duplicate entries.`,
      deleted: totalDeleted,
      duplicateGroups: report.length,
      report
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error during cleanup:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
