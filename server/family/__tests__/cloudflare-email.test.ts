import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cloudflareEmailConfig, sendCloudflareEmail, type SendResult } from '../cloudflare-email';
import { sendNotices } from '../../scripts/child-notice-change-email';

const config = { accountId: 'acct', apiToken: 'tok' };
const email = { to: 'parent@example.com', subject: 'S', html: '<p>H</p>', text: 'T' };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('sendCloudflareEmail', () => {
  it('posts one email from derek@harvous.com with both parts', async () => {
    const fetchImpl = reply(200, { success: true, errors: [], result: { message_id: '<m1>', delivered: ['parent@example.com'], queued: [], permanent_bounces: [], suppressed_recipients: [] } });
    expect(await sendCloudflareEmail(config, email, fetchImpl)).toEqual({ ok: true, messageId: '<m1>', queued: false });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/email/sending/send');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ from: 'derek@harvous.com', ...email });
  });

  it('treats a bounce as a failure for that address only', async () => {
    const result = await sendCloudflareEmail(config, email, reply(200, { success: true, result: { message_id: '<m>', permanent_bounces: ['parent@example.com'] } }));
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('reports Cloudflare errors, retryable when throttled', async () => {
    expect(await sendCloudflareEmail(config, email, reply(429, { success: false, errors: [{ code: 10004, message: 'email.sending.error.throttled' }], result: null })))
      .toEqual({ ok: false, status: 429, code: 'email.sending.error.throttled', retryable: true });
    expect(await sendCloudflareEmail(config, email, reply(401, { success: false, errors: [{ code: 10101, message: 'unauthorized' }] })))
      .toMatchObject({ ok: false, status: 401, retryable: false });
  });

  it('needs both settings', () => {
    expect(cloudflareEmailConfig({ CLOUDFLARE_ACCOUNT_ID: 'a' })).toBeNull();
    expect(cloudflareEmailConfig({ CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_EMAIL_API_TOKEN: 't' })).toEqual({ accountId: 'a', apiToken: 't' });
  });
});

describe('sendNotices', () => {
  const recipients = [{ email: 'a@x.com', notebookCount: 1 }, { email: 'b@x.com', notebookCount: 2 }, { email: 'c@x.com', notebookCount: 1 }];
  const content = () => ({ subject: 'S', html: 'H', text: 'T' });
  const log = () => join(mkdtempSync(join(tmpdir(), 'notice-')), 'sent.csv');

  it('sends to each parent once, and a re-run skips those already sent', async () => {
    const path = log();
    const send = vi.fn(async (): Promise<SendResult> => ({ ok: true, messageId: '<m>', queued: false }));
    expect(await sendNotices(recipients, content, path, send)).toEqual({ sent: 3, skipped: 0, failed: 0, stopped: false });
    expect(await sendNotices(recipients, content, path, send)).toEqual({ sent: 0, skipped: 3, failed: 0, stopped: false });
    expect(send).toHaveBeenCalledTimes(3);
    expect(readFileSync(path, 'utf8').split('\n').filter(Boolean)).toHaveLength(4);
  });

  it('carries on past a bounce but stops when every send would fail', async () => {
    const bounce = vi.fn(async (e: { to: string }): Promise<SendResult> => e.to === 'a@x.com'
      ? { ok: false, status: 200, code: 'bounced or suppressed', retryable: false } : { ok: true, messageId: '<m>', queued: false });
    expect(await sendNotices(recipients, content, log(), bounce)).toMatchObject({ sent: 2, failed: 1, stopped: false });

    const path = log();
    const throttled = vi.fn(async (): Promise<SendResult> => ({ ok: false, status: 429, code: 'throttled', retryable: true }));
    expect(await sendNotices(recipients, content, path, throttled)).toMatchObject({ sent: 0, failed: 1, stopped: true });
    expect(throttled).toHaveBeenCalledTimes(1);
    // The failed row doesn't count as sent, so the re-run tries a@x.com again.
    const ok = vi.fn(async (): Promise<SendResult> => ({ ok: true, messageId: '<m>', queued: false }));
    expect(await sendNotices(recipients, content, path, ok)).toMatchObject({ sent: 3, skipped: 0 });
  });
});
