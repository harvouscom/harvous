import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/church-ministries.ts');

function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const WRITES = ['create', 'update', 'archive', 'restore', 'assign-space', 'set-staff'].map(
  (name) => `app.post('/api/church/ministries/${name}'`,
);

describe('church ministries routes', () => {
  it.each(WRITES)('%s is admin-gated before any write, and rate-limited', (marker) => {
    const body = handlerBody(routes(), marker);
    const gate = body.indexOf('resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE)');
    expect(gate).toBeGreaterThan(-1);
    for (const write of ['db.insert(', 'db.update(', 'db.delete(', 'db.transaction(']) {
      const at = body.indexOf(write);
      if (at !== -1) expect(gate).toBeLessThan(at);
    }
    expect(body).toContain("rateLimit('write')");
  });

  it('writes need manage_staff and a sponsored church; reads need only staff', () => {
    const write = routes().slice(routes().indexOf('const WRITE'), routes().indexOf('};', routes().indexOf('const WRITE')));
    expect(write).toContain("capability: 'manage_staff'");
    expect(write).toContain('sponsorshipGated: true');
    const read = routes().slice(routes().indexOf('const READ'), routes().indexOf('};', routes().indexOf('const READ')));
    expect(read).toContain("capability: 'publish'");
    expect(read).toContain('sponsorshipGated: false');
  });

  it('syncs after every change to who leads what', () => {
    for (const name of ['archive', 'restore', 'assign-space', 'set-staff']) {
      expect(handlerBody(routes(), `app.post('/api/church/ministries/${name}'`)).toContain('await syncAfter(');
    }
  });

  it('never scopes a church-wide role, and only scopes someone on the roster', () => {
    const body = handlerBody(routes(), "app.post('/api/church/ministries/set-staff'");
    expect(body).toContain('isMinistryScopableRole(member.role)');
    expect(body).toContain("'ROLE_IS_CHURCH_WIDE'");
    expect(body).toContain("'NOT_STAFF'");
  });

  it('keeps archived ministries’ staff rows, so scoped teachers fail closed', () => {
    const body = handlerBody(routes(), "app.post('/api/church/ministries/archive'");
    expect(body).not.toContain('ChurchMinistryStaff');
  });

  it('clears a staffer’s scope when they become church-wide or leave', () => {
    const church = source('server/routes/church.ts');
    const role = handlerBody(church, "app.post('/api/church/staff/role'");
    expect(role).toContain('if (!isMinistryScopableRole(nextRole)) await clearMinistryScope(');
    expect(handlerBody(church, "app.post('/api/church/staff/remove'")).toContain('await clearMinistryScope(');
  });

  it('new church spaces take a ministry and get their leaders immediately', () => {
    const spaces = source('server/routes/spaces.ts');
    for (const route of ["route.post('/api/spaces/create-church-shared'", "route.post('/api/spaces/create-ministry-channel'"]) {
      const start = spaces.indexOf(route);
      const body = spaces.slice(start, spaces.indexOf('\nroute.', start + 1));
      expect(body).toContain('resolveMinistryForNewSpace(');
      expect(body).toContain('ministryId: ministry.ministryId');
      expect(body).toContain('syncChurchStaffForOrg(gate.church.orgId, { spaceIds: [newSpace.id] })');
    }
  });

  it('refuses to pair a group and a channel from different ministries', () => {
    expect(source('server/utils/church-space-channel-links.ts')).toContain("code: 'LINK_CROSSES_MINISTRIES'");
  });
});

describe('the staff sync with ministries', () => {
  const sync = () => source('server/utils/church-staff-sync.ts');
  it('reads the scope once, before any write, and passes it to the planner', () => {
    const text = sync();
    const load = text.indexOf('await loadStaffScope(orgId)');
    expect(load).toBeGreaterThan(-1);
    expect(load).toBeLessThan(text.indexOf('db.transaction('));
    expect(text).toContain('spaceMinistryId: effectiveSpaceMinistry(space.ministryId, liveMinistryIds)');
    expect(text).toContain('scope,');
  });

  it('keeps the SQL guard that only ever deletes non-granted leader rows', () => {
    const text = sync();
    expect(text).toContain("eq(SpaceMemberships.role, 'leader')");
    expect(text).toContain("ne(SpaceMemberships.grantSource, 'grant')");
  });

  it('tolerates only a missing ministries table, never any other failure', () => {
    const loader = source('server/utils/church-ministries.ts');
    const fn = loader.slice(loader.indexOf('export async function loadStaffScope'));
    expect(fn).toContain("isPgUndefinedRelation(error, 'ChurchMinistries')");
    expect(fn).toContain('throw error;');
  });
});
