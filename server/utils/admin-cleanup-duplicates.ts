import { db, NoteThreads, NoteScriptureReferences, eq } from '../db';

export type DuplicateCleanupEntry = {
  id: string;
  noteId: string;
  threadId?: string;
  scriptureNoteId?: string;
  createdAt: string | null;
};

export type DuplicateCleanupReportItem = {
  noteId: string;
  threadId?: string;
  scriptureNoteId?: string;
  kept: string;
  deleted: string[];
};

export type DuplicateCleanupResult = {
  success: true;
  dryRun: boolean;
  message: string;
  deleted: number;
  duplicateGroups: number;
  report: DuplicateCleanupReportItem[];
};

function groupKeyNoteThread(entry: { noteId: string; threadId: string }): string {
  return `${entry.noteId}::${entry.threadId}`;
}

function groupKeyScriptureRef(entry: { noteId: string; scriptureNoteId: string }): string {
  return `${entry.noteId}::${entry.scriptureNoteId}`;
}

/** Pure planning step — used by tests and cleanup handlers. */
export function planDuplicateDeletions<T extends { id: string; createdAt: string | null }>(
  entries: T[],
  keyFn: (entry: T) => string,
): { groups: number; report: Array<{ kept: T; toDelete: T[] }> } {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyFn(entry);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  const duplicateGroups = Array.from(grouped.values()).filter((group) => group.length > 1);
  const report: Array<{ kept: T; toDelete: T[] }> = [];

  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const [kept, ...toDelete] = sorted;
    report.push({ kept, toDelete });
  }

  return { groups: report.length, report };
}

export async function cleanupDuplicateNoteThreads(dryRun: boolean): Promise<DuplicateCleanupResult> {
  const allEntries = await db.select().from(NoteThreads);
  const { groups, report: planned } = planDuplicateDeletions(allEntries, (e) => groupKeyNoteThread(e));

  if (groups === 0) {
    return {
      success: true,
      dryRun,
      message: 'No duplicates found. Database is clean!',
      deleted: 0,
      duplicateGroups: 0,
      report: [],
    };
  }

  let totalDeleted = 0;
  const report: DuplicateCleanupReportItem[] = [];

  for (const { kept, toDelete } of planned) {
    if (!dryRun) {
      for (const entry of toDelete) {
        await db.delete(NoteThreads).where(eq(NoteThreads.id, entry.id));
        totalDeleted++;
      }
    }

    report.push({
      noteId: kept.noteId,
      threadId: kept.threadId,
      kept: kept.id,
      deleted: toDelete.map((e) => e.id),
    });
  }

  const wouldDelete = planned.reduce((sum, { toDelete }) => sum + toDelete.length, 0);

  return {
    success: true,
    dryRun,
    message: dryRun
      ? `Preview: would delete ${wouldDelete} duplicate NoteThreads entries across ${groups} groups.`
      : `Cleanup complete! Deleted ${totalDeleted} duplicate NoteThreads entries.`,
    deleted: dryRun ? 0 : totalDeleted,
    duplicateGroups: groups,
    report,
  };
}

export async function cleanupDuplicateScriptureRefs(dryRun: boolean): Promise<DuplicateCleanupResult> {
  const allEntries = await db.select().from(NoteScriptureReferences);
  const { groups, report: planned } = planDuplicateDeletions(allEntries, (e) =>
    groupKeyScriptureRef(e),
  );

  if (groups === 0) {
    return {
      success: true,
      dryRun,
      message: 'No duplicates found. Database is clean!',
      deleted: 0,
      duplicateGroups: 0,
      report: [],
    };
  }

  let totalDeleted = 0;
  const report: DuplicateCleanupReportItem[] = [];

  for (const { kept, toDelete } of planned) {
    if (!dryRun) {
      for (const entry of toDelete) {
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, entry.id));
        totalDeleted++;
      }
    }

    report.push({
      noteId: kept.noteId,
      scriptureNoteId: kept.scriptureNoteId,
      kept: kept.id,
      deleted: toDelete.map((e) => e.id),
    });
  }

  const wouldDelete = planned.reduce((sum, { toDelete }) => sum + toDelete.length, 0);

  return {
    success: true,
    dryRun,
    message: dryRun
      ? `Preview: would delete ${wouldDelete} duplicate scripture reference entries across ${groups} groups.`
      : `Cleanup complete! Deleted ${totalDeleted} duplicate entries.`,
    deleted: dryRun ? 0 : totalDeleted,
    duplicateGroups: groups,
    report,
  };
}
