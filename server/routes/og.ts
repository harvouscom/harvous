/**
 * Open Graph routes.
 *
 *   GET /api/og/referral/:code            — referral OG image (temporarily disabled)
 *   GET /api/og/share/note/:shareToken    — OG meta HTML for a shared note
 *   GET /api/og/share/thread/:shareToken  — OG meta HTML for a shared thread
 *   GET /api/og/image/note/:shareToken    — 1200×630 PNG (screenshot only)
 *   GET /api/og/image/thread/:shareToken  — 1200×630 PNG (screenshot only)
 *
 * Production Netlify prefers the dedicated `og-image` function (Chromium) via
 * public/_redirects. These Hono routes power local `dev:api`.
 *
 * No generated-card fallback — if the screenshot fails, the image route 404s
 * (crawlers unfurl title/description without a preview image).
 *
 * Rollout for unfurls: Netlify edge function `shared-og` rewrites crawler
 * user-agents on `/shared/note|thread/:token` to `/api/og/share/...` routes.
 */

import { Hono } from 'hono';
import {
  db,
  Notes,
  Threads,
  ScriptureMetadata,
  ResourceMetadata,
  eq,
  and,
  first,
} from '../db';
import { isValidShareToken } from '@/utils/ids';
import { rateLimit } from '@/utils/rate-limit';
import { renderShareOgHtml, renderNotFoundOgHtml } from '../utils/og-html';
import {
  noteOgDescription,
  noteOgTitle,
} from '../utils/og-note-cards';

const route = new Hono();

/** Cache-bust for iMessage / social after OG generator changes */
const OG_IMAGE_VERSION = '7';

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
    console.error('[og] screenshot failed (no image):', error);
    return null;
  }
}

function pngResponse(png: Buffer): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Og-Source': 'screenshot',
    },
  });
}

function noImageResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      'X-Og-Source': 'none',
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
    return noImageResponse();
  }

  const shot = await tryScreenshotPng(`${origin}/shared/note/${shareToken}?ogCapture=1`);
  return shot ? pngResponse(shot) : noImageResponse();
});

route.get('/api/og/image/thread/:shareToken', rateLimit('read'), async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;

  if (!isValidShareToken(shareToken)) {
    return noImageResponse();
  }

  const shot = await tryScreenshotPng(`${origin}/shared/thread/${shareToken}?ogCapture=1`);
  return shot ? pngResponse(shot) : noImageResponse();
});

export default route;
