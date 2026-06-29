/**
 * POST /api/support/tickets — submit feedback from settings support form.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { createSupportTicket, validateCreateSupportTicketInput } from '../utils/support-ticket';

const route = new Hono();

route.post('/api/support/tickets', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateCreateSupportTicketInput(body);
    if (!input) {
      return c.json({ error: 'Invalid support ticket payload' }, 400);
    }

    const result = await createSupportTicket(auth.userId, input);
    if (!result) {
      return c.json({ error: 'Support is temporarily unavailable' }, 503);
    }

    return c.json({ success: true, id: result.id, ticketNumber: result.ticketNumber, createdAt: result.createdAt });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/support/tickets', action: 'support_ticket' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
