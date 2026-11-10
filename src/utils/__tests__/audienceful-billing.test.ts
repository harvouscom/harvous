import { afterEach, expect, it, vi } from 'vitest';
import { tagAsAppUser } from '@/utils/audienceful';
import { fetchWithTimeout } from '@/utils/fetch-helpers';
vi.mock('@/utils/fetch-helpers', () => ({ fetchWithTimeout: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it('updates mutable billing fields without losing activity, behavior, tags, or consent', async () => {
  vi.stubEnv('AUDIENCEFUL_API_KEY', 'test');
  vi.mocked(fetchWithTimeout)
    .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 1, email: 'a@example.com',
      tags: [{ name: 'Newsletter' }], extra_data: { has_created_note: true, activity_status: 'active',
        billing_plan: 'plus', billing_cancel_at_period_end: true, billing_renews_at: 'old' } }] }),
      { headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { headers: { 'content-type': 'application/json' } }));
  await tagAsAppUser('a@example.com', 'user', undefined, undefined, undefined, undefined, {
    billing_plan: 'free', billing_cancel_at_period_end: false, billing_renews_at: '',
  });
  const request = vi.mocked(fetchWithTimeout).mock.calls[1][1]!;
  const body = JSON.parse(request.body as string);
  expect(body.extra_data).toEqual({ clerk_user_id: 'user', has_created_note: true, activity_status: 'active',
    billing_plan: 'free', billing_cancel_at_period_end: false, billing_renews_at: '' });
  expect(body.tags).toBe('Newsletter, User');
  expect(body).not.toHaveProperty('double_opt_in');
  expect(body).not.toHaveProperty('status');
});
