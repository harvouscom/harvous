/**
 * Contract tests for church join links.
 *
 * Source assertions, matching church-library-routes.test.ts. What they protect:
 * staff are proven before any write, a lapsed church can always turn its link off,
 * the public preview needs no account and tells a stranger nothing but what the
 * church printed, and a redeem asks before moving someone between churches.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/church-join.ts');
const util = () => source('server/utils/church-join-link.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const STAFF_WRITES = [
  ["app.post('/api/church/join-link/create'", 'assertCanManageChurchJoinLink'],
  ["app.post('/api/church/join-link/rotate'", 'assertCanManageChurchJoinLink'],
  ["app.post('/api/church/join-link/revoke'", 'assertCanRevokeChurchJoinLink'],
] as const;

describe('church join link — staff', () => {
  it.each(STAFF_WRITES)('gates %s before any write', (marker, gate) => {
    const body = handlerBody(routes(), marker);
    const gateAt = body.indexOf(`await ${gate}(`);
    expect(gateAt, 'handler has no gate').toBeGreaterThan(-1);
    for (const write of ['db.insert(', 'db.update(', 'db.delete(', 'db.transaction(', 'insertLiveLink(']) {
      const at = body.indexOf(write);
      if (at === -1) continue;
      expect(gateAt, `${write} runs before the gate`).toBeLessThan(at);
    }
    expect(body).toContain("rateLimit('write')");
  });

  it('sponsorship-gates create and rotate, but never revoke or the read', () => {
    const text = util();
    const rule = (name: string) => {
      const start = text.indexOf(`  ${name}: {`);
      return text.slice(start, text.indexOf('  },', start));
    };
    expect(rule('view')).toContain('sponsorshipGated: false');
    expect(rule('view')).toContain("capability: 'publish'");
    expect(rule('manage')).toContain('sponsorshipGated: true');
    expect(rule('manage')).toContain("capability: 'manage_church_settings'");
    expect(rule('revoke')).toContain('sponsorshipGated: false');
    expect(rule('revoke')).toContain("capability: 'manage_church_settings'");
  });

  it('composes the shared gate, so staff are proven before billing state leaks', () => {
    expect(util()).toContain('resolveChurchOrgAccess(userId, orgId, CHURCH_JOIN_ACCESS.');
  });

  it('rotates in one transaction: revoke the live link, then insert its successor', () => {
    const body = handlerBody(routes(), "app.post('/api/church/join-link/rotate'");
    const tx = body.slice(body.indexOf('db.transaction('));
    expect(tx.indexOf("revokedReason: 'rotated'")).toBeGreaterThan(-1);
    expect(tx.indexOf("revokedReason: 'rotated'")).toBeLessThan(tx.indexOf('.insert(ChurchJoinLinks)'));
  });
});

describe('church join link — public preview', () => {
  const preview = () => handlerBody(routes(), "app.get('/api/church/join-preview/:token'");

  it('needs no account, is rate-limited and never cached', () => {
    expect(preview()).not.toContain('requireAuth');
    expect(preview()).toContain("rateLimit('read')");
    expect(preview()).toContain("c.header('Cache-Control', 'private, max-age=0, no-store')");
  });

  it('tells a visitor only what the church printed — no counts, no billing state', () => {
    const body = preview();
    for (const leak of ['useCount', 'totalJoined', 'churchIsSponsored', 'churchSponsorship', 'pilotUntil', 'billingPlan', 'orgId: church.orgId']) {
      const response = body.slice(body.indexOf('return c.json({'));
      expect(response, `preview response mentions ${leak}`).not.toContain(leak);
    }
  });

  it('reads only the viewer’s own row, never anyone else’s', () => {
    const body = preview();
    expect(body).toContain('eq(UserMetadata.userId, auth.userId)');
    expect(body).toContain('eq(SpaceMemberships.userId, auth.userId)');
  });
});

describe('church join link — redeem', () => {
  const redeem = () => handlerBody(routes(), "app.post('/api/church/join/:token/redeem'");

  it('requires an account and is rate-limited', () => {
    expect(redeem()).toContain('requireAuth');
    expect(redeem()).toContain("rateLimit('write')");
  });

  it('asks before switching churches, and only then connects', () => {
    const body = redeem();
    const ask = body.indexOf("'CHURCH_SWITCH_CONFIRM_REQUIRED'");
    const connect = body.indexOf('await connectUserToChurch(');
    expect(ask).toBeGreaterThan(-1);
    expect(connect).toBeGreaterThan(ask);
    expect(body).toContain('confirmSwitch: body.confirmSwitch === true');
  });

  it('connects through the shared write, never its own UserMetadata update', () => {
    expect(redeem()).not.toContain('db.update(UserMetadata)');
    expect(redeem()).not.toContain('db.insert(UserMetadata)');
  });

  it('counts only a genuinely new connection', () => {
    const body = redeem();
    const count = body.indexOf('useCount: sql`');
    expect(count).toBeGreaterThan(-1);
    expect(body.slice(body.lastIndexOf('if (', count), count)).toContain('newlyConnected');
  });

  it('follows only offered channels, only through the follow rail, only while sponsored', () => {
    const body = redeem();
    expect(body).toContain('pickChannelsToFollow(body.channelIds, offered)');
    expect(body).toContain('await followMinistryChannel(auth.userId, spaceId)');
    expect(body).not.toContain('db.insert(SpaceMemberships)');
    const follow = body.indexOf('await followMinistryChannel(');
    expect(body.slice(body.lastIndexOf('if (sponsored)', follow), follow)).toContain('if (sponsored)');
  });

  it('never writes ChurchMemberships — one connect path writing it would leave half a ledger', () => {
    expect(routes()).not.toContain('ChurchMemberships');
    expect(source('server/utils/church-selection-write.ts')).not.toContain('ChurchMemberships');
  });
});

describe('church join link — offered channels', () => {
  it('is the one place the join flow decides what is on offer', () => {
    const body = routes();
    expect(body.match(/followableChannelsForChurch\(/g)?.length).toBe(2);
    expect(body).not.toContain('from(Spaces)');
  });

  it('offers only active, undeleted ministry channels', () => {
    const text = util();
    const fn = text.slice(text.indexOf('export async function followableChannelsForChurch'));
    expect(fn).toContain("eq(Spaces.type, 'public')");
    expect(fn).toContain('isNull(Spaces.deletedAt)');
    expect(fn).toContain('row.isActive');
  });
});
