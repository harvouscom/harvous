/**
 * The church pilot loop, end to end against a real dev church.
 *
 * Needs a church provisioned once in the dev Clerk instance — this spec never
 * creates Clerk orgs or registers churches (that is a Harvous-admin act):
 *
 *   E2E_CHURCH_ORG_ID      Clerk org id; TEST_USER_A is an org:admin there
 *   E2E_CHURCH_HMC_ID      the church's Here's My Church id (how B connects)
 *   E2E_CHURCH_CHANNEL_ID  a ministry channel of that church, owned or led by A
 *
 * The church must be registered at /admin/churches with a live pilot. Without
 * these the whole file skips rather than failing a run that never set them up.
 *
 * API-driven on purpose: the UI for each step has its own tests, and what this
 * guards is the loop — that each step's output is the next step's input.
 */
import { test, expect } from './fixtures/auth';
import { createNoteInSpaceViaApi } from './shared-spaces-helpers';

const ORG = process.env.E2E_CHURCH_ORG_ID?.trim() ?? '';
const HMC = process.env.E2E_CHURCH_HMC_ID?.trim() ?? '';
const CHANNEL = process.env.E2E_CHURCH_CHANNEL_ID?.trim() ?? '';

test.describe('church pilot loop', () => {
  test.skip(!ORG || !HMC || !CHANNEL, 'E2E_CHURCH_* fixtures are not configured');

  test('staff publish → congregant connects, follows, sees it new → leaves', async ({
    userAContext,
    userBContext,
  }) => {
    const staff = userAContext.request;
    const member = userBContext.request;

    // Billing is the admin's; a staff member without manage_billing is refused (H1).
    const billing = await staff.get(`/api/church/billing?orgId=${encodeURIComponent(ORG)}`);
    expect([200, 403]).toContain(billing.status());

    // B connects to the church and follows the channel.
    const connect = await member.post('/api/user/update-church', { data: { hmcChurchId: HMC } });
    expect(connect.ok(), await connect.text()).toBe(true);
    const follow = await member.post(`/api/church/channels/${CHANNEL}/follow`);
    expect(follow.ok(), await follow.text()).toBe(true);

    // A publishes into the channel.
    const marker = `E2E church ${Date.now()}`;
    const noteId = await createNoteInSpaceViaApi(staff, CHANNEL, marker, marker);

    // B's feed carries it, marked new (F6).
    const feed = await member.get('/api/church/feed?limit=20');
    expect(feed.ok()).toBe(true);
    const items = ((await feed.json()) as { items: Array<{ noteId: string; isNew?: boolean }> }).items;
    const item = items.find((i) => i.noteId === noteId);
    expect(item, 'published note reaches the follower’s feed').toBeTruthy();
    expect(item?.isNew).toBe(true);

    // Visiting the channel clears it.
    await member.post(`/api/spaces/${CHANNEL}/visit`);
    const after = (await (await member.get('/api/church/feed?limit=20')).json()) as {
      items: Array<{ noteId: string; isNew?: boolean }>;
    };
    expect(after.items.find((i) => i.noteId === noteId)?.isNew).toBe(false);

    // A follower cannot write into the channel.
    const denied = await member.post('/api/notes/create', {
      data: { spaceId: CHANNEL, title: 'nope', content: '<p>nope</p>', noteType: 'default' },
    });
    expect(denied.status()).toBe(403);

    // Leaving the church releases the follow (F8).
    const leave = await member.post('/api/user/update-church', { data: { hmcChurchId: null } });
    expect(leave.ok()).toBe(true);
    const gone = await member.get('/api/church/feed');
    expect(((await gone.json()) as { connected: boolean }).connected).toBe(false);
  });
});
