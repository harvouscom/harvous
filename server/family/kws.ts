import { classifyDbTarget } from '@/utils/supabase-project-ref';
import { familyPublicConfig } from './config';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

export function kwsConfig(env = process.env) {
  const { KWS_CLIENT_ID: clientId, KWS_API_KEY: apiKey, KWS_SEND_EMAIL_URL: sendEmailUrl,
    KWS_ORG_ID: orgId, KWS_PRODUCT_ID: productId, KWS_WEBHOOK_SECRET: webhookSecret,
    KWS_ENVIRONMENT: environment } = env;
  if (!clientId || !apiKey || !sendEmailUrl || !orgId || !productId || !webhookSecret ||
      !['test', 'production'].includes(environment ?? '')) return null;
  try {
    const url = new URL(sendEmailUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.kidswebservices.com') ||
        url.username || url.password || url.hash || url.search) return null;
  } catch { return null; }
  return { clientId, apiKey, sendEmailUrl, orgId, productId, webhookSecret, environment: environment! };
}

export function familyEnrollmentConfig(env = process.env, parentId?: string) {
  const pilotParentId = env.HARVOUS_CHILD_PILOT_PARENT_ID;
  const pilot = env.NODE_ENV === 'production' && env.HARVOUS_CHILD_ENVIRONMENT !== 'staging' &&
    env.CLERK_SECRET_KEY?.startsWith('sk_live_') && pilotParentId?.startsWith('user_') &&
    parentId === pilotParentId &&
    classifyDbTarget(env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DIRECT_URL).kind === 'production';
  if ((env.HARVOUS_CHILD_ACCOUNTS_ENABLED !== 'true' && !pilot) || env.HARVOUS_CHILD_RETENTION_READY !== 'true') return null;
  const config = kwsConfig(env);
  const urls = familyPublicConfig(env);
  if (!config || !urls) return null;
  if (env.HARVOUS_CHILD_ENVIRONMENT === 'staging') {
    const parent = new URL(urls.parentSignInUrl);
    const database = classifyDbTarget(env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DIRECT_URL);
    if (config.environment !== 'test' || !env.CLERK_SECRET_KEY?.startsWith('sk_test_') || database.kind !== 'other' ||
        env.FLY_APP_NAME === 'harvous' || ['harvous.com', 'app.harvous.com', 'new.harvous.com'].includes(parent.hostname) ||
        new URL(urls.childAppUrl).hostname === 'kids.harvous.com') return null;
  } else if (env.NODE_ENV === 'production' && config.environment !== 'production') return null;
  // COPPA §312.8(b): no child's information in production until the written security program is adopted
  // (docs/privacy/CHILD_INFORMATION_SECURITY_PROGRAM.md, signed). Staging is exempt; it holds fictional children.
  else if (env.NODE_ENV === 'production' && env.HARVOUS_CHILD_SECURITY_PROGRAM_ADOPTED !== 'true') return null;
  return config;
}

export function requireFamilyEnrollment(parentId?: string) {
  const config = familyEnrollmentConfig(process.env, parentId);
  if (!config) throw new HTTPException(503, { message: 'Child account setup is not available yet.' });
  return config;
}

/** Endpoint is copied from the product's authenticated KWS API reference, never guessed. */
export async function sendKwsVerification(email: string, requestId: string, location: string, parentId?: string) {
  const config = requireFamilyEnrollment(parentId);
  const tokenResponse = await fetch('https://auth.kidswebservices.com/auth/realms/kws/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Harvous/Family',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.apiKey}`).toString('base64')}`
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'verification' })
  });
  if (!tokenResponse.ok) throw new HTTPException(502, { message: 'Parent verification is temporarily unavailable.' });
  const { access_token } = z.object({ access_token: z.string().min(1) }).parse(await tokenResponse.json());
  const response = await fetch(config.sendEmailUrl, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Harvous/Family', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ email, location, language: 'en', externalPayload: requestId, userContext: 'parent' })
  });
  if (!response.ok) throw new HTTPException(502, { message: 'We could not send the verification email. Please try again later.' });
  // A redirect or synchronous client response never grants consent. Only the signed webhook verifies the adult.
}
