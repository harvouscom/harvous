/**
 * Insert one parsed import row as a note.
 *
 * Extracted from the single-request import loop so the session-based import can
 * commit a few items per request without the two paths drifting apart. Everything
 * that used to live in loop-local variables (the running simple-note id, the
 * dedupe index, the sourceId map) is now passed in and handed back.
 *
 * Enrichment (auto-tags + scripture pills) is deliberately NOT run here — the
 * session flow runs it as its own phase so the UI can show it, and so a scripture
 * failure can't take an otherwise-good note down with it.
 */
import {
  db, first, Notes, Threads, NoteTags, NoteThreads, UserMetadata,
  ScriptureMetadata, StudyThreadEntries,
  eq, and,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { THREAD_COLORS } from '@/utils/colors';
import { markdownToHtml } from '@/utils/markdown-to-html';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';
import { ensureUnorganizedThread } from './unorganized-thread';
import { getOrCreateTag } from './tag-helpers';
import { serializeNoteSecondaryCollections } from './note-secondary-collections';
import { createInitialNoteVersion } from './note-version-service';
import { buildLegacyAnchorMigrationPatch } from './durable-note-anchor';
import { noteDedupeKey } from './import-dedupe';
import type { ImportFormat, ParsedImportRow } from './parse-import-files';
import type { ParsedCSVNote } from '@/utils/csv-parser';
import type { ParsedMarkdownNote } from '@/utils/markdown-import-parser';

export interface RateSlotDenied {
  allowed: false;
  error: string;
  retryAfterSec: number;
}
export type RateSlotResult = { allowed: true } | RateSlotDenied;

export interface ImportCommitContext {
  userId: string;
  format: ImportFormat;
  /** Highest simple note id in use; the caller carries the returned value forward. */
  highestSimpleNoteId: number;
  /** Existing notes by dedupe key. Mutated as notes are created so a batch self-dedupes. */
  dedupeIndex: Map<string, string>;
  /** Which rate bucket to charge — legacy import uses the interactive one, sessions their own. */
  consumeRateSlot: () => RateSlotResult;
}

export type ImportCommitOutcome =
  | {
      status: 'committed';
      noteId: string;
      sourceId: string | null;
      threadId: string;
      threadCreated: boolean;
      tagsCreated: number;
      highlightsImported: number;
      highestSimpleNoteId: number;
      primaryCollection: string | null;
      secondaryCollections: string[];
      /** Non-fatal problems (a tag that wouldn't attach); the note still landed. */
      warnings: string[];
    }
  | { status: 'duplicate'; noteId: string | null; sourceId: string | null }
  | { status: 'rate-limited'; error: string; retryAfterSec: number }
  | { status: 'failed'; error: string };

/** Note fields a parsed row resolves to, before any DB work. */
interface ResolvedImportNote {
  title: string | null;
  content: string;
  threadColor: string | null;
  tags: string[];
  createdDate: Date;
  scriptureReference: string | null;
  scriptureTranslation: string | null;
  sourceId: string | null;
  portableRefs: string[];
}

function parseExportDate(dateString: string | null): Date {
  if (!dateString) return new Date();
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Resolve the note fields a parsed row carries, per import format. */
export function resolveImportNoteFields(row: ParsedImportRow, format: ImportFormat): ResolvedImportNote {
  const { note: parsedNote, portableBuild } = row;

  if (format === 'csv-threads') {
    const csvNote = parsedNote as ParsedCSVNote;
    return {
      title: csvNote.noteTitle || null,
      content: csvNote.content,
      threadColor: csvNote.threadColor || null,
      tags: csvNote.tags || [],
      createdDate: parseExportDate(csvNote.createdDate),
      scriptureReference: null,
      scriptureTranslation: null,
      sourceId: null,
      portableRefs: [],
    };
  }

  const mdNote = parsedNote as ParsedMarkdownNote;
  return {
    title: mdNote.title || null,
    content: portableBuild ? portableBuild.htmlContent : markdownToHtml(mdNote.content),
    threadColor:
      mdNote.threadColor && THREAD_COLORS.includes(mdNote.threadColor as any) ? mdNote.threadColor : null,
    tags: mdNote.tags || [],
    createdDate: parseExportDate(mdNote.createdDate),
    scriptureReference: mdNote.scriptureReference || null,
    scriptureTranslation: mdNote.scriptureTranslation || null,
    sourceId: mdNote.portable?.meta.id || null,
    portableRefs: Array.isArray(mdNote.portable?.meta?.refs)
      ? mdNote.portable!.meta.refs!.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [],
  };
}

/** Title/content as they are stored — first letter capitalized, matching note creation. */
export function capitalizeForStorage(title: string | null, content: string): {
  title: string | null;
  content: string;
} {
  return {
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : null,
    content: content.charAt(0).toUpperCase() + content.slice(1),
  };
}

/**
 * Load every existing note of this user keyed by dedupe key. One query per import
 * request instead of one per note — the old loop re-read the whole notes table for
 * every single row it imported.
 */
export async function loadUserDedupeIndex(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: Notes.id, title: Notes.title, content: Notes.content })
    .from(Notes)
    .where(eq(Notes.userId, userId));
  const index = new Map<string, string>();
  for (const row of rows) {
    const key = noteDedupeKey(row.title, row.content);
    if (!index.has(key)) index.set(key, row.id);
  }
  return index;
}

