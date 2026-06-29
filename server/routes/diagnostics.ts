/**
 * POST /api/diagnostics/event — anonymous client issue ingest (no auth, no userId).
 */

import { Hono } from 'hono';
import { recordDiagnosticEvent, validateDiagnosticEventInput } from '../utils/record-diagnostic-event';

const route = new Hono();

route.post('/api/diagnostics/event', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const input = validateDiagnosticEventInput(body);
    if (input) {
      await recordDiagnosticEvent(input);
    }
    // Always success — do not leak validation details
    return c.json({ success: true });
  } catch {
    return c.json({ success: true });
  }
});

export default route;
