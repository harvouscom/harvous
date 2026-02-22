/**
 * Netlify Function entry point.
 *
 * Wraps the Hono app as a single catch-all Netlify Function.
 * All /api/* requests are routed here by netlify.toml redirects.
 */

import { handle } from 'hono/netlify';
import app from './app';

export default handle(app);
