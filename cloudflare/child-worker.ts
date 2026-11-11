/** Dedicated child origin. No adult SPA fallback, ambient cookies, tracking, or service worker. */
interface ChildEnv { ASSETS: { fetch(request: Request): Promise<Response> }; API_ORIGIN: string; FAMILY_RETENTION_CRON_SECRET: string }
export default {
  async scheduled(_event: unknown, env: ChildEnv): Promise<void> {
    if (!env.FAMILY_RETENTION_CRON_SECRET) throw new Error('Family retention is not configured.');
    const response = await fetch(new URL('/api/admin/child-account-retention', env.API_ORIGIN), {
      method: 'POST', headers: { Authorization: `Bearer ${env.FAMILY_RETENTION_CRON_SECRET}` },
      signal: AbortSignal.timeout(60_000)
    });
    const result = await response.json<{ apply?: boolean; candidates?: number; deleted?: number }>().catch(() => null);
    if (!response.ok || result?.apply !== true || !Number.isInteger(result.candidates) || !Number.isInteger(result.deleted)) {
      throw new Error('Family retention job failed.');
    }
  },
  async fetch(request: Request, env: ChildEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect(new URL('/kids.html', url).href, 302);
    if (url.pathname.startsWith('/api/child-accounts/child/')) {
      const headers = new Headers(request.headers);
      headers.delete('Cookie');
      try {
        const upstream = new Request(new URL(url.pathname, env.API_ORIGIN), { method: request.method,
          headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
        const response = await fetch(upstream, { signal: AbortSignal.timeout(20_000) });
        const result = new Response(response.body, response);
        result.headers.delete('Set-Cookie');
        result.headers.set('Cache-Control', 'no-store');
        result.headers.set('Referrer-Policy', 'no-referrer');
        return result;
      } catch { return Response.json({ error: 'Your notebook is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    if (url.pathname !== '/kids.html' && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/fonts/')) {
      return new Response('Not found', { status: 404 });
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (url.pathname === '/kids.html') {
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    }
    return response;
  }
};
