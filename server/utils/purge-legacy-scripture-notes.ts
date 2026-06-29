/**
 * Retire noteType: scripture child notes — migrate pills + passage metadata onto parent
 * study notes, then delete all legacy scripture notes for a user.
 */

import {
  db,
  first,
  Notes,
  NoteScriptureReferences,
  ScriptureMetadata,
  and,
  eq,
  inArray,
  like,
  ne,
  not,
  or,
  sql,
} from '../db';
import { nowISO } from '../db/dates';
import { deleteNotesCascadeForUser } from './delete-note-cascade';
import { recordDeletedEntities } from './sync-deletion-log';

export type PurgeLegacyScriptureResult = {
  scriptureNotesDeleted: number;
  parentNotesUpdated: number;
  metadataRowsCopied: number;
};

/** Rewrite scripture pill data-note-id values without orginal HTML (preserves pill markup). */
export function rewriteScripturePillNoteIdInHtml(html: string, fromNoteId: string, toNoteId: string): string {
  if (!html || !fromNoteId || !toNoteId || fromNoteId === toNoteId) {
    return html;
  }
  const escaped = fromNoteId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(data-note-id\\s*=\\s*["'])${escaped}(["'])`, 'gi'), `$1${toNoteId}$2`);
}

async function listLegacyScriptureNoteIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
  return rows.map((r) => r.id);
}

async function copyScriptureMetadataToParent(parentNoteId: string, scriptureNoteId: string): Promise<number> {
  const childRows = await db
    .select()
    .from(ScriptureMetadata)
    .where(eq(ScriptureMetadata.noteId, scriptureNoteId));

  let copied = 0;
  for (const row of childRows) {
    const existing = first(
      await db
        .select({ id: ScriptureMetadata.id })
        .from(ScriptureMetadata)
        .where(and(eq(ScriptureMetadata.noteId, parentNoteId), eq(ScriptureMetadata.reference, row.reference)))
        .limit(1),
    );
    if (existing) continue;

    await db.insert(ScriptureMetadata).values({
      id: `scripture_${parentNoteId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      noteId: parentNoteId,
      reference: row.reference,
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      verseEnd: row.verseEnd,
      chapterEnd: row.chapterEnd,
      translation: row.translation,
      originalText: row.originalText,
      createdAt: new Date(),
    });
    copied += 1;
  }
  return copied;
}

/**
 * Point pills at parent study notes and copy passage metadata off child scripture notes.
 * Idempotent — safe to re-run before deletion.
 */
export async function migrateParentNotesFromLegacyScriptureChildren(userId: string): Promise<{
  parentNotesUpdated: number;
  metadataRowsCopied: number;
}> {
  const scriptureNoteIds = await listLegacyScriptureNoteIds(userId);
  if (scriptureNoteIds.length === 0) {
    return { parentNotesUpdated: 0, metadataRowsCopied: 0 };
  }

  const scriptureIdSet = new Set(scriptureNoteIds);
  /** parent note id -> child scripture note ids referenced in its content or junctions */
  const childIdsByParent = new Map<string, Set<string>>();

  const junctions = await db
    .select({
      noteId: NoteScriptureReferences.noteId,
      scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
    })
    .from(NoteScriptureReferences)
    .where(inArray(NoteScriptureReferences.scriptureNoteId, scriptureNoteIds));

  let metadataRowsCopied = 0;
  for (const junction of junctions) {
    if (!scriptureIdSet.has(junction.scriptureNoteId)) continue;
    const childSet = childIdsByParent.get(junction.noteId) ?? new Set<string>();
    childSet.add(junction.scriptureNoteId);
    childIdsByParent.set(junction.noteId, childSet);
    metadataRowsCopied += await copyScriptureMetadataToParent(junction.noteId, junction.scriptureNoteId);
  }

  for (const scriptureId of scriptureNoteIds) {
    const parents = await db
      .select({ id: Notes.id, content: Notes.content })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, userId),
          ne(Notes.noteType, 'scripture'),
          not(eq(Notes.contentEncrypted, true)),
          or(
            like(Notes.content, `%data-note-id="${scriptureId}"%`),
            like(Notes.content, `%data-note-id='${scriptureId}'%`),
          ),
        ),
      );

    for (const parent of parents) {
      const childSet = childIdsByParent.get(parent.id) ?? new Set<string>();
      if (!childSet.has(scriptureId)) {
        childSet.add(scriptureId);
        childIdsByParent.set(parent.id, childSet);
        metadataRowsCopied += await copyScriptureMetadataToParent(parent.id, scriptureId);
      }
    }
  }

  let parentNotesUpdated = 0;
  for (const [parentId, childIds] of childIdsByParent.entries()) {
    const parent = first(
      await db
        .select({ id: Notes.id, content: Notes.content })
        .from(Notes)
        .where(and(eq(Notes.id, parentId), eq(Notes.userId, userId), not(eq(Notes.contentEncrypted, true))))
        .limit(1),
    );
    if (!parent?.content) continue;

    let nextContent = parent.content;
    for (const childId of childIds) {
      nextContent = rewriteScripturePillNoteIdInHtml(nextContent, childId, parentId);
    }
    if (nextContent === parent.content) continue;

    await db
      .update(Notes)
      .set({ content: nextContent, updatedAt: nowISO() })
      .where(and(eq(Notes.id, parentId), eq(Notes.userId, userId)));
    parentNotesUpdated += 1;
  }

  return { parentNotesUpdated, metadataRowsCopied };
}

/** Delete every noteType: scripture row for a user (after migration). */
export async function purgeLegacyScriptureNotesForUser(userId: string): Promise<PurgeLegacyScriptureResult> {
  const { parentNotesUpdated, metadataRowsCopied } = await migrateParentNotesFromLegacyScriptureChildren(userId);

  const scriptureNoteIds = await listLegacyScriptureNoteIds(userId);
  if (scriptureNoteIds.length === 0) {
    return { scriptureNotesDeleted: 0, parentNotesUpdated, metadataRowsCopied };
  }

  const { deletedNoteIds } = await deleteNotesCascadeForUser(userId, scriptureNoteIds);
  await recordDeletedEntities(userId, 'note', deletedNoteIds);

  return {
    scriptureNotesDeleted: deletedNoteIds.length,
    parentNotesUpdated,
    metadataRowsCopied,
  };
}

export async function findUsersWithLegacyScriptureNotes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: Notes.userId })
    .from(Notes)
    .where(eq(Notes.noteType, 'scripture'));
  return rows.map((r) => r.userId).filter(Boolean);
}

export async function countLegacyScriptureNotesForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
  return rows[0]?.count ?? 0;
}
