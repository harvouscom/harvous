import { afterEach, describe, expect, it, vi } from 'vitest';
import { familyEnrollmentConfig, sendKwsVerification } from '../kws';
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
  it('permits KWS Test on an explicitly isolated staging stack', () => {
    const staging = {
      NODE_ENV: 'production', HARVOUS_CHILD_ENVIRONMENT: 'staging', HARVOUS_CHILD_ACCOUNTS_ENABLED: 'true',
      HARVOUS_CHILD_RETENTION_READY: 'true', HARVOUS_CHILD_APP_URL: 'https://kids-test.example.com/kids.html',
      HARVOUS_PARENT_APP_URL: 'https://parent-test.example.com', HARVOUS_CHILD_PRIVACY_URL: 'https://example.com/privacy',
      CLERK_SECRET_KEY: 'sk_test_test', KWS_ENVIRONMENT: 'test', KWS_CLIENT_ID: 'client', KWS_API_KEY: 'key',
      KWS_SEND_EMAIL_URL: 'https://api.kidswebservices.com/product/test/send-email', KWS_ORG_ID: 'org',
      KWS_PRODUCT_ID: 'product', KWS_WEBHOOK_SECRET: 'webhook',
      SUPABASE_DATABASE_URL: 'postgres://postgres.passwordrefstaging:dummy@aws-1-us-east-1.pooler.supabase.com/postgres'
    };
    expect(familyEnrollmentConfig(staging)?.environment).toBe('test');
    expect(familyEnrollmentConfig({ ...staging, HARVOUS_CHILD_ENVIRONMENT: '' })).toBeNull();
    expect(familyEnrollmentConfig({ ...staging, FLY_APP_NAME: 'harvous' })).toBeNull();
    expect(familyEnrollmentConfig({ ...staging, CLERK_SECRET_KEY: 'sk_live_test' })).toBeNull();
    expect(familyEnrollmentConfig({ ...staging, HARVOUS_PARENT_APP_URL: 'https://new.harvous.com' })).toBeNull();
    expect(familyEnrollmentConfig({ ...staging, HARVOUS_CHILD_APP_URL: 'https://kids.harvous.com/kids.html' })).toBeNull();
    expect(familyEnrollmentConfig({ ...staging, SUPABASE_DATABASE_URL: 'postgres://postgres.mhriprqpyvhjgdssjlfl:dummy@aws-1-us-east-1.pooler.supabase.com/postgres' })).toBeNull();
  });
  it('limits the production rehearsal to one exact adult account while public enrollment is off', () => {
    const production = {
      NODE_ENV: 'production', HARVOUS_CHILD_ACCOUNTS_ENABLED: 'false', HARVOUS_CHILD_PILOT_PARENT_ID: 'user_testPilot',
      HARVOUS_CHILD_RETENTION_READY: 'true', HARVOUS_CHILD_APP_URL: 'https://kids.harvous.com/kids.html',
      HARVOUS_CHILD_PRIVACY_URL: 'https://harvous.com/children', CLERK_SECRET_KEY: 'sk_live_placeholder',
      KWS_ENVIRONMENT: 'production', KWS_CLIENT_ID: 'client', KWS_API_KEY: 'key',
      KWS_SEND_EMAIL_URL: 'https://api.kidswebservices.com/configured/send-email', KWS_ORG_ID: 'org',
      KWS_PRODUCT_ID: 'product', KWS_WEBHOOK_SECRET: 'webhook', HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED: 'true',
      SUPABASE_DATABASE_URL: 'postgres://postgres.mhriprqpyvhjgdssjlfl:dummy@aws-1-us-east-1.pooler.supabase.com/postgres'
    };
    expect(familyEnrollmentConfig(production, 'user_testPilot')?.environment).toBe('production');
    expect(familyEnrollmentConfig(production, 'user_testPilotExtra')).toBeNull();
    expect(familyEnrollmentConfig(production)).toBeNull();
    expect(familyEnrollmentConfig({ ...production, KWS_ENVIRONMENT: 'test' }, 'user_testPilot')).toBeNull();
    expect(familyEnrollmentConfig({ ...production, HARVOUS_CHILD_ENVIRONMENT: 'staging' }, 'user_testPilot')).toBeNull();
    expect(familyEnrollmentConfig({ ...production, HARVOUS_CHILD_RETENTION_READY: 'false' }, 'user_testPilot')).toBeNull();
    expect(familyEnrollmentConfig({ ...production, CLERK_SECRET_KEY: 'sk_test_placeholder' }, 'user_testPilot')).toBeNull();
    expect(familyEnrollmentConfig({ ...production, SUPABASE_DATABASE_URL: 'postgres://localhost:5432/harvous' }, 'user_testPilot')).toBeNull();
    // COPPA §312.8(b): no production enrollment, pilot included, until the security program is adopted.
    expect(familyEnrollmentConfig({ ...production, HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED: undefined }, 'user_testPilot')).toBeNull();
    expect(familyEnrollmentConfig({ ...production, HARVOUS_CHILD_ACCOUNTS_ENABLED: 'true', HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED: 'false' })).toBeNull();
  });

  it('does not contact KWS without explicit enrollment enablement', async () => {
    vi.stubEnv('HARVOUS_CHILD_ACCOUNTS_ENABLED', 'false'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(sendKwsVerification('p@example.com', 'id', 'US')).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