function getThreadColorFromTitle(threadTitle: string): string {
  const availableColors = THREAD_COLORS.filter((color) => color !== 'paper');
  let hash = 0;
  for (let i = 0; i < threadTitle.length; i++) {
    hash = (hash << 5) - hash + threadTitle.charCodeAt(i);
    hash = hash & hash;
  }
  return availableColors[Math.abs(hash) % availableColors.length];
}

export async function getOrCreateThread(
  userId: string,
  threadTitle: string,
  threadColor?: string | null,
): Promise<{ threadId: string; created: boolean }> {
  if (!threadTitle || threadTitle.trim() === '' || isMyPileDisplayTitle(threadTitle)) {
    await ensureUnorganizedThread(userId);
    return { threadId: 'thread_unorganized', created: false };
  }
  const existingThread = first(
    await db
      .select()
      .from(Threads)
      .where(and(eq(Threads.userId, userId), eq(Threads.title, threadTitle.trim())))
      .limit(1),
  );
  if (existingThread) return { threadId: existingThread.id, created: false };

  const capitalizedTitle = threadTitle.trim().charAt(0).toUpperCase() + threadTitle.trim().slice(1);
  const finalColor =
    threadColor && THREAD_COLORS.includes(threadColor as any)
      ? threadColor
      : getThreadColorFromTitle(threadTitle.trim());

  const newThread = first(
    await db
      .insert(Threads)
      .values({
        id: generateThreadId(),
        title: capitalizedTitle,
        subtitle: null,
        spaceId: null,
        userId,
        isPublic: false,
        color: finalColor,
        isPinned: false,
        createdAt: nowISO(),
      })
      .returning(),
  )!;
  return { threadId: newThread.id, created: true };
}

/**
 * Insert one parsed row. Never throws for expected outcomes — duplicates, rate
 * denials, and per-note failures come back as outcome statuses so the caller can
 * keep going (or stop) on its own terms.
 */
