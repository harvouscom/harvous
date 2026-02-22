/**
 * GET /api/og/referral/:code
 *
 * OG image for referral pages (temporarily disabled).
 *
 * Port of: src/pages/api/og/referral/[code].ts
 */

import { Hono } from 'hono';

const route = new Hono();

route.get('/api/og/referral/:code', (c) => {
  // OG image temporarily disabled -- will come back to this
  return c.text('OG image temporarily disabled', 200);
});

export default route;
