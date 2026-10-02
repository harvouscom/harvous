/**
 * Settings › Connector — the app-side view of the Connector.
 *
 *   GET  /api/user/connector                          URL to paste, connected apps, today's usage
 *   POST /api/user/connector/clients/:clientId/revoke Disconnect one app
 *   POST /api/user/connector/clients/:clientId/restore Allow it again
 *
 * Session-authenticated like the rest of /api/*. Kept apart from the deferred
 * `/api/connector/*` data API, which would be Bearer-key authenticated and read notes; this
 * only reads and writes the Connector's own bookkeeping.
 *
 * "Disconnect" is Harvous's own per-app block, not an OAuth revocation: Clerk exposes no API
 * to list or revoke a user's grants. A disconnected app keeps its token and is refused with a
 * readable message on every tool call (server/connector/mcp-route.ts).
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { featureRequiredBody } from '../middleware/require-feature';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { hasConnectorAccess } from '../connector/access';
import { connectorResourceUrl, DAILY_CALLS } from '../connector/config';
import { listConnectorClients, setClientRevoked, usageToday } from '../connector/usage';
import { isConnectorSchemaMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function nextUtcMidnight(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

route.get('/api/user/connector', requireAuth, rateLimit('read'), async (c) => {
  try {
    const { userId } = getAuthenticatedAuth(c);
    if (!(await hasConnectorAccess(userId))) return c.json(featureRequiredBody('connector'), 403);

    let clients: Awaited<ReturnType<typeof listConnectorClients>> = [];
    let today = 0;
    try {
      [clients, today] = await Promise.all([listConnectorClients(userId), usageToday(userId)]);
    } catch (error) {
      // Before `npm run connector:schema:apply` the page still shows the URL to connect.
      if (!isConnectorSchemaMissing(error)) throw error;
    }

    return c.json(
      {
        mcpUrl: connectorResourceUrl(),
        clients: clients.map((client) => ({
          clientId: client.clientId,
          name: client.clientName?.trim() || 'Unknown app',
          firstUsedAt: client.firstUsedAt,
          lastUsedAt: client.lastUsedAt,
          disconnected: Boolean(client.revokedAt),
        })),
        usage: { today, dailyLimit: DAILY_CALLS, resetsAt: nextUtcMidnight() },
      },
      200,
      NO_STORE,
    );
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/user/connector', action: 'get_connector' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

for (const [action, revoked] of [
  ['revoke', true],
  ['restore', false],
] as const) {
  route.post(`/api/user/connector/clients/:clientId/${action}`, requireAuth, rateLimit('write'), async (c) => {
    try {
      const { userId } = getAuthenticatedAuth(c);
      if (!(await hasConnectorAccess(userId))) return c.json(featureRequiredBody('connector'), 403);
      const clientId = requireParam(c, 'clientId');
      const found = await setClientRevoked(userId, clientId, revoked);
      if (!found) return c.json({ error: 'App not found' }, 404);
      return c.json({ clientId, disconnected: revoked }, 200, NO_STORE);
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: `/api/user/connector/clients/[clientId]/${action}`,
        action: `${action}_connector_client`,
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  });
}

export default route;
