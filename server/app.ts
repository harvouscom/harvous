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
// CSRF middleware disabled — Clerk session auth is the primary security layer.
// Origin-based CSRF was causing false 403s in production (Netlify proxy headers).
// Re-enable once root cause is identified via Netlify function logs.
// import { csrfProtection } from './middleware/csrf';

// Routes
import health from './routes/health';
import navigation from './routes/navigation';
import debug from './routes/debug';
import about from './routes/about';
import og from './routes/og';
import stats from './routes/stats';
import search from './routes/search';
import content from './routes/content';
import threads from './routes/threads';
import notes from './routes/notes';
import noteTemplates from './routes/note-templates';
import studyThreads from './routes/study-threads';
import spaces from './routes/spaces';
import user from './routes/user';
import tagsScripture from './routes/tags-scripture';
import shared from './routes/shared';
import billing from './routes/billing';
import resource from './routes/resource';
import library from './routes/library';
import churchLibrary from './routes/church-library';
import churchSpaceLibrary from './routes/church-space-library';
import churchSpaceChannelLinks from './routes/church-space-channel-links';
import churchLibrarySuggestions from './routes/church-library-suggestions';
import inbox from './routes/inbox';
import webhooks from './routes/webhooks';
import sync from './routes/sync';
import migrations from './routes/migrations';
import admin from './routes/admin';
import churches from './routes/churches';
import church from './routes/church';
import churchTeachingPlan from './routes/church-teaching-plan';
import churchSettings from './routes/church-settings';
import churchSpacePlan from './routes/church-space-plan';
import churchEngagement from './routes/church-engagement';
import churchSpaceLeaders from './routes/church-space-leaders';
import churchPublishedMaterial from './routes/church-published-material';
import featured from './routes/featured';
import votd from './routes/votd';
import test from './routes/test';
import dictionary from './routes/dictionary';
import recall from './routes/recall';
import reading from './routes/reading';
import noteVisits from './routes/note-visits';
import studyFeed from './routes/study-feed';
import support from './routes/support';
import diagnostics from './routes/diagnostics';
import statusPublic from './routes/status-public';

const app = new Hono();

// Global middleware
app.use('/api/*', requestId());
app.use('/api/*', cors());
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
app.route('/', navigation);
app.route('/', debug);
app.route('/', about);
app.route('/', og);
app.route('/', stats);
app.route('/', search);
app.route('/', content);
app.route('/', threads);
app.route('/', notes);
app.route('/', noteTemplates);
app.route('/', studyThreads);
app.route('/', spaces);
app.route('/', user);
app.route('/', tagsScripture);
app.route('/', shared);
app.route('/', billing);
app.route('/', resource);
app.route('/', library);
app.route('/', churchLibrary);
app.route('/', churchSpaceLibrary);
app.route('/', churchSpaceChannelLinks);
app.route('/', churchLibrarySuggestions);
app.route('/', inbox);
app.route('/', webhooks);
app.route('/', sync);
app.route('/', migrations);
app.route('/', admin);
app.route('/', churches);
app.route('/', church);
app.route('/', churchTeachingPlan);
app.route('/', churchSettings);
app.route('/', churchSpacePlan);
app.route('/', churchEngagement);
app.route('/', churchSpaceLeaders);
app.route('/', churchPublishedMaterial);
app.route('/', featured);
app.route('/', votd);
app.route('/', test);
app.route('/', dictionary);
app.route('/', recall);
app.route('/', reading);
app.route('/', noteVisits);
app.route('/', studyFeed);
app.route('/', support);
app.route('/', diagnostics);
app.route('/', statusPublic);

export default app;
