/**
 * GET /api/about/founder-letter
 *
 * Returns the founder letter as rendered HTML.
 * Markdown is inlined at build time (esbuild --loader:.md=text) so the
 * Netlify function has no filesystem dependency on src/data.
 *
 * Port of: src/pages/api/about/founder-letter.ts
 */

import { Hono } from 'hono';
import { markdownToHtml } from '@/utils/markdown-to-html';
import founderLetterMarkdown from '@/data/about/founder-letter.md';

const route = new Hono();

route.get('/api/about/founder-letter', (c) => {
  const html = markdownToHtml(founderLetterMarkdown);
  return c.json(
    { html },
    200,
    { 'Cache-Control': 'public, max-age=86400' },
  );
});

export default route;
