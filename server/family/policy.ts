import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const CHILD_NOTICE_VERSION = '2026-11-10.2';
export const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CHILD_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const HANDOFF_TTL_MS = 5 * 60 * 1000;
export const childSecret = () => `hvkid_${randomBytes(32).toString('base64url')}`;
export const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex');
export const emailDigest = (value: string) => hashSecret(value.trim().toLowerCase());

/** KWS uses milliseconds, raw UTF-8 body and potentially multiple v1 signatures during rotation. */
export function verifyKwsSignature(raw: string, header: string | undefined, secrets: string[], now = Date.now()) {
  const parts = (header ?? '').split(',').map((p) => p.trim());
  const times = parts.filter((p) => p.startsWith('t=')).map((p) => p.slice(2));
  if (times.length !== 1 || !/^\d{13}$/.test(times[0])) return false;
  if (Math.abs(now - Number(times[0])) > 5 * 60 * 1000) return false;
  const signatures = parts.filter((p) => /^v1=[a-f0-9]{64}$/i.test(p)).map((p) => Buffer.from(p.slice(3), 'hex'));
  return secrets.filter(Boolean).some((secret) => {
    const expected = createHmac('sha256', secret).update(`${times[0]}.${raw}`).digest();
    return signatures.some((signature) => timingSafeEqual(expected, signature));
  });
}

export function hasActiveChildConsent(child: { status: string; noticeVersion: string; consentedAt: Date | null }) {
  return child.status === 'active' && child.noticeVersion === CHILD_NOTICE_VERSION && child.consentedAt !== null;
}

/** Unknown fields are rejected at the route layer; no client-selectable roles or capabilities. */
export const CHILD_CAPABILITIES = Object.freeze({
  publicSharing: false, directMessages: false, purchases: false,
  connectors: false, analytics: false, parentCanReadNotes: true,
  ministryCanReadPersonalNotes: false
});
