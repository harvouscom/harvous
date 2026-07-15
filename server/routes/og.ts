/**
 * Open Graph routes.
 *
 *   GET /api/og/referral/:code            — referral OG image (temporarily disabled)
 *   GET /api/og/share/note/:shareToken    — OG meta HTML for a shared note
 *   GET /api/og/share/thread/:shareToken  — OG meta HTML for a shared thread
 *   GET /api/og/image/note/:shareToken    — 1200×630 PNG (screenshot; satori fallback)
 *   GET /api/og/image/thread/:shareToken  — 1200×630 PNG (screenshot; satori fallback)
 *
 * Production Netlify prefers the dedicated `og-image` function (Chromium) via
 * public/_redirects. These Hono routes power local `dev:api` and act as fallback.
 *
 * Rollout for unfurls: Netlify edge function `shared-og` rewrites crawler
 * user-agents on `/shared/note|thread/:token` to `/api/og/share/...` routes.
 */

import { Hono } from 'hono';
import {
  db,
  Notes,
  Threads,
  NoteThreads,
  ScriptureMetadata,
  ResourceMetadata,
  eq,
  and,
  count,
  first,
} from '../db';
import { isValidShareToken } from '@/utils/ids';
import { rateLimit } from '@/utils/rate-limit';
import {
  createOgImageResponse,
  fallbackImageHtml,
} from '@/utils/og-image';
import { renderShareOgHtml, renderNotFoundOgHtml } from '../utils/og-html';
import {
  buildNoteCardHtml,
  noteOgDescription,
  noteOgTitle,
} from '../utils/og-note-cards';
import { buildThreadCardHtml } from '../utils/og-thread-cards';

const route = new Hono();

/** Cache-bust for iMessage / social after OG generator changes */
const OG_IMAGE_VERSION = '5';

route.get('/api/og/referral/:code', (c) => {
  return c.text('OG image temporarily disabled', 200);
});

async function loadPublicNote(shareToken: string) {
  return first(
    await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        contentEncrypted: Notes.contentEncrypted,
      })
      .from(Notes)
      .where(
        and(
          eq(Notes.shareToken, shareToken),
          eq(Notes.isPublic, true),
          eq(Notes.contentEncrypted, false),
        ),
      )
      .limit(1),
  );
}

async function loadNoteMetadata(noteId: string, noteType: string | null | undefined) {
  let scriptureMetadata = null;
  let resourceMetadata = null;

  if (noteType === 'scripture') {
    scriptureMetadata =
      first(
        await db
          .select({
            reference: ScriptureMetadata.reference,
            book: ScriptureMetadata.book,
            chapter: ScriptureMetadata.chapter,
            verse: ScriptureMetadata.verse,
            verseEnd: ScriptureMetadata.verseEnd,
            translation: ScriptureMetadata.translation,
          })
          .from(ScriptureMetadata)
          .where(eq(ScriptureMetadata.noteId, noteId))
          .limit(1),
      ) ?? null;
  } else if (noteType === 'resource') {
    resourceMetadata =
      first(
        await db
          .select({
            sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription,
            sourceImage: ResourceMetadata.sourceImage,
            sourceName: ResourceMetadata.sourceName,
            sourceDomain: ResourceMetadata.sourceDomain,
          })
          .from(ResourceMetadata)
          .where(eq(ResourceMetadata.noteId, noteId))
          .limit(1),
      ) ?? null;
  }

  return { scriptureMetadata, resourceMetadata };
}

async function tryScreenshotPng(pageUrl: string): Promise<Buffer | null> {
  try {
    const { captureShareOgScreenshot } = await import('../utils/og-screenshot');
    return await captureShareOgScreenshot(pageUrl);
  } catch (error) {
    console.error('[og] screenshot failed, using satori fallback:', error);
    return null;
  }
}

function pngResponse(png: Buffer): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

