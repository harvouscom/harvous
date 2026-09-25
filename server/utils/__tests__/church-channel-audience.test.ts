import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAudienceViewer,
  channelAudienceAllows,
  isChannelAudience,
  type AudienceViewer,
} from '../church-channel-audience';

const nobody: AudienceViewer = { leadsChannelIds: new Set(), groups: [] };
const youth = (audience: string) => ({ id: 'ch_youth', audience, ministryId: 'min_youth' });

describe('channelAudienceAllows', () => {
  it('lets anyone in the church follow a church channel', () => {
    expect(channelAudienceAllows(youth('church'), nobody)).toBe(true);
    expect(channelAudienceAllows({ id: 'x', audience: null, ministryId: null }, nobody)).toBe(true);
  });

  it('a ministry channel needs a group in that ministry — any role', () => {
    const member = { ...nobody, groups: [{ ministryId: 'min_youth', role: 'member' }] };
    const elsewhere = { ...nobody, groups: [{ ministryId: 'min_kids', role: 'leader' }] };
    expect(channelAudienceAllows(youth('ministry'), member)).toBe(true);
    expect(channelAudienceAllows(youth('ministry'), elsewhere)).toBe(false);
    expect(channelAudienceAllows(youth('ministry'), nobody)).toBe(false);
  });

  it('a leaders channel needs to lead a group in that ministry', () => {
    const member = { ...nobody, groups: [{ ministryId: 'min_youth', role: 'member' }] };
    const leader = { ...nobody, groups: [{ ministryId: 'min_youth', role: 'leader' }] };
    const owner = { ...nobody, groups: [{ ministryId: 'min_youth', role: 'owner' }] };
    expect(channelAudienceAllows(youth('leaders'), member)).toBe(false);
    expect(channelAudienceAllows(youth('leaders'), leader)).toBe(true);
    expect(channelAudienceAllows(youth('leaders'), owner)).toBe(true);
  });

  it('whoever leads the channel itself is always in its audience', () => {
    const staff = { ...nobody, leadsChannelIds: new Set(['ch_youth']) };
    expect(channelAudienceAllows(youth('leaders'), staff)).toBe(true);
  });

  it('fails closed: no ministry, or an unknown audience, admits only its leaders', () => {
    const member = { ...nobody, groups: [{ ministryId: null, role: 'leader' }] };
    expect(channelAudienceAllows({ id: 'c', audience: 'ministry', ministryId: null }, member)).toBe(false);
    expect(channelAudienceAllows({ id: 'c', audience: 'secret', ministryId: 'min_youth' }, member)).toBe(false);
  });
});

describe('buildAudienceViewer', () => {
  it('reads led channels from channel rows and groups from shared rows', () => {
    const viewer = buildAudienceViewer([
      { spaceId: 'ch_a', type: 'public', ministryId: 'm', role: 'leader' },
      { spaceId: 'ch_b', type: 'public', ministryId: 'm', role: 'member' },
      { spaceId: 'grp', type: 'shared', ministryId: 'm', role: 'member' },
    ]);
    expect([...viewer.leadsChannelIds]).toEqual(['ch_a']);
    expect(viewer.groups).toEqual([{ ministryId: 'm', role: 'member' }]);
  });
});

describe('isChannelAudience', () => {
  it('accepts the three audiences only', () => {
    expect(['church', 'ministry', 'leaders'].every(isChannelAudience)).toBe(true);
    expect(isChannelAudience('everyone')).toBe(false);
    expect(isChannelAudience(undefined)).toBe(false);
  });
});

describe('restricted channels — wiring', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('only ever deletes member rows', () => {
    const text = src('server/utils/church-channel-audience.ts');
    const deletes = text.split('db.delete(SpaceMemberships)').slice(1);
    expect(deletes.length).toBeGreaterThan(0);
    for (const tail of deletes) expect(tail.slice(0, 400)).toContain("eq(SpaceMemberships.role, 'member')");
  });

  it('reconciles on every read that delivers a channel to someone', () => {
    const church = src('server/routes/church.ts');
    const channels = church.slice(church.indexOf("app.get('/api/church/channels'"), church.indexOf("app.post('/api/church/channels/:spaceId/follow'"));
    expect(channels).toContain('reconcileViewerChannelAudience(auth.userId, church.orgId)');
    const feed = church.slice(church.indexOf("app.get('/api/church/feed'"));
    expect(feed.slice(0, 1200)).toContain('reconcileViewerChannelAudience(auth.userId, church.orgId)');
    expect(src('server/utils/church-publish-push.ts')).toContain('await reconcileViewerChannelAudience(userId, orgId)');
    expect(src('server/utils/church-review-delivery.ts')).toContain('reconcileViewerChannelAudience(userId, orgId)');
  });

  it('gates follow (not unfollow) and the join link on the audience', () => {
    const church = src('server/routes/church.ts');
    expect(church).toContain("intent === 'follow' && space.audience !== 'church' && !channelAudienceAllows");
    expect(church).toContain("resolveFollowTarget(auth.userId, c.req.param('spaceId') ?? '', 'unfollow')");
    expect(src('server/utils/church-join-link.ts')).toContain("row.audience === 'church'");
  });

  it('the audience route answers dry runs without writing, and checks the ministry first', () => {
    const routes = src('server/routes/church-ministries.ts');
    const body = routes.slice(routes.indexOf("app.post('/api/church/ministries/set-channel-audience'"));
    const dry = body.indexOf('body.dryRun === true');
    expect(dry).toBeGreaterThan(-1);
    expect(body.indexOf('db.update(Spaces)')).toBeGreaterThan(dry);
    expect(body.indexOf("'AUDIENCE_REQUIRES_MINISTRY'")).toBeLessThan(dry);
    expect(body).toContain('resolveChurchOrgAccess(auth.userId, str(body.orgId), AUDIENCE)');
  });
});
