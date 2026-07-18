/**
 * Hono application setup.
 *
 * Central app with middleware and route registration.
 * Used by both the dev server (server/dev.ts) and Netlify Function (server/netlify.ts).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { clerkAuth } from './middleware/auth';
import { resolveCorsOrigin } from './middleware/cors-origins';
// CSRF middleware disabled — Clerk session auth is the primary security layer.
// Origin-based CSRF was causing false 403s in production (Netlify proxy headers).
// Re-enable once root cause is identified via Netlify function logs.
// import { csrfProtection } from './middleware/csrf';

// Routes
import health from './routes/health';
import auth from './routes/auth';
import navigation from './routes/navigation';
import debug from './routes/debug';
import about from './routes/about';
import og from './routes/og';
import stats from './routes/stats';
import search from './routes/search';
import content from './routes/content';
import threads from './routes/threads';
import notes from './routes/notes';
import studyThreads from './routes/study-threads';
import spaces from './routes/spaces';
import user from './routes/user';
import tagsScripture from './routes/tags-scripture';
import shared from './routes/shared';
import billing from './routes/billing';
import resource from './routes/resource';
import inbox from './routes/inbox';
import webflow from './routes/webflow';
import webhooks from './routes/webhooks';
import sync from './routes/sync';
import migrations from './routes/migrations';
import admin from './routes/admin';
import churches from './routes/churches';
import featured from './routes/featured';
import votd from './routes/votd';
import test from './routes/test';
import dictionary from './routes/dictionary';
import recall from './routes/recall';
import support from './routes/support';
import diagnostics from './routes/diagnostics';

const app = new Hono();

// Global middleware
app.use('/api/*', requestId());
app.use(
  '/api/*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
  })
);
// app.use('/api/*', csrfProtection);  // Disabled — see import comment above
app.use('/api/*', clerkAuth);

// Default cache headers for GET responses — individual endpoints can override
// by setting Cache-Control before returning. This avoids redundant refetches
// for endpoints that return user-specific data unlikely to change within seconds.
app.use('/api/*', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && !c.res.headers.has('Cache-Control')) {
    c.res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  }
});

// Register routes
app.route('/', health);
app.route('/', auth);
app.route('/', navigation);
app.route('/', debug);
app.route('/', about);
app.route('/', og);
app.route('/', stats);
app.route('/', search);
app.route('/', content);
app.route('/', threads);
app.route('/', notes);
app.route('/', studyThreads);
app.route('/', spaces);
app.route('/', user);
app.route('/', tagsScripture);
app.route('/', shared);
app.route('/', billing);
app.route('/', resource);
app.route('/', inbox);
app.route('/', webflow);
app.route('/', webhooks);
app.route('/', sync);
app.route('/', migrations);
app.route('/', admin);
app.route('/', churches);
app.route('/', featured);
app.route('/', votd);
app.route('/', test);
app.route('/', dictionary);
app.route('/', recall);
app.route('/', support);
app.route('/', diagnostics);

export default app;
