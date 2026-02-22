/**
 * Hono application setup.
 *
 * Central app with middleware and route registration.
 * Used by both the dev server (server/dev.ts) and Netlify Function (server/netlify.ts).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { clerkAuth } from './middleware/auth';

// Routes
import health from './routes/health';
import navigation from './routes/navigation';
import debug from './routes/debug';
import about from './routes/about';
import og from './routes/og';
import stats from './routes/stats';

const app = new Hono();

// Global middleware
app.use('/api/*', cors());
app.use('/api/*', clerkAuth);

// Register routes
app.route('/', health);
app.route('/', navigation);
app.route('/', debug);
app.route('/', about);
app.route('/', og);
app.route('/', stats);

export default app;