route.get('/api/og/share/note/:shareToken', rateLimit('read'), async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;
  const canonicalUrl = `${origin}/shared/note/${shareToken}`;

  if (!isValidShareToken(shareToken)) {
    return c.html(renderNotFoundOgHtml(canonicalUrl), 200);
  }

  const note = await loadPublicNote(shareToken);
  if (!note) return c.html(renderNotFoundOgHtml(canonicalUrl), 200);

  const { scriptureMetadata, resourceMetadata } = await loadNoteMetadata(note.id, note.noteType);

  return c.html(
    renderShareOgHtml({
      title: noteOgTitle(note.title, note.noteType, scriptureMetadata),
      description: noteOgDescription(
        note.content,
        note.noteType,
        scriptureMetadata,
        resourceMetadata,
      ),
      canonicalUrl,
      imageUrl: `${origin}/api/og/image/note/${shareToken}?v=${OG_IMAGE_VERSION}`,
    }),
    200,
  );
});

route.get('/api/og/share/thread/:shareToken', rateLimit('read'), async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;
  const canonicalUrl = `${origin}/shared/thread/${shareToken}`;

  if (!isValidShareToken(shareToken)) {
    return c.html(renderNotFoundOgHtml(canonicalUrl), 200);
  }

  const thread = first(
    await db
      .select({ title: Threads.title, subtitle: Threads.subtitle })
      .from(Threads)
      .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
      .limit(1),
  );

  if (!thread) return c.html(renderNotFoundOgHtml(canonicalUrl), 200);

  return c.html(
    renderShareOgHtml({
      title: thread.title?.trim() || 'Shared study thread',
      description: thread.subtitle?.trim() || 'A shared study thread on Harvous.',
      canonicalUrl,
      imageUrl: `${origin}/api/og/image/thread/${shareToken}?v=${OG_IMAGE_VERSION}`,
    }),
    200,
  );
});

route.get('/api/og/image/note/:shareToken', rateLimit('read'), async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;

  if (!isValidShareToken(shareToken)) {
    return createOgImageResponse(fallbackImageHtml('Invalid share link'));
  }

  try {
    const note = await loadPublicNote(shareToken);
    if (!note) {
      return createOgImageResponse(fallbackImageHtml('Note not found'));
    }

    const shot = await tryScreenshotPng(`${origin}/shared/note/${shareToken}?ogCapture=1`);
    if (shot) return pngResponse(shot);

    const { scriptureMetadata, resourceMetadata } = await loadNoteMetadata(
      note.id,
      note.noteType,
    );

    return createOgImageResponse(
      buildNoteCardHtml({
        title: note.title || 'Untitled Note',
        content: note.content || '',
        noteType: note.noteType,
        scriptureMetadata,
        resourceMetadata,
      }),
    );
  } catch (error) {
    console.error('Error generating note OG image:', error);
    return createOgImageResponse(fallbackImageHtml('Error loading note'));
  }
});

route.get('/api/og/image/thread/:shareToken', rateLimit('read'), async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;

  if (!isValidShareToken(shareToken)) {
    return createOgImageResponse(fallbackImageHtml('Invalid share link'));
  }

  try {
    const thread = first(
      await db
        .select({
          id: Threads.id,
          title: Threads.title,
          subtitle: Threads.subtitle,
          color: Threads.color,
        })
        .from(Threads)
        .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
        .limit(1),
    );

    if (!thread) {
      return createOgImageResponse(fallbackImageHtml('Thread not found'));
    }

    const shot = await tryScreenshotPng(`${origin}/shared/thread/${shareToken}?ogCapture=1`);
    if (shot) return pngResponse(shot);

    const noteCountRow = first(
      await db
        .select({ value: count() })
        .from(NoteThreads)
        .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(
          and(eq(NoteThreads.threadId, thread.id), eq(Notes.contentEncrypted, false)),
        ),
    );
    const noteCount = Number(noteCountRow?.value ?? 0);

    return createOgImageResponse(
      buildThreadCardHtml({
        title: thread.title || 'Untitled Thread',
        subtitle: thread.subtitle,
        color: thread.color,
        noteCount,
      }),
    );
  } catch (error) {
    console.error('Error generating thread OG image:', error);
    return createOgImageResponse(fallbackImageHtml('Error loading thread'));
  }
});

export default route;
