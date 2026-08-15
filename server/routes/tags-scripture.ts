/**
 * Tags + Scripture routes — Hono port of src/pages/api/tags/*.ts and src/pages/api/scripture/*.ts
 *
 * Endpoints:
 *   POST   /api/tags/create
 *   DELETE  /api/tags/delete
 *   GET    /api/tags/list
 *   GET    /api/tags/notes-by-tag
 *   POST   /api/scripture/check-existing
 *   POST   /api/scripture/detect
 *   POST   /api/scripture/fetch-verse
 *   GET    /api/scripture/chapter
 *   GET    /api/scripture/chapter-notes
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, first, Tags, NoteTags, ScriptureMetadata, Notes, SpaceNotes, NoteThreads, Threads, VerseTextCache, BibleVerses, eq, and, count, isNotNull, isNull } from '../db';
import { bookChapterCount } from '@/utils/bible-book-chapters';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import {
  detectScripture,
  getPrimaryReference,
  parseScriptureReference,
  normalizeScriptureReference,
} from '@/utils/scripture-detector';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { nowISO } from '../db/dates';
import { updateCanonicalNoteInTransaction } from '../utils/note-version-service';
import { broadcastCanonicalNoteInvalidation } from '../utils/broadcast-shared-space-note';
import {
  dedupeNoteTagsForResponse,
  getOrCreateTag,
  noteHasTagWithNormalizedName,
  removeNoteTagsByName,
  removeNoteTagById,
  addDismissedAutoTag,
  removeDismissedAutoTag,
  fetchNoteTagsForResponse,
  parseDismissedAutoTags,
} from '../utils/tag-helpers';

const app = new Hono();

// ─── Tags ───────────────────────────────────────────────────────────

/** POST /api/tags/create */
app.post('/api/tags/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { name, color, category } = await c.req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'Tag name is required' }, 400);
    }

    const { tagId, created, tag } = await getOrCreateTag(auth.userId, name.trim(), {
      color: color || '#006eff',
      category: category || 'spiritual',
      isSystem: false,
    });

    return c.json({
      success: true,
      created,
      tag: {
        id: tagId,
        name: tag.name,
        color: tag.color || color || '#006eff',
        category: tag.category || category || 'spiritual',
        userId: auth.userId,
        isSystem: tag.isSystem,
        createdAt: tag.createdAt,
      },
    }, created ? 201 : 200);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/tags/create', action: 'create_tag' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** DELETE /api/tags/delete */
