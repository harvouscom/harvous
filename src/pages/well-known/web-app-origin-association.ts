/**
 * PWA URL handling: web-app-origin-association
 *
 * Served at /.well-known/web-app-origin-association via Netlify redirect.
 * Chrome uses this to validate that the installed PWA is allowed to handle
 * app.harvous.com URLs (so links from Mail, Messages, etc. open in the PWA).
 */
export const prerender = false;

import type { APIRoute } from 'astro';

const ASSOCIATION = {
  web_apps: [
    {
      manifest: 'https://app.harvous.com/manifest.json',
      details: { paths: ['/*'], exclude_paths: [] as string[] }
    }
  ]
};

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(ASSOCIATION), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