export async function commitImportItem(
  row: ParsedImportRow,
  ctx: ImportCommitContext,
): Promise<ImportCommitOutcome> {
  try {
    const { primaryCollection, secondaryCollections } = row;
    const resolved = resolveImportNoteFields(row, ctx.format);
    const { title: capitalizedTitle, content: capitalizedContent } = capitalizeForStorage(
      resolved.title,
      resolved.content,
    );

    // Idempotent re-import: a backup carries the original note id (sourceId). If that
    // note already exists for this user, skip it (don't clobber edits) but report the
    // id so connections to/from it still restore. Cross-account imports won't match.
    if (resolved.sourceId) {
      const existingById = first(
        await db
          .select({ id: Notes.id })
          .from(Notes)
          .where(and(eq(Notes.id, resolved.sourceId), eq(Notes.userId, ctx.userId)))
          .limit(1),
      );
      if (existingById) {
        return { status: 'duplicate', noteId: existingById.id, sourceId: resolved.sourceId };
      }
    }

    // Fall back to content-based dedupe so rows created without a preserved id still match.
    const dedupeKey = noteDedupeKey(capitalizedTitle, capitalizedContent);
    const dupId = ctx.dedupeIndex.get(dedupeKey);
    if (dupId) {
      return { status: 'duplicate', noteId: dupId, sourceId: resolved.sourceId };
    }

    const slot = ctx.consumeRateSlot();
    if (!slot.allowed) {
      return { status: 'rate-limited', error: slot.error, retryAfterSec: slot.retryAfterSec };
    }

    const { threadId, created: threadCreated } = await getOrCreateThread(
      ctx.userId,
      primaryCollection || '',
      resolved.threadColor,
    );

    const nextSimpleNoteId = ctx.highestSimpleNoteId + 1;
    const noteType: 'default' | 'scripture' | 'resource' = resolved.scriptureReference ? 'scripture' : 'default';
    const secondarySerialized = serializeNoteSecondaryCollections(secondaryCollections);

    const { newNote, importedHighlightCount } = await db.transaction(async (tx) => {
      const inserted = first(
        await tx
          .insert(Notes)
          .values({
            id: generateNoteId(),
            content: capitalizedContent,
            title: capitalizedTitle,
            threadId: 'thread_unorganized',
            spaceId: null,
            simpleNoteId: nextSimpleNoteId,
            noteType,
            userId: ctx.userId,
            isPublic: false,
            createdAt: resolved.createdDate,
            contentEncrypted: false,
            // Modern folder system (what the 2.0 UI displays). Explicit folders mark an
            // override so auto-collection suggestion doesn't reshuffle imported structure.
            primaryCollection: primaryCollection || null,
            secondaryCollections: secondarySerialized,
            collectionUserOverride: !!primaryCollection,
          })
          .returning(),
      )!;

      const initialVersion = await createInitialNoteVersion(tx, {
        noteId: inserted.id,
        noteAuthorId: ctx.userId,
        content: {
          title: inserted.title,
          content: inserted.content,
          contentEncrypted: inserted.contentEncrypted,
        },
        createdAt: resolved.createdDate,
        source: 'import',
      });

      await tx
        .update(UserMetadata)
        .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, ctx.userId));

      if (threadId !== 'thread_unorganized') {
        await tx.insert(NoteThreads).values({
          id: `note-thread-${crypto.randomUUID()}`,
          noteId: inserted.id,
          threadId,
          createdAt: nowISO(),
        });
        await tx
          .update(Threads)
          .set({ updatedAt: nowISO() })
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, ctx.userId)));
      }

      if (resolved.scriptureReference && noteType === 'scripture') {
        const parsedReference = parseScriptureReference(resolved.scriptureReference);
        if (parsedReference) {
          const verse = Array.isArray(parsedReference.verse) ? parsedReference.verse[0] : parsedReference.verse;
          const verseEnd = Array.isArray(parsedReference.verse) ? parsedReference.verse[1] : undefined;
          await tx.insert(ScriptureMetadata).values({
            id: `scripture_${crypto.randomUUID()}`,
            noteId: inserted.id,
            reference: resolved.scriptureReference,
            book: parsedReference.book,
            chapter: parsedReference.chapter,
            verse,
            verseEnd,
            translation: resolved.scriptureTranslation || 'NET',
            originalText: '',
            createdAt: nowISO(),
          });
        }
      }

      let insertedHighlights = 0;
      for (const studyRow of row.portableBuild?.studyInserts ?? []) {
        const migratedAt = new Date();
        const anchorPatch = buildLegacyAnchorMigrationPatch({
          baselineVersionId: initialVersion.id,
          baselineContent: inserted.content,
          anchorLocation: studyRow.anchorLocation,
          anchorLength: studyRow.anchorLength,
          anchorTextSnapshot: studyRow.anchorTextSnapshot,
          sourceSnippet: studyRow.sourceSnippet,
          migratedAt,
        });
        await tx.insert(StudyThreadEntries).values({
          ...studyRow,
          parentNoteId: inserted.id,
          userId: ctx.userId,
          spaceId: null,
          ...anchorPatch,
          resolvedVersionId: initialVersion.id,
          createdAt: new Date(studyRow.createdAt),
          updatedAt: studyRow.updatedAt ? new Date(studyRow.updatedAt) : null,
        });
        insertedHighlights++;
      }

      return { newNote: inserted, importedHighlightCount: insertedHighlights };
    });

    ctx.dedupeIndex.set(dedupeKey, newNote.id);

    // Resolve tag ids (sequential for dedup) then insert the note↔tag rows in one batch.
    const warnings: string[] = [];
    let tagsCreated = 0;
    const noteTagRows: (typeof NoteTags.$inferInsert)[] = [];
    const seenTagIds = new Set<string>();
    for (const tagName of resolved.tags) {
      try {
        const { tagId, created: tagCreated } = await getOrCreateTag(ctx.userId, tagName);
        if (tagCreated) tagsCreated++;
        if (seenTagIds.has(tagId)) continue;
        seenTagIds.add(tagId);
        noteTagRows.push({
          id: `note-tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          noteId: newNote.id,
          tagId,
          isAutoGenerated: false,
          confidence: null,
          createdAt: nowISO(),
        });
      } catch {
        warnings.push(`Failed to create tag "${tagName}" for "${row.title}"`);
      }
    }
    if (noteTagRows.length > 0) {
      try {
        await db.insert(NoteTags).values(noteTagRows);
      } catch {
        warnings.push(`Failed to attach tags for "${row.title}"`);
      }
    }

    return {
      status: 'committed',
      noteId: newNote.id,
      sourceId: resolved.sourceId,
      threadId,
      threadCreated,
      tagsCreated,
      highlightsImported: importedHighlightCount,
      highestSimpleNoteId: nextSimpleNoteId,
      primaryCollection: primaryCollection || null,
      secondaryCollections,
      warnings,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
