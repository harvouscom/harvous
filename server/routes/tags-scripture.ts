/**
 * Tags + Scripture routes — Hono port of src/pages/api/tags/*.ts and src/pages/api/scripture/*.ts
 *
 * Endpoints:
 *   POST   /api/tags/create
 *   DELETE  /api/tags/delete
 *   GET    /api/tags/list
 *   POST   /api/scripture/check-existing
 *   POST   /api/scripture/detect
 *   POST   /api/scripture/fetch-verse
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, first, Tags, NoteTags, ScriptureMetadata, Notes, NoteThreads, eq, and, count } from '../db';
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

    const existingTag = first(await db
      .select()
      .from(Tags)
      .where(and(eq(Tags.userId, auth.userId), eq(Tags.name, name.trim())))
      .limit(1));

    if (existingTag) {
      return c.json({ error: 'Tag already exists' }, 409);
    }

    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(Tags).values({
      id: tagId,
      name: name.trim(),
      color: color || '#006eff',
      category: category || 'spiritual',
      userId: auth.userId,
      isSystem: false,
      createdAt: nowISO(),
    });

    return c.json({
      success: true,
      tag: {
        id: tagId,
        name: name.trim(),
        color: color || '#006eff',
        category: category || 'spiritual',
        userId: auth.userId,
        isSystem: false,
        createdAt: new Date().toISOString(),
      },
    }, 201);
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

    const tagsWithCounts = await Promise.all(
      tags.map(async (tag) => {
        const noteCount = await db
          .select({ count: count() })
          .from(NoteTags)
          .where(eq(NoteTags.tagId, tag.id));

        return { ...tag, noteCount: noteCount[0]?.count || 0 };
      })
    );

    return c.json({ success: true, tags: tagsWithCounts });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/tags/list', action: 'list_tags' });
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

    const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(NoteTags).values({
      id: relationId, noteId, tagId, isAutoGenerated, confidence, createdAt: nowISO(),
    });

    return c.json({ success: true, message: 'Tag assigned to note', relationId }, 201);
  } catch (error) {
    console.error('Error assigning tag to note:', error);
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

    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));

    return c.json({ success: true, message: 'Tag removed from note' });
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

    const noteTags = await db
      .select({
        id: NoteTags.id, noteId: NoteTags.noteId, tagId: NoteTags.tagId,
        isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt,
        tag: { id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem },
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, auth.userId)));

    return c.json({ success: true, tags: noteTags });
  } catch (error) {
    console.error('Error fetching note tags:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
