/**
 * Netlify Function entry point.
 *
 * Wraps the Hono app as a single catch-all Netlify Function.
 * All /api/* requests are routed here by netlify.toml redirects.
 * Exports both default (modern) and handler (legacy CJS) so Netlify finds the function.
 */

import { handle } from 'hono/netlify';
import app from './app';

const handler = handle(app);
export default handler;
export { handler };
