/**
 * Production server entry point (Fly.io).
 *
 * The long-lived counterpart to server/netlify.ts: instead of wrapping the Hono
 * app in a per-request function handler, it serves the app from one Node process
 * and runs the daily jobs in-process (see server/scheduler.ts).
 *
 * Secrets come from the platform, so there is no dotenv step — but the dynamic
 * imports from server/dev.ts are kept anyway: several modules read config during
 * module init, and importing them lazily keeps startup ordering explicit.
 */

const port = Number(process.env.API_PORT ?? 8080);

async function main() {
  const { serve } = await import('@hono/node-server');
  const { default: app } = await import('./app');
  const { warmPostgresConnection } = await import('./db/client');
  const { startScheduler } = await import('./scheduler');
  const { prewarmOgRenderer } = await import('./utils/og-screenshot');

  await warmPostgresConnection();

  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
    console.log(`[fly] Hono API listening on 0.0.0.0:${port}`);
  });

  // Deliberately after listen and deliberately not awaited: a cold OG render
  // takes ~34s, which would fail the health check if it gated startup. The
  // token is well-formed but unknown, so this renders the error card through
  // the real path — warming Chromium, the SPA fetch, and V8's code cache.
  const appOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (appOrigin) {
    void prewarmOgRenderer(`${appOrigin}/shared/note/aaaaaaaaaaaa?ogCapture=1`);
  }

  const stopScheduler = startScheduler();

  // Fly sends SIGTERM and waits before killing the machine. Stop accepting new
  // connections and let in-flight requests finish; a stuck drain must not
  // outlive the grace period, hence the timer.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[fly] ${signal} received, draining`);
    stopScheduler();

    const force = setTimeout(() => {
      console.warn('[fly] drain timed out, exiting anyway');
      process.exit(0);
    }, 10_000);
    force.unref();

    server.close(() => {
      clearTimeout(force);
      console.log('[fly] drained cleanly');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[fly] fatal startup error:', error);
  process.exit(1);
});
