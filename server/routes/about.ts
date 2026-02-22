/**
 * GET /api/about/founder-letter
 *
 * Returns the founder letter as rendered HTML.
 *
 * Port of: src/pages/api/about/founder-letter.ts
 */

import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { markdownToHtml } from '@/utils/markdown-to-html';

// Read the markdown file once at module load time
const founderLetterMarkdown = readFileSync(
  resolve(import.meta.dirname || __dirname, '../../src/data/about/founder-letter.md'),
  'utf-8',
);

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
