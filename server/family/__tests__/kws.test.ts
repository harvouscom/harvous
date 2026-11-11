import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendKwsVerification } from '../kws';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('KWS integration', () => {
  it('keeps credentials server-side and sends only parent verification inputs', async () => {
    for (const [key, value] of Object.entries({ HARVOUS_CHILD_ACCOUNTS_ENABLED: 'true', HARVOUS_CHILD_RETENTION_READY: 'true',
      HARVOUS_CHILD_APP_URL: 'http://localhost:4322/kids.html', HARVOUS_CHILD_PRIVACY_URL: 'https://example.com/privacy',
      KWS_CLIENT_ID: 'client', KWS_API_KEY: 'secret', KWS_SEND_EMAIL_URL: 'https://api.kidswebservices.com/configured/send-email',
      KWS_ORG_ID: 'org', KWS_PRODUCT_ID: 'product', KWS_WEBHOOK_SECRET: 'webhook', KWS_ENVIRONMENT: 'test' })) vi.stubEnv(key, value);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'private-token' })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await sendKwsVerification('parent@example.com', 'opaque-request-id', 'US');
    expect(fetch.mock.calls[0][0]).toBe('https://auth.kidswebservices.com/auth/realms/kws/protocol/openid-connect/token');
    expect(fetch.mock.calls[0][1].body.toString()).toBe('grant_type=client_credentials&scope=verification');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer private-token');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ email: 'parent@example.com', location: 'US', language: 'en', externalPayload: 'opaque-request-id', userContext: 'parent' });
  });
  it('does not contact KWS without explicit enrollment enablement', async () => {
    vi.stubEnv('HARVOUS_CHILD_ACCOUNTS_ENABLED', 'false'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(sendKwsVerification('p@example.com', 'id', 'US')).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
