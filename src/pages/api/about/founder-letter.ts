export const prerender = false;

import type { APIRoute } from 'astro';
import { markdownToHtml } from '@/utils/markdown-to-html';
import founderLetterMarkdown from '@/data/about/founder-letter.md?raw';

export const GET: APIRoute = async () => {
  const html = markdownToHtml(founderLetterMarkdown);
  return new Response(JSON.stringify({ html }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
