import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateRequest = vi.fn();
const verify = vi.fn();

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ authenticateRequest, idPOAuthAccessToken: { verify } }),
}));

const resolvePersonalToken = vi.fn();
vi.mock('../tokens', () => ({
  isPersonalToken: (v: string) => v.startsWith('hvous_'),
  resolvePersonalToken,
}));

const { authenticateConnectorRequest, describeTokenShape, __resetConnectorAuthCache } = await import('../auth');

const OPAQUE = 'oat_SECRETSECRETSECRET1234567890';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const JWT_NO_TYP = `${b64({ alg: 'RS256' })}.${b64({ sub: 'user_1', client_id: 'c_1' })}.${b64('sig')}`;

function req(token: string) {
  return new Request('https://mcp.example.test/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
}

const unauthenticated = { isAuthenticated: false, reason: 'token-type-mismatch', message: '', toAuth: () => null };

let logs: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  __resetConnectorAuthCache();
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
  process.env.CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('clerk.example.test$').toString('base64')}`;
  process.env.CONNECTOR_RESOURCE_URL = 'https://mcp.example.test/mcp';
  logs = [];
  for (const level of ['info', 'warn', 'error', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('connector token verification', () => {
  it('accepts what authenticateRequest accepts, without a second call', async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ tokenType: 'oauth_token', userId: 'user_1', clientId: 'c_1', scopes: ['profile'] }),
    });
    const r = await authenticateConnectorRequest(req(OPAQUE));
    expect(r).toMatchObject({ ok: true, auth: { userId: 'user_1', clientId: 'c_1' } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('falls back to the backend API for a token authenticateRequest refuses (harvous#220)', async () => {
    authenticateRequest.mockResolvedValue(unauthenticated);
    verify.mockResolvedValue({ subject: 'user_1', clientId: 'c_dcr', scopes: ['profile'], revoked: false, expired: false });
    const r = await authenticateConnectorRequest(req(JWT_NO_TYP));
    expect(r).toMatchObject({ ok: true, auth: { userId: 'user_1', clientId: 'c_dcr' } });
    expect(logs.join('\n')).toContain('accepted via backend verify');
    expect(logs.join('\n')).toContain('reason=token-type-mismatch');
    expect(logs.join('\n')).toContain('typ=none');
  });

  it('refuses a revoked or expired token, and says which', async () => {
    authenticateRequest.mockResolvedValue(unauthenticated);
    verify.mockResolvedValue({ subject: 'user_1', clientId: 'c_1', scopes: [], revoked: true, expired: false });
    expect(await authenticateConnectorRequest(req(OPAQUE))).toEqual({ ok: false, reason: 'invalid' });
    expect(logs.join('\n')).toContain('revoked=true');
  });

  it('refuses when the backend cannot verify it either, with the reason logged', async () => {
    authenticateRequest.mockResolvedValue(unauthenticated);
    verify.mockRejectedValue(new Error('Not Found'));
    expect(await authenticateConnectorRequest(req(OPAQUE))).toEqual({ ok: false, reason: 'invalid' });
    expect(logs.join('\n')).toMatch(/refused token: Not Found .*shape=opaque prefix=oat_/);
  });

  it('never writes the token into a log line', async () => {
    authenticateRequest.mockResolvedValue(unauthenticated);
    verify.mockRejectedValue(new Error('nope'));
    await authenticateConnectorRequest(req(OPAQUE));
    await authenticateConnectorRequest(req(JWT_NO_TYP));
    const all = logs.join('\n');
    expect(all).not.toContain('SECRETSECRET');
    expect(all).not.toContain(JWT_NO_TYP.split('.')[1]);
  });
});

describe('token shape description', () => {
  it('tells opaque tokens from JWTs, and names the JWT header type', () => {
    expect(describeTokenShape(OPAQUE)).toMatch(/^opaque prefix=oat_ len=\d+$/);
    expect(describeTokenShape(JWT_NO_TYP)).toBe('jwt typ=none alg=RS256 aud=none client_id=present sub=present');
  });
});

describe('personal tokens', () => {
  it('resolves an hvous_ token by lookup, never asking Clerk', async () => {
    resolvePersonalToken.mockResolvedValue({ id: 'ctoken_1', userId: 'user_9' });
    const result = await authenticateConnectorRequest(req('hvous_abc123'));
    expect(result).toMatchObject({ ok: true, auth: { userId: 'user_9', clientId: 'token:ctoken_1' } });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses an unknown or revoked token without logging it', async () => {
    resolvePersonalToken.mockResolvedValue(null);
    const result = await authenticateConnectorRequest(req('hvous_revokedvalue'));
    expect(result).toMatchObject({ ok: false });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain('hvous_revokedvalue');
  });
});
