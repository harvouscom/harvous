import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticate = vi.fn();
const hasAccess = vi.fn();
const consume = vi.fn();
const revoked = vi.fn();
const touch = vi.fn();
const searchNotes = vi.fn();
const getNote = vi.fn();

vi.mock('../auth', async (orig) => {
  const actual = await orig<typeof import('../auth')>();
  return { ...actual, authenticateConnectorRequest: (...a: unknown[]) => authenticate(...a) };
});
vi.mock('../access', () => ({
  hasConnectorAccess: (...a: unknown[]) => hasAccess(...a),
  notSubscribedMessage: () => 'Using Harvous from other apps is part of Harvous Plus.',
}));
vi.mock('../usage', () => ({
  allowIpRequest: () => true,
  allowUserRequest: () => true,
  consumeToolCall: (...a: unknown[]) => consume(...a),
  isClientRevoked: (...a: unknown[]) => revoked(...a),
  touchConnectorClient: (...a: unknown[]) => touch(...a),
}));
vi.mock('../read-service', () => ({
  searchNotes: (...a: unknown[]) => searchNotes(...a),
  getNote: (...a: unknown[]) => getNote(...a),
  listSpaces: vi.fn(),
  listThreadsInSpace: vi.fn(),
  listNotesInSpace: vi.fn(),
  listStudyThreadConnections: vi.fn(),
  getSharedNote: vi.fn(),
  findByPassage: vi.fn(),
}));

const { default: connector } = await import('../mcp-route');
const { ConnectorRefusal } = await import('../shapes');

const AUTH = { userId: 'user_1', clientId: 'client_1', scopes: ['profile'], token: 'oat_x' };

function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return connector.request('/mcp', {
    method: 'POST',
    headers: {
      authorization: 'Bearer oat_x',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

const INIT = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'Claude', version: '1.0' },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('clerk.example.test$').toString('base64')}`;
  process.env.CONNECTOR_RESOURCE_URL = 'https://mcp.example.test/mcp';
  authenticate.mockResolvedValue({ ok: true, auth: AUTH });
  hasAccess.mockResolvedValue(true);
  consume.mockResolvedValue({ today: 1 });
  revoked.mockResolvedValue(false);
  touch.mockResolvedValue(undefined);
});

describe('POST /mcp', () => {
  it('initializes statelessly: JSON response, no session id, and records the app name', async () => {
    const res = await rpc('initialize', INIT);
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('harvous');
    expect(body.result.instructions).toContain('read-only');
    expect(touch).toHaveBeenCalledWith('user_1', 'client_1', 'Claude');
  });

  it('lists exactly the eight read-only tools', async () => {
    const res = await rpc('tools/list');
    const body = await res.json();
    const tools = body.result.tools as Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'find_by_passage',
        'get_note',
        'get_shared_note',
        'list_notes_in_space',
        'list_spaces',
        'list_study_thread_connections',
        'list_threads_in_space',
        'search_notes',
      ].sort(),
    );
    expect(tools.every((t) => t.annotations.readOnlyHint === true)).toBe(true);
    // Listing tools is free and needs no subscription.
    expect(hasAccess).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('lists four prompts, and fills one in without a subscription or a tool call', async () => {
    hasAccess.mockResolvedValue(false);
    const list = await (await rpc('prompts/list')).json();
    expect(list.result.prompts.map((p: { name: string }) => p.name).sort()).toEqual(
      ['prepare_for_group', 'recent_study', 'study_passage', 'trace_theme'],
    );
    const got = await (await rpc('prompts/get', { name: 'study_passage', arguments: { passage: 'Romans 8' } })).json();
    const text = got.result.messages[0].content.text as string;
    expect(text).toContain('Romans 8');
    expect(text).toContain('find_by_passage');
    expect(text).toContain("Don't present your own interpretation as mine");
    expect(hasAccess).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('calls a tool through the read service', async () => {
    searchNotes.mockResolvedValue({ results: [{ id: 'note_1', title: 'Grace' }], nextCursor: null });
    const res = await rpc('tools/call', { name: 'search_notes', arguments: { query: 'grace' } });
    const body = await res.json();
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.results[0].id).toBe('note_1');
    expect(searchNotes).toHaveBeenCalledWith('user_1', expect.objectContaining({ query: 'grace', limit: 10 }));
    expect(consume).toHaveBeenCalledOnce();
  });

  it('tells someone without Plus how to get it, as a tool error with HTTP 200', async () => {
    hasAccess.mockResolvedValue(false);
    const res = await rpc('tools/call', { name: 'search_notes', arguments: { query: 'grace' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Harvous Plus');
    expect(searchNotes).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('refuses over the daily cap as a tool error', async () => {
    consume.mockRejectedValue(new ConnectorRefusal('daily_limit', 'Daily limit reached (1,000 Harvous requests).'));
    const res = await rpc('tools/call', { name: 'search_notes', arguments: { query: 'grace' } });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Daily limit');
  });

  it('refuses a disconnected app without a 401 (no re-auth loop)', async () => {
    revoked.mockResolvedValue(true);
    const res = await rpc('tools/call', { name: 'get_note', arguments: { noteId: 'note_1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('disconnected');
    expect(getNote).not.toHaveBeenCalled();
  });

  it('rejects arguments outside the schema before any read', async () => {
    const res = await rpc('tools/call', { name: 'search_notes', arguments: { query: 'grace', limit: 500 } });
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(searchNotes).not.toHaveBeenCalled();
  });

  it('answers a missing or bad token with 401 and where to sign in', async () => {
    authenticate.mockResolvedValue({ ok: false, reason: 'missing' });
    const res = await rpc('initialize', INIT);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
    );
    authenticate.mockResolvedValue({ ok: false, reason: 'invalid' });
    const bad = await rpc('initialize', INIT);
    expect(bad.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('returns a JSON-RPC parse error for a malformed body', async () => {
    const res = await connector.request('/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer oat_x', 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });
});

describe('the rest of the surface', () => {
  it('GET /mcp is 405 — no sessions, no standalone stream', async () => {
    const res = await connector.request('/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('serves its own full-bleed icon and declares it in serverInfo', async () => {
    for (const path of ['/icon.png', '/favicon.ico']) {
      const res = await connector.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
    }
    const init = await rpc('initialize', INIT);
    const body = await init.json();
    expect(body.result.serverInfo.icons[0]).toMatchObject({
      src: 'https://mcp.example.test/icon.png',
      mimeType: 'image/png',
    });
  });

  it('publishes protected-resource metadata pointing at Clerk', async () => {
    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const res = await connector.request(path);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe('https://mcp.example.test/mcp');
      expect(body.authorization_servers).toEqual(['https://clerk.example.test']);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    }
  });
});
