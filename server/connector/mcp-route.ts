/**
 * The Connector's HTTP surface — mounted in server/app.ts *outside* `/api/*`, so the
 * session middleware, CSRF and the default GET cache header never touch it.
 *
 *   POST /mcp                                     MCP Streamable HTTP, stateless, JSON responses
 *   GET|DELETE /mcp                               405 (no sessions, no standalone SSE stream)
 *   GET /.well-known/oauth-protected-resource[/mcp]   RFC 9728 metadata → Clerk
 *   GET /.well-known/oauth-authorization-server   Clerk's metadata, cached, for older clients
 *
 * Served at https://mcp.harvous.com (DNS straight to Fly; the Cloudflare Worker only fronts
 * app.harvous.com). Stateless by design: a fresh McpServer + transport per request, so any
 * machine can answer any request and nothing lives between them. JSON rather than SSE
 * responses: every tool is a single short read, and SSE through @hono/node-server has known
 * HTTP/2 problems (modelcontextprotocol/typescript-sdk#1619).
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from './config';
import { authenticateConnectorRequest, unauthorizedResponse, type ConnectorAuth } from './auth';
import { hasConnectorAccess, notSubscribedMessage } from './access';
import { authorizationServerMetadata, protectedResourceMetadata } from './oauth-metadata';
import { registerConnectorTools } from './tools';
import { ConnectorRefusal } from './shapes';
import {
  allowIpRequest,
  allowUserRequest,
  consumeToolCall,
  isClientRevoked,
  touchConnectorClient,
} from './usage';

const MAX_BODY_BYTES = 64 * 1024;

const DISCONNECTED_MESSAGE =
  'This app was disconnected from Harvous in Settings → Claude & ChatGPT. Choose "Allow again" there to use it.';

/** Fly sets Fly-Client-IP; behind anything else, the first X-Forwarded-For hop. */
function clientIp(c: Context): string | undefined {
  return (
    c.req.header('fly-client-ip')?.trim() ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  );
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** `clientInfo.name` from an `initialize` request (single or batched), if this is one. */
export function initializeClientName(body: unknown): string | null {
  const messages = Array.isArray(body) ? body : [body];
  for (const m of messages) {
    const msg = m as { method?: unknown; params?: { clientInfo?: { name?: unknown } } } | null;
    if (msg?.method === 'initialize') {
      const name = msg.params?.clientInfo?.name;
      return typeof name === 'string' && name.trim() ? name.trim() : 'Unknown app';
    }
  }
  return null;
}

/**
 * The per-request gate every tool call passes. Access is checked lazily and at most once:
 * `initialize` and `tools/list` succeed for anyone signed in, so someone without Plus sees
 * the connector connect and gets the upgrade message *inside* their assistant — a 403 at
 * connect time shows only a generic "couldn't connect".
 */
export function createBeforeCall(auth: ConnectorAuth) {
  let access: Promise<boolean> | null = null;
  return async () => {
    if (await isClientRevoked(auth.userId, auth.clientId)) {
      throw new ConnectorRefusal('disconnected', DISCONNECTED_MESSAGE);
    }
    access ??= hasConnectorAccess(auth.userId);
    if (!(await access)) throw new ConnectorRefusal('not_subscribed', notSubscribedMessage());
    await consumeToolCall(auth.userId);
    void touchConnectorClient(auth.userId, auth.clientId);
  };
}

const connector = new Hono();

connector.use(
  '/mcp',
  cors({
    // Bearer-only and cookie-blind, so any origin is safe; browser-based MCP clients need it.
    origin: '*',
    allowMethods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Accept', 'Mcp-Protocol-Version', 'Mcp-Session-Id'],
    exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'],
    maxAge: 86400,
  }),
);
// Browser-based clients (MCP Inspector, web IDEs) read discovery cross-origin.
connector.use('/.well-known/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'], maxAge: 86400 }));

function serveProtectedResource(c: Context) {
  const body = protectedResourceMetadata();
  if (!body) return c.json({ error: 'Connector is not configured' }, 503);
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=3600' });
}

connector.get('/.well-known/oauth-protected-resource', serveProtectedResource);
connector.get('/.well-known/oauth-protected-resource/mcp', serveProtectedResource);

connector.get('/.well-known/oauth-authorization-server', async (c) => {
  try {
    const body = await authorizationServerMetadata();
    if (!body) return c.json({ error: 'Connector is not configured' }, 503);
    return c.json(body as Record<string, unknown>, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (error) {
    console.error('[connector] authorization-server metadata unavailable:', error);
    return c.json({ error: 'Authorization server metadata unavailable' }, 502);
  }
});

connector.on(['GET', 'DELETE'], '/mcp', (c) =>
  c.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server is stateless: POST only.' }, id: null },
    405,
    { Allow: 'POST', 'Cache-Control': 'no-store' },
  ),
);

connector.post('/mcp', async (c) => {
  if (!allowIpRequest(clientIp(c))) return jsonRpcError(429, -32000, 'Too many requests. Slow down.');

  const authResult = await authenticateConnectorRequest(c.req.raw);
  if (!authResult.ok) return unauthorizedResponse(authResult.reason);
  const { auth } = authResult;

  if (!allowUserRequest(auth.userId)) return jsonRpcError(429, -32000, 'Too many requests. Slow down.');

  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) return jsonRpcError(413, -32600, 'Request too large.');
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return jsonRpcError(400, -32700, 'Parse error');
  }

  const clientName = initializeClientName(parsedBody);
  if (clientName) void touchConnectorClient(auth.userId, auth.clientId, clientName);

  const server = new McpServer(SERVER_INFO, {
    instructions: SERVER_INSTRUCTIONS,
    capabilities: { tools: {} },
  });
  registerConnectorTools(server, {
    userId: auth.userId,
    beforeCall: createBeforeCall(auth),
    afterCall: (tool, outcome, ms) =>
      console.info(`[connector] tool=${tool} user=${auth.userId} client=${auth.clientId} outcome=${outcome} ms=${ms}`),
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw, {
      parsedBody,
      authInfo: {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
        extra: { userId: auth.userId },
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } finally {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  }
});

export default connector;
