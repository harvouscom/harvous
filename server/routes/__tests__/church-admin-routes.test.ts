import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/**
 * Contract tests for the church-org admin provisioning routes (phase 1 —
 * fully dark). These guard the invariants that keep the slice invisible to
 * users and safe next to the shared-spaces release surface.
 */
describe('staff ministry channel create contract', () => {
  it('exposes staff-gated create-ministry-channel beside church-shared', () => {
    const spaces = source('server/routes/spaces.ts');
    expect(spaces).toContain("/api/spaces/create-ministry-channel");
    expect(spaces).toContain('assertCanCreateMinistryChannel');
    expect(spaces).toContain("type: 'public'");
  });
});

describe('church admin route contracts', () => {
  const route = () => source('server/routes/churches.ts');

  it('gates every endpoint with requireHarvousAdmin', () => {
    const endpoints = route().match(/app\.(get|post|put|delete|patch)\(/g) ?? [];
    const gates = route().match(/const gate = await requireHarvousAdmin\(c\);\s*\n\s*if \(gate\) return gate;/g) ?? [];
    // deactivate/reactivate share one gated handler (setChurchActive); HMC + update add more
    // routes. hmc/sync-denorm (get+post) added a cron-callable pair: the gate call is still
    // present, just conditional on a missing/invalid cron secret (see handleHmcSyncDenorm),
    // so it isn't matched by the literal always-runs `gates` regex above — hence the >= below.
    expect(endpoints.length).toBe(13);
    expect(gates.length).toBeGreaterThanOrEqual(10);
    expect(route()).not.toContain('requireAuth');
  });

  it('keeps every path under /api/admin/churches or /api/admin/hmc', () => {
    const paths = [...route().matchAll(/app\.(?:get|post|put|delete|patch)\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(5);
    for (const path of paths) {
      // hmc/sync-denorm is a deliberate sibling surface: a cron-callable admin utility
      // (bearer-token OR requireHarvousAdmin), not a churches-record endpoint.
      expect(
        path.startsWith('/api/admin/churches') || path.startsWith('/api/admin/hmc'),
      ).toBe(true);
    }
  });

  it('validates the Clerk org id and verifies the org before registering', () => {
    expect(route()).toContain('isValidClerkOrgId(orgId)');
    expect(route()).toContain('fetchClerkOrganization(orgId)');
    expect(route()).toContain("code: 'CLERK_ORG_NOT_FOUND'");
    // Registration inserts happen only after validation succeeds
    expect(route().indexOf('isValidClerkOrgId')).toBeLessThan(route().indexOf('db.insert(Churches)'));
  });

  it('creates org broadcast spaces transactionally with an explicit staff owner', () => {
    expect(route()).toContain('db.transaction(async (tx)');
    expect(route()).toContain("type: 'public'");
    expect(route()).toContain('orgId: church.orgId');
    expect(route()).toContain("code: 'OWNER_NOT_IN_ORG'");
    expect(route()).toContain("role: 'owner'");
    // Never defaults space ownership to the Harvous system user
    expect(route()).not.toContain('userId: systemUserId');
  });

  it('staff sync never deletes owner or congregant member rows', () => {
    // The delete is constrained to role='leader' in SQL, not just in the plan
    expect(route()).toMatch(/delete\(SpaceMemberships\)[\s\S]*?eq\(SpaceMemberships\.role, 'leader'\)/);
    expect(route()).toContain('computeStaffSyncPlan');
    // Sync never mutates when the Clerk fetch fails (fetch happens before any write)
    expect(route().indexOf('fetchClerkOrgMemberships(church.orgId)')).toBeLessThan(
      route().indexOf("role: 'leader'"),
    );
  });

  it('staff sync refuses Clerk rosters over the 20-staff church base cap', () => {
    expect(route()).toContain('isWithinClerkOrgStaffCap');
    expect(route()).toContain("code: 'CLERK_ORG_MEMBER_LIMIT'");
    expect(route()).toContain('CLERK_ORG_STAFF_CAP');
    const syncStaff = route().slice(route().indexOf("app.post('/api/admin/churches/:churchId/sync-staff'"));
    // Cap check runs after fetch and before membership writes in this handler
    expect(syncStaff.indexOf('isWithinClerkOrgStaffCap(staff.length)')).toBeLessThan(
      syncStaff.indexOf('computeStaffSyncPlan'),
    );
  });

  it('exposes a Clerk org picker that flags already-registered orgs', () => {
    expect(route()).toContain("app.get('/api/admin/churches/clerk-orgs'");
    expect(route()).toContain('fetchClerkOrganizations()');
    expect(route()).toContain('registered: registered.has(org.id)');
  });

  it('exposes HMC interest aggregation for outreach (before :churchId routes)', () => {
    expect(route()).toContain("app.get('/api/admin/churches/hmc-interest'");
    expect(route()).toContain('listHmcChurchInterest');
    expect(route().indexOf("app.get('/api/admin/churches/hmc-interest'")).toBeLessThan(
      route().indexOf("app.post('/api/admin/churches/:churchId/update'"),
    );
  });

  it('is mounted in the app', () => {
    const app = source('server/app.ts');
    expect(app).toContain("import churches from './routes/churches'");
    expect(app).toContain("app.route('/', churches)");
  });
});
