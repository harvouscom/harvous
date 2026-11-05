/**
 * harvo.us — Harvous's short-link domain. Every request is a 302 into app.harvous.com or
 * harvous.com; the table lives in src/lib/short-link-resolve.ts.
 *
 * A separate Worker from `harvous-app` (wrangler.jsonc at the repo root) on purpose. That one
 * serves static assets, and its `run_worker_first` list matches paths with no host filter, so
 * attaching harvo.us to it would serve the SPA shell on harvo.us for every path not in the
 * list. This Worker has no assets: it answers every path itself, and nothing it does can
 * reach app.harvous.com.
 *
 * 302, not 301. Browsers keep a 301 forever, and where a short link lands may move.
 */

import { resolveShortLink } from '../../src/lib/short-link-resolve';

interface Env {
  APP_ORIGIN?: string;
  SITE_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const location = resolveShortLink(new URL(request.url), {
      appOrigin: env.APP_ORIGIN,
      siteOrigin: env.SITE_ORIGIN,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        // Short enough that a re-pointed link settles within minutes, long enough that a QR
        // scanned by a whole congregation at once is served from cache.
        'Cache-Control': 'public, max-age=300',
        // A note's or a church's token must not leak to the next site through Referer.
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
