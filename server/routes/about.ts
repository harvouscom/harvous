/**
 * GET /api/about/founder-letter
 *
 * Returns the founder letter as rendered HTML.
 * In dev (tsx): reads src/data/about/founder-letter.md from disk (no .md loader).
 * In production: uses inlined content from founder-letter.inline.ts (esbuild --loader:.md=text).
 *
 * Port of: src/pages/api/about/founder-letter.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Hono } from 'hono';
import { markdownToHtml } from '@/utils/markdown-to-html';

const route = new Hono();

async function getFounderLetterMarkdown(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    const mod = await import('./founder-letter.inline');
    return mod.default;
  }
  const path = join(process.cwd(), 'src', 'data', 'about', 'founder-letter.md');
  return readFileSync(path, 'utf-8');
}

route.get('/api/about/founder-letter', async (c) => {
  const founderLetterMarkdown = await getFounderLetterMarkdown();
  const html = markdownToHtml(founderLetterMarkdown);
  return c.json(
    { html },
    200,
    { 'Cache-Control': 'public, max-age=86400' },
  );
});

export default route;
