/**
 * Open Graph routes.
 *
 *   GET /api/og/referral/:code            — referral OG image (temporarily disabled)
 *   GET /api/og/share/note/:shareToken    — OG meta HTML for a shared note
 *   GET /api/og/share/thread/:shareToken  — OG meta HTML for a shared thread
 *
 * The share routes render server-side `og:` meta for link unfurling (iMessage,
 * Slack, X), then redirect human browsers to the canonical SPA URL. They read the
 * same public+shared records as server/routes/shared.ts.
 *
 * Rollout for unfurls: configure Netlify to route crawler user-agents hitting the
 * canonical pathnames (`/shared/note/:token`, `/shared/thread/:token`) to these
 * `/api/og/share/...` routes. Humans continue to hit the SPA via public/_redirects.
 */

import { Hono } from 'hono';
import { db, Notes, Threads, eq, and, first } from '../db';
import { isValidShareToken } from '@/utils/ids';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { renderShareOgHtml, renderNotFoundOgHtml } from '../utils/og-html';

const route = new Hono();

route.get('/api/og/referral/:code', (c) => {
  // OG image temporarily disabled -- will come back to this
  return c.text('OG image temporarily disabled', 200);
});

route.get('/api/og/share/note/:shareToken', async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;
  const canonicalUrl = `${origin}/shared/note/${shareToken}`;

  if (!isValidShareToken(shareToken)) {
    return c.html(renderNotFoundOgHtml(canonicalUrl), 200);
  }

  const note = first(await db
    .select({ title: Notes.title, content: Notes.content })
    .from(Notes)
    .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true)))
    .limit(1));

  if (!note) return c.html(renderNotFoundOgHtml(canonicalUrl), 200);

  return c.html(renderShareOgHtml({
    title: note.title?.trim() || 'Shared note',
    description: stripHtmlForPreview(note.content ?? '', 200),
    canonicalUrl,
  }), 200);
});

route.get('/api/og/share/thread/:shareToken', async (c) => {
  const shareToken = c.req.param('shareToken');
  const origin = new URL(c.req.url).origin;
  const canonicalUrl = `${origin}/shared/thread/${shareToken}`;

  if (!isValidShareToken(shareToken)) {
    return c.html(renderNotFoundOgHtml(canonicalUrl), 200);
  }

  const thread = first(await db
    .select({ title: Threads.title, subtitle: Threads.subtitle })
    .from(Threads)
    .where(and(eq(Threads.shareToken, shareToken), eq(Threads.isPublic, true)))
    .limit(1));

  if (!thread) return c.html(renderNotFoundOgHtml(canonicalUrl), 200);

  return c.html(renderShareOgHtml({
    title: thread.title?.trim() || 'Shared Thread',
    description: stripHtmlForPreview(thread.subtitle ?? '', 200),
    canonicalUrl,
  }), 200);
});

export default route;
