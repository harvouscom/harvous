/**
 * Contract tests for Family Accounts routes. Source assertions, matching
 * church-join-routes.test.ts. What they protect: every write is signed in, rate limited and
 * asks the family rules before touching a row; the public invite preview says nothing a
 * stranger shouldn't learn; a redeem must echo the role it consents to; and the generic
 * space routes can't be used to slip around the family.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/family.ts');

function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const WRITES = [
  ["app.patch('/api/family'", 'canRenameFamily('],
  ["app.delete('/api/family'", "mine.family.ownerUserId !== auth.userId"],
  ["app.post('/api/family/invites'", 'canInviteToFamily('],
  ["app.delete('/api/family/invites/:inviteId'", 'canInviteToFamily('],
  ["app.patch('/api/family/members/:userId'", 'canChangeFamilyRole('],
  ["app.delete('/api/family/members/:userId'", 'canRemoveFamilyMember('],
  ["app.post('/api/family/invites/:token/redeem'", 'evaluateFamilyInviteRedemption('],
  ["app.post('/api/family/role-requests'", 'canRequestAdult('],
  ["app.post('/api/family/role-requests/:requestId/decide'", 'canDecideRequest('],
  ["app.post('/api/family/role-requests/:requestId/escalate'", 'canEscalateRequest('],
] as const;

describe('family routes — writes', () => {
  it.each(WRITES)('%s is gated before any write', (marker, gate) => {
    const body = handlerBody(routes(), marker);
    expect(body).toContain('requireAuth');
    expect(body).toContain("rateLimit('write')");
    const gateAt = body.indexOf(gate);
    expect(gateAt, 'handler has no gate').toBeGreaterThan(-1);
    // The redeem decides inside its transaction; everything else decides before opening one.
    if (marker.includes('redeem')) {
      const decided = body.indexOf(gate);
      for (const write of ['tx.insert(FamilyMembers', '.update(FamilyInvites)', 'upsertSpaceRole(tx']) {
        expect(decided, `${write} runs before the decision`).toBeLessThan(body.indexOf(write));
      }
      return;
    }
    for (const write of ['db.insert(', 'db.update(', 'db.delete(', 'db.transaction(']) {
      const at = body.indexOf(write);
      if (at === -1) continue;
      expect(gateAt, `${write} runs before the gate`).toBeLessThan(at);
    }
  });

  it('starting a family is preview-gated and needs the caller’s own Plus', () => {
    const body = handlerBody(routes(), "app.post('/api/family'");
    expect(body).toContain('canStartFamilyInPreview(auth.userId)');
    expect(body).toContain("code: 'FAMILY_NEEDS_PLUS'");
    expect(body.indexOf('FAMILY_NEEDS_PLUS')).toBeLessThan(body.indexOf('db.transaction('));
  });

  it('a lapsed owner can’t add people, and the cap counts open invites', () => {
    const body = handlerBody(routes(), "app.post('/api/family/invites'");
    expect(body).toContain("code: 'FAMILY_PLAN_LAPSED'");
    expect(body).toContain('seatsTaken(');
    expect(body).toContain('FAMILY_MAX_MEMBERS');
  });
});

describe('family invite preview', () => {
  const body = () => handlerBody(routes(), "app.get('/api/family/invites/preview/:token'");

  it('is public and rate limited', () => {
    expect(body()).not.toContain('requireAuth');
    expect(body()).toContain("rateLimit('read')");
  });

  it('returns only what the invite page shows', () => {
    const response = body().slice(body().indexOf('return c.json({\n'), body().indexOf('} catch'));
    const fields = [...response.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(['disclosure', 'familyName', 'inviterFirstName', 'reason', 'role', 'valid']);
  });
});

describe('family redeem', () => {
  it('passes the client’s acknowledged role to the decision', () => {
    const body = handlerBody(routes(), "app.post('/api/family/invites/:token/redeem'");
    expect(body).toContain('acknowledgedRole: body.acknowledgedRole');
    expect(body).toContain(".for('update')");
    expect(body).toContain('reconcileFamilyCoverage(family.id, tx)');
  });
});

describe('the Family Space is guarded in the generic space routes', () => {
  const spaces = source('server/routes/spaces.ts');
  const guarded = (marker: string, code: string) => {
    const start = spaces.indexOf(marker);
    expect(start, `${marker} not found`).toBeGreaterThan(-1);
    const body = spaces.slice(start, spaces.indexOf('\nroute.', start + 1));
    expect(body).toContain('familyForSpace(');
    expect(body).toContain(code);
  };
  it('refuses space invite links', () => guarded("route.post('/api/spaces/:spaceId/invites'", 'FAMILY_SPACE_USE_FAMILY_INVITES'));
  it('refuses space invite redeem', () => guarded("route.post('/api/spaces/invites/:token/redeem'", 'FAMILY_SPACE_USE_FAMILY_INVITES'));
  it('refuses member removal', () => guarded("route.delete('/api/spaces/:spaceId/members/:userId'", 'FAMILY_SPACE_USE_FAMILY_SETTINGS'));
  it('refuses delete', () => guarded("route.delete('/api/spaces/delete'", "'FAMILY_SPACE'"));
});

describe('account deletion', () => {
  it('dissolves an owner’s family before their spaces go', () => {
    const text = source('server/utils/delete-account.ts');
    const family = text.indexOf("'family',");
    const spaces = text.indexOf("'owned spaces',");
    expect(family).toBeGreaterThan(-1);
    expect(family).toBeLessThan(spaces);
    expect(text).toContain('dissolveFamily(tx, owned');
  });
});

describe('freeze', () => {
  const text = () => source('server/routes/family.ts');
  it.each([
    "app.patch('/api/family'",
    "app.post('/api/family/invites'",
    "app.patch('/api/family/members/:userId'",
  ])('%s refuses while support has the family paused', (marker) => {
    expect(handlerBody(text(), marker)).toContain('FAMILY_FROZEN_REFUSAL');
  });

  it('never blocks someone leaving', () => {
    const body = handlerBody(text(), "app.delete('/api/family/members/:userId'");
    expect(body).toContain('mine.family.frozenAt && targetUserId !== auth.userId');
  });
});

describe('admin families', () => {
  const admin = () => source('server/routes/admin-families.ts');
  const handlers = () => [...admin().matchAll(/app\.(get|post)\('([^']+)'/g)].map((m) => `app.${m[1]}('${m[2]}'`);

  it('every route is admin-gated first', () => {
    for (const marker of handlers()) {
      const body = handlerBody(admin(), marker);
      expect(body.indexOf('requireHarvousAdmin(c)'), marker).toBeGreaterThan(-1);
      expect(body.indexOf('requireHarvousAdmin(c)')).toBeLessThan(body.indexOf('try {'));
    }
  });

  it('every write needs a reason and is recorded as support', () => {
    for (const marker of handlers().filter((m) => m.startsWith('app.post'))) {
      const body = handlerBody(admin(), marker);
      expect(body, marker).toContain('if (!reason) return c.json(NEED_REASON, 400);');
      expect(body, marker).toMatch(/actorKind: 'support'/);
    }
  });

  it('never reaches for note content', () => {
    expect(admin()).not.toMatch(/\bNotes\b|SpaceNotes|ReviewItems|ReadingEvents/);
  });
});
