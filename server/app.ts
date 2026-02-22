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

const app = new Hono();

// Global middleware
app.use('/api/*', cors());
app.use('/api/*', clerkAuth);

// Register routes
app.route('/', health);
app.route('/', navigation);

export default app;