app.delete('/api/tags/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const tagId = c.req.query('tagId');
    if (!tagId) {
      return c.json({ error: 'Tag ID is required' }, 400);
    }

    const tag = first(await db
      .select()
      .from(Tags)
      .where(and(eq(Tags.id, tagId), eq(Tags.userId, auth.userId)))
      .limit(1));

    if (!tag) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    if (tag.isSystem) {
      return c.json({ error: 'Cannot delete system tags' }, 403);
    }

    await db.delete(NoteTags).where(eq(NoteTags.tagId, tagId));
    await db.delete(Tags).where(eq(Tags.id, tagId));

    return c.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/tags/delete', action: 'delete_tag' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/tags/list */
app.get('/api/tags/list', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const tags = await db
      .select()
      .from(Tags)
      .where(eq(Tags.userId, auth.userId))
      .orderBy(Tags.name);

    const counts = await db
      .select({ tagId: NoteTags.tagId, noteCount: count() })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(eq(Tags.userId, auth.userId))
      .groupBy(NoteTags.tagId);

    const countMap = new Map(counts.map((row) => [row.tagId, Number(row.noteCount) || 0]));
    const tagsWithCounts = tags.map((tag) => ({
      ...tag,
      noteCount: countMap.get(tag.id) ?? 0,
    }));

    return c.json({ success: true, tags: tagsWithCounts });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/tags/list', action: 'list_tags' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/tags/notes-by-tag?tagId=&spaceId= — note ids linked to a tag (optional space scope). */
app.get('/api/tags/notes-by-tag', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const tagId = c.req.query('tagId')?.trim();
    const spaceId = c.req.query('spaceId')?.trim() || null;

    if (!tagId) return c.json({ error: 'Tag ID is required' }, 400);

    const tag = first(
      await db.select({ id: Tags.id }).from(Tags).where(and(eq(Tags.id, tagId), eq(Tags.userId, auth.userId))).limit(1),
    );
    if (!tag) return c.json({ error: 'Tag not found' }, 404);

    const filters = [eq(NoteTags.tagId, tagId), eq(Notes.userId, auth.userId)];
    if (spaceId) filters.push(eq(Notes.spaceId, spaceId));

    const rows = await db
      .select({ noteId: NoteTags.noteId })
      .from(NoteTags)
      .innerJoin(Notes, eq(NoteTags.noteId, Notes.id))
      .where(and(...filters));

    return c.json({ success: true, noteIds: rows.map((row) => row.noteId) });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/tags/notes-by-tag', action: 'list_tag_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Scripture ──────────────────────────────────────────────────────

/** POST /api/scripture/check-existing */
app.post('/api/scripture/check-existing', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { reference, threadId, translation } = await c.req.json();

    if (!reference || typeof reference !== 'string') {
      return c.json({ error: 'Scripture reference is required' }, 400);
    }

    const normalizedReference = normalizeScriptureReference(reference);

    // Exact match on normalized reference (optionally filtered by translation)
    const baseConditions = [eq(ScriptureMetadata.reference, normalizedReference), eq(Notes.userId, auth.userId)];
    if (translation) {
      baseConditions.push(eq(ScriptureMetadata.translation, translation));
    }
    let existingScripture = first(await db
      .select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(and(...baseConditions))
      .limit(1));

    // Fallback: normalize stored references for legacy data
    if (!existingScripture) {
      const allUserScripture = await db
        .select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference })
        .from(ScriptureMetadata)
        .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
        .where(eq(Notes.userId, auth.userId))
        ;

      for (const scripture of allUserScripture) {
        if (normalizeScriptureReference(scripture.reference) === normalizedReference) {
          existingScripture = scripture;
          break;
        }
      }
    }

    if (!existingScripture) {
      return c.json({ exists: false, noteId: null, inThread: false, inUnorganized: false });
    }

    let inThread = false;
    if (threadId) {
      const threadRelation = first(await db
        .select()
        .from(NoteThreads)
        .where(and(eq(NoteThreads.noteId, existingScripture.noteId), eq(NoteThreads.threadId, threadId)))
        .limit(1));
      inThread = !!threadRelation;
    }

    const threadCount = first(await db
      .select({ count: count() })
      .from(NoteThreads)
      .where(eq(NoteThreads.noteId, existingScripture.noteId))
      .limit(1));

    const inUnorganized = !threadCount || threadCount.count === 0;

    return c.json({
      exists: true,
      noteId: existingScripture.noteId,
      reference: existingScripture.reference,
      inThread,
      inUnorganized,
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/check-existing', action: 'check_existing_scripture' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/scripture/detect */
app.post('/api/scripture/detect', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Text is required' }, 400);
    }

    const detection = await detectScripture(text);
    const primaryReference = getPrimaryReference(detection);

    let parsedReference = null;
    if (primaryReference) {
      parsedReference = parseScriptureReference(primaryReference);
    }

    return c.json({ ...detection, primaryReference, parsedReference });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/detect', action: 'detect_scripture' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/scripture/fetch-verse */
app.post('/api/scripture/fetch-verse', async (c) => {
  try {
    const { reference, translation = 'NET' } = await c.req.json();

    if (!reference || typeof reference !== 'string') {
      return c.json({ error: 'Reference is required' }, 400);
    }

    const cleanReference = reference.replace(/,\s+/g, ',');
    const parsed = parseScriptureReference(cleanReference);
    if (!parsed) {
      return c.json({ error: 'Invalid scripture reference format' }, 400);
    }

    const verseText = await fetchVerseText(cleanReference, translation);
    if (!verseText) {
      return c.json({ error: 'No verses found for this reference' }, 404);
    }

    const verseNumber = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

    return c.json({ reference, book: parsed.book, chapter: parsed.chapter, verse: verseNumber, verseEnd, translation, text: verseText });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/fetch-verse', action: 'fetch_verse' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * GET /api/scripture/chapter — a whole chapter as structured verses, for the Bible reader.
 *
 * Deliberately not `fetch-verse`. That route returns one formatted HTML blob, which is right
 * for a pill or a dock card but cannot carry the reader's per-verse affordances: selection
 * snaps to a verse, margin notifiers anchor to a verse, and a highlight is stored against a
 * verse range. Parsing verse numbers back out of rendered HTML to recover that structure
 * would be inventing a boundary the database already has.
 */
app.get('/api/scripture/chapter', async (c) => {
  try {
    const bookParam = (c.req.query('book') ?? '').trim();
    const chapterParam = (c.req.query('chapter') ?? '').trim();
    const translation = (c.req.query('translation') ?? 'NET').trim().toUpperCase();

    if (!bookParam) return c.json({ error: 'book is required', code: 'BOOK_REQUIRED' }, 400);

    const chapter = Number.parseInt(chapterParam, 10);
    if (!Number.isInteger(chapter) || chapter < 1) {
      return c.json({ error: 'chapter must be a positive integer', code: 'INVALID_CHAPTER' }, 400);
    }

    // Route through the same canonicaliser the pills use, so "1 jn" / "Song of Solomon"
    // resolve to the spelling stored in BibleVerses instead of missing silently.
    //
    // Resolve the book against chapter 1 rather than the requested chapter: the parser
    // rejects an out-of-range chapter by returning null for the whole reference, which
    // would report a perfectly real book ("Jude 5") as an unknown one.
    const parsed = parseScriptureReference(`${bookParam} 1`);
    if (!parsed) return c.json({ error: 'Unknown book', code: 'INVALID_BOOK' }, 400);

    const knownChapters = bookChapterCount(parsed.book);
    if (knownChapters != null && chapter > knownChapters) {
      return c.json(
        {
          error: `${parsed.book} has ${knownChapters} chapter${knownChapters === 1 ? '' : 's'}`,
          code: 'CHAPTER_OUT_OF_RANGE',
        },
        404,
      );
    }

    const rows = await db
      .select({ verse: BibleVerses.verse, text: BibleVerses.text })
      .from(BibleVerses)
      .where(and(
        eq(BibleVerses.translationId, translation),
        eq(BibleVerses.book, parsed.book),
        eq(BibleVerses.chapter, chapter),
      ))
      .orderBy(BibleVerses.verse);

    if (rows.length === 0) {
      return c.json({ error: 'No verses found for this chapter', code: 'CHAPTER_NOT_FOUND' }, 404);
    }

    const chapterCount = bookChapterCount(parsed.book);

    // Scripture text is immutable and identical for every reader, so it overrides the API's
    // default `private, max-age=30`. Paging back a chapter should not re-hit the database.
    c.res.headers.set('Cache-Control', 'public, max-age=86400, immutable');

    return c.json({
      book: parsed.book,
      chapter,
      translation,
      // Lets the reader render prev/next affordances without a second round trip or
      // shipping the whole chapter-count table to the client.
      chapterCount,
      hasPrevChapter: chapter > 1,
      hasNextChapter: chapterCount != null ? chapter < chapterCount : false,
      verses: rows.map((r) => ({ number: r.verse, text: r.text })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/chapter', action: 'fetch_chapter' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/scripture/update-translation — Change a scripture note's translation */
app.post('/api/scripture/update-translation', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { noteId, newTranslation } = await c.req.json();

    if (!noteId || !newTranslation) {
      return c.json({ error: 'noteId and newTranslation are required' }, 400);
    }

    // Verify the note belongs to this user
    const note = first(await db.select()
      .from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note || note.userId !== auth.userId) {
      return c.json({ error: 'Note not found' }, 404);
    }
    if (note.contentEncrypted) {
      return c.json({ error: 'Locked notes cannot change translation', code: 'LOCKED_NOTE' }, 409);
    }

    // Update ScriptureMetadata translation
    const metadata = first(await db.select().from(ScriptureMetadata)
      .where(eq(ScriptureMetadata.noteId, noteId)).limit(1));

    if (metadata) {
      const oldTranslation = metadata.translation;
      const newVerseText = await fetchVerseText(metadata.reference, newTranslation);
      await db.transaction(async (tx) => {
        await tx.update(ScriptureMetadata)
          .set({ translation: newTranslation })
          .where(eq(ScriptureMetadata.id, metadata.id));
        if (newVerseText) {
          await updateCanonicalNoteInTransaction(tx, {
            noteId,
            actorId: auth.userId,
            patch: { updatedAt: nowISO() },
            nextContent: (lockedNote) => ({
              title: lockedNote.title,
              content: newVerseText,
              contentEncrypted: lockedNote.contentEncrypted,
            }),
            source: 'translation',
            now: nowISO(),
          });
        }
      });
      try {
        await db.delete(VerseTextCache).where(and(
          eq(VerseTextCache.reference, metadata.reference),
          eq(VerseTextCache.translation, oldTranslation),
        ));
      } catch (_) { /* cache clear is best-effort */ }
      if (newVerseText) {
        await broadcastCanonicalNoteInvalidation(auth.userId, noteId, {
          type: 'note:updated',
          id: noteId,
        });
      }
    }

    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/update-translation', action: 'update_scripture_translation' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Note Tags ──────────────────────────────────────────────────────

/** POST /api/note-tags/assign */
app.post('/api/note-tags/assign', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { noteId, tagId, isAutoGenerated = false, confidence } = await c.req.json();
    if (!noteId || !tagId) return c.json({ error: 'Note ID and Tag ID are required' }, 400);

    const tag = first(await db.select().from(Tags).where(and(eq(Tags.id, tagId), eq(Tags.userId, auth.userId))).limit(1));
    if (!tag) return c.json({ error: 'Tag not found' }, 404);

    const existingRelation = first(await db.select().from(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId))).limit(1));
    if (existingRelation) return c.json({ error: 'Tag already assigned to note' }, 409);

    if (await noteHasTagWithNormalizedName(noteId, tag.name, auth.userId)) {
      return c.json({ error: 'Tag already assigned to note' }, 409);
    }

    const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(NoteTags).values({
      id: relationId, noteId, tagId, isAutoGenerated, confidence, createdAt: nowISO(),
    });

    if (!isAutoGenerated) {
      await removeDismissedAutoTag(noteId, tag.name);
    }

    return c.json({ success: true, message: 'Tag assigned to note', relationId }, 201);
  } catch (error) {
    console.error('Error assigning tag to note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** DELETE /api/note-tags/remove-by-name — removes all tag links whose name matches (case-insensitive) */
app.delete('/api/note-tags/remove-by-name', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    const name = c.req.query('name');
    if (!noteId || !name) return c.json({ error: 'Note ID and tag name are required' }, 400);

    const noteRow = first(
      await db.select({ id: Notes.id, userId: Notes.userId }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
    );
    if (!noteRow || noteRow.userId !== auth.userId) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const { removed, hadAutoGenerated } = await removeNoteTagsByName(noteId, name, noteRow.userId);
    let dismissedAutoTags: string[] = [];
    if (hadAutoGenerated && removed > 0) {
      dismissedAutoTags = await addDismissedAutoTag(noteId, name);
    } else {
      const noteDismiss = first(
        await db.select({ dismissedAutoTags: Notes.dismissedAutoTags }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
      );
      dismissedAutoTags = parseDismissedAutoTags(noteDismiss?.dismissedAutoTags);
    }

    const tags = await fetchNoteTagsForResponse(noteId, noteRow.userId);
    return c.json({
      success: true,
      message: 'Tag removed from note',
      removed,
      dismissedAutoTags,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
    });
  } catch (error) {
    console.error('Error removing tag by name from note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** DELETE /api/note-tags/remove */
app.delete('/api/note-tags/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    const tagId = c.req.query('tagId');
    if (!noteId || !tagId) return c.json({ error: 'Note ID and Tag ID are required' }, 400);

    const noteRow = first(
      await db.select({ id: Notes.id, userId: Notes.userId }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
    );
    if (!noteRow || noteRow.userId !== auth.userId) {
      return c.json({ error: 'Note not found' }, 404);
    }

    const { removed, hadAutoGenerated, tagName } = await removeNoteTagById(noteId, tagId);
    if (!removed) return c.json({ error: 'Tag link not found' }, 404);

    let dismissedAutoTags: string[] = [];
    if (hadAutoGenerated && tagName) {
      dismissedAutoTags = await addDismissedAutoTag(noteId, tagName);
    } else {
      const noteDismiss = first(
        await db.select({ dismissedAutoTags: Notes.dismissedAutoTags }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
      );
      dismissedAutoTags = parseDismissedAutoTags(noteDismiss?.dismissedAutoTags);
    }

    const tags = await fetchNoteTagsForResponse(noteId, noteRow.userId);
    return c.json({
      success: true,
      message: 'Tag removed from note',
      dismissedAutoTags,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
    });
  } catch (error) {
    console.error('Error removing tag from note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/note-tags/list */
app.get('/api/note-tags/list', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const noteRow = first(await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId }).from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!noteRow) return c.json({ error: 'Note not found' }, 404);

    if (noteRow.userId !== auth.userId) {
      let spaceIdForAccess = noteRow.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = first(
          await db
            .select({ spaceId: Threads.spaceId })
            .from(NoteThreads)
            .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
            .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
            .limit(1)
        );
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found' }, 404);
      try {
        await requireSpaceAccess(spaceIdForAccess, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
    }

    const noteTags = await db
      .select({
        id: NoteTags.id, noteId: NoteTags.noteId, tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt,
        tag: { id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem },
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, noteRow.userId)));

    const deduped = dedupeNoteTagsForResponse(
      noteTags.map((row) => ({
        id: row.tag.id,
        name: row.tag.name,
        isAutoGenerated: row.isAutoGenerated,
        createdAt: row.createdAt.toISOString(),
      })),
    );
    const rowByTagId = new Map(noteTags.map((row) => [row.tag.id, row]));
    const tags = deduped
      .map((d) => rowByTagId.get(d.id))
      .filter((row): row is (typeof noteTags)[number] => !!row);

    return c.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching note tags:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Compact passage knowledge for the user's cited verses — themes/people/places per verse.
// The client caches this (offline) to power passage-aware folder/tag suggestions.
app.get('/api/scripture/passage-knowledge', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { getUserPassageKnowledge } = await import('../utils/scripture-knowledge');
    const passages = await getUserPassageKnowledge(auth.userId);
    return c.json({ success: true, passages });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/passage-knowledge', action: 'passage_knowledge' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// Full passage context for the scripture dock strip — themes, cross-refs, people/places, and the
// user's other notes that connect to the displayed passage (which may span a verse range).
app.get('/api/scripture/passage-context', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const reference = c.req.query('reference')?.trim();
    const noteId = c.req.query('noteId')?.trim() || undefined;
    if (!reference) return c.json({ error: 'Reference is required' }, 400);

    const parsed = parseScriptureReference(reference.replace(/,\s+/g, ','));
    if (!parsed) return c.json({ error: 'Invalid scripture reference format' }, 400);

    // Expand the (possibly ranged) reference into per-verse keys for the knowledge join.
    const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
    const passages = [];
    for (let v = verseStart; v <= verseEnd; v++) {
      passages.push({ book: parsed.book, chapter: parsed.chapter, verse: v });
    }

    const { getPassageContext } = await import('../utils/scripture-knowledge');
    const context = await getPassageContext(auth.userId, passages, { excludeNoteId: noteId });
    return c.json({ success: true, ...context });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/scripture/passage-context', action: 'passage_context' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/scripture/chapter-notes?book=&chapter= ─────────────────────────
/**
 * Which of your notes are anchored to verses in this chapter — the index behind the reader's
 * margin dots.
 *
 * `ScriptureMetadata` is already the passage→note index: one row per reference in a note,
 * carrying book / chapter / verse / verseEnd. Nothing new has to be recorded for the margin
 * to know what to mark; it only has to be asked by chapter instead of by note.
 *
 * Read-only by construction — it selects, so opening the reader can never bump a note's
 * `updatedAt`. That matters here specifically: `updatedAt` doubles as sort key and sync
 * watermark, and "merely looking re-sorted my notes" is a bug this codebase has had before.
 */
app.get('/api/scripture/chapter-notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const book = (c.req.query('book') ?? '').trim();
    const chapter = Number.parseInt((c.req.query('chapter') ?? '').trim(), 10);
    if (!book) return c.json({ error: 'book is required', code: 'BOOK_REQUIRED' }, 400);
    if (!Number.isFinite(chapter)) {
      return c.json({ error: 'chapter is required', code: 'CHAPTER_REQUIRED' }, 400);
    }

    /*
     * Joined to Notes for ownership — ScriptureMetadata carries no userId of its own, so
     * without this a chapter query would return every user's anchors for that chapter.
     *
     * Joined to SpaceNotes to skip removed ones. A note is deleted by stamping
     * `SpaceNotes.removedAt`, not by dropping the Notes row, and its scripture anchors
     * outlive that — so without this the margin would mark verses with dots that open
     * nothing. `innerJoin` also means a note belonging to no space contributes no dot, which
     * is right: there is nowhere for the tap to go.
     */
    const rows = await db
      .select({
        noteId: ScriptureMetadata.noteId,
        reference: ScriptureMetadata.reference,
        verse: ScriptureMetadata.verse,
        verseEnd: ScriptureMetadata.verseEnd,
        chapterEnd: ScriptureMetadata.chapterEnd,
        title: Notes.title,
        updatedAt: Notes.updatedAt,
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(Notes.id, ScriptureMetadata.noteId))
      .innerJoin(SpaceNotes, eq(SpaceNotes.noteId, ScriptureMetadata.noteId))
      .where(
        and(
          eq(ScriptureMetadata.book, book),
          eq(ScriptureMetadata.chapter, chapter),
          eq(Notes.userId, auth.userId),
          isNull(SpaceNotes.removedAt),
        ),
      );

    return c.json({ success: true, anchors: rows });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/scripture/chapter-notes',
      action: 'chapter_notes',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
