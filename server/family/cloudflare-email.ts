/**
 * Sends one email through Cloudflare Email Sending's REST API
 * (POST /accounts/{account_id}/email/sending/send). Used only by the parent notice-change script.
 *
 * Cloudflare is already a Harvous service provider (it serves the notebook), and the children's
 * policy names it as delivering emails to parents too. Only parent addresses and the notice text go
 * through it; the notice never names the child.
 *
 * Setup: harvous.com onboarded under Email Service > Email Sending (adds SPF, DKIM, DMARC and the
 * bounce MX on the cf-bounce subdomain), and an API token with "Email Sending: Edit".
 */

export const NOTICE_FROM = 'derek@harvous.com';

export interface CloudflareEmailConfig { accountId: string; apiToken: string }

export function cloudflareEmailConfig(env: NodeJS.ProcessEnv): CloudflareEmailConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  return accountId && apiToken ? { accountId, apiToken } : null;
}

export interface OutgoingEmail { to: string; subject: string; html: string; text: string }

export type SendResult =
  | { ok: true; messageId: string; queued: boolean }
  | { ok: false; status: number; code: string; retryable: boolean };

export async function sendCloudflareEmail(config: CloudflareEmailConfig, email: OutgoingEmail,
  fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/email/sending/send`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      // `from` is the plain address, so a reply goes straight to Derek.
      body: JSON.stringify({ from: NOTICE_FROM, to: email.to, subject: email.subject, html: email.html, text: email.text })
    });
  } catch (error) {
    return { ok: false, status: 0, code: error instanceof Error ? error.message : 'network error', retryable: true };
  }
  const body = await response.json().catch(() => null) as {
    success?: boolean; errors?: { code?: number; message?: string }[];
    result?: { message_id?: string; delivered?: string[]; queued?: string[]; permanent_bounces?: string[]; suppressed_recipients?: string[] } | null;
  } | null;
  const result = body?.result;
  if (response.ok && body?.success && result?.message_id) {
    const bounced = [...(result.permanent_bounces ?? []), ...(result.suppressed_recipients ?? [])];
    if (bounced.length) return { ok: false, status: response.status, code: 'bounced or suppressed', retryable: false };
    return { ok: true, messageId: result.message_id, queued: (result.queued ?? []).length > 0 };
  }
  const error = body?.errors?.[0];
  return {
    ok: false, status: response.status,
    code: error?.message ?? `HTTP ${response.status}`,
    retryable: response.status === 429 || response.status >= 500
  };
}
