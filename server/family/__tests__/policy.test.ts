import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { CHILD_NOTICE_VERSION, childSecret, emailDigest, hashSecret, hasActiveChildConsent, verifyKwsSignature } from '../policy';
import { familyPublicConfig } from '../config';
import { kwsConfig } from '../kws';
import { retentionDue } from '../retention';

const now = 1794355200000;
const raw = '{"name":"parent-verified","payload":{"verified":true}}';
const signature = (body = raw, at = now, secret = 'test-secret') => createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
describe('KWS signature trust boundary', () => {
  it('accepts an authentic raw body and either signature during rotation', () => {
    expect(verifyKwsSignature(raw, `t=${now},v1=${signature()}`, ['test-secret'], now)).toBe(true);
    expect(verifyKwsSignature(raw, `t=${now},v1=${signature(raw, now, 'new')},v1=${signature()}`, ['test-secret'], now)).toBe(true);
  });
  it.each([undefined, '', `t=${now},v1=invalid`, `t=${now},v1=${'a'.repeat(64)}`, `t=${now},t=${now},v1=${signature()}`])('refuses malformed or forged headers %s', (header) => {
    expect(verifyKwsSignature(raw, header, ['test-secret'], now)).toBe(false);
  });
  it('refuses tampering, replay, seconds instead of milliseconds, and absent secrets', () => {
    expect(verifyKwsSignature(raw + ' ', `t=${now},v1=${signature()}`, ['test-secret'], now)).toBe(false);
    expect(verifyKwsSignature(raw, `t=${now},v1=${signature()}`, ['test-secret'], now + 301_000)).toBe(false);
    expect(verifyKwsSignature(raw, `t=${now / 1000},v1=${signature()}`, ['test-secret'], now)).toBe(false);
    expect(verifyKwsSignature(raw, `t=${now},v1=${signature()}`, [], now)).toBe(false);
  });
});
describe('child policy', () => {
  const active = { status: 'active', noticeVersion: CHILD_NOTICE_VERSION, consentedAt: new Date() };
  it('requires current consent and an active account', () => {
    expect(hasActiveChildConsent(active)).toBe(true);
    expect(hasActiveChildConsent({ ...active, status: 'revoked' })).toBe(false);
    expect(hasActiveChildConsent({ ...active, noticeVersion: 'old' })).toBe(false);
    expect(hasActiveChildConsent({ ...active, consentedAt: null })).toBe(false);
  });
  it('generates unpredictable tokens and stores only a digest', () => {
    const a = childSecret(), b = childSecret();
    expect(a).toMatch(/^hvkid_[\w-]{43}$/); expect(a).not.toBe(b);
    expect(hashSecret(a)).toHaveLength(64); expect(hashSecret(a)).not.toContain(a);
    expect(emailDigest(' PARENT@EXAMPLE.COM ')).toBe(emailDigest('parent@example.com'));
  });
  it('uses separate origins and does not enable by accident', () => {
    expect(familyPublicConfig({})).toBeNull();
    const env = { NODE_ENV: 'production', HARVOUS_CHILD_APP_URL: 'https://kids.harvous.com/kids.html', HARVOUS_CHILD_PRIVACY_URL: 'https://harvous.com/children' };
    expect(familyPublicConfig(env)?.childOrigin).toBe('https://kids.harvous.com');
    expect(familyPublicConfig({ ...env, HARVOUS_CHILD_APP_URL: 'https://app.harvous.com/kids.html' })).toBeNull();
    expect(familyPublicConfig({ ...env, HARVOUS_CHILD_APP_URL: 'http://kids.harvous.com/kids.html' })).toBeNull();
    expect(familyPublicConfig(env)?.parentSignInUrl).toBe('https://app.harvous.com/sign-in?redirect_url=%2Fsettings%2Ffamily');
    expect(familyPublicConfig({ ...env, HARVOUS_PARENT_APP_URL: 'https://kids.harvous.com' })).toBeNull();
    expect(familyPublicConfig({ ...env, HARVOUS_PARENT_APP_URL: 'http://app.harvous.com' })).toBeNull();
    expect(familyPublicConfig({ ...env, HARVOUS_PARENT_APP_URL: 'https://user:password@app.harvous.com' })).toBeNull();
    expect(familyPublicConfig({ ...env, HARVOUS_PARENT_APP_URL: 'https://app.harvous.com/?redirect=elsewhere' })).toBeNull();
    expect(kwsConfig({})).toBeNull();
  });
  it('deletes withdrawn accounts after 30 days and inactive ones after a year', () => {
    const day = 86400_000;
    expect(retentionDue({ revokedAt: new Date(now - 31 * day), lastActiveAt: new Date(now) }, new Date(now))).toBe(true);
    expect(retentionDue({ revokedAt: new Date(now - 29 * day), lastActiveAt: new Date(now - 400 * day) }, new Date(now))).toBe(false);
    expect(retentionDue({ revokedAt: null, lastActiveAt: new Date(now - 366 * day) }, new Date(now))).toBe(true);
    expect(retentionDue({ revokedAt: null, lastActiveAt: new Date(now - 364 * day) }, new Date(now))).toBe(false);
  });
});
