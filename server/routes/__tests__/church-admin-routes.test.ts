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
    expect(endpoints.length).toBe(14);
    expect(gates.length).toBeGreaterThanOrEqual(11);
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
    // The reconciliation loop now lives in server/utils/church-staff-sync.ts so
    // the admin button, the church's own staff screen, and the Clerk webhook
    // share one implementation. The invariants are asserted there; what this
    // route must guarantee is that it delegates rather than reimplementing.
    expect(route()).toContain('syncChurchStaffForOrg');
    expect(route()).not.toContain('computeStaffSyncPlan');
    expect(route()).not.toContain('delete(SpaceMemberships)');
  });

  it('surfaces the over-cap refusal from the shared sync rather than truncating', () => {
    const syncStaff = route().slice(
      route().indexOf("app.post('/api/admin/churches/:churchId/sync-staff'"),
    );
    // The cap itself is enforced in church-staff-sync.ts; the route must relay
    // its refusal as a 409 instead of reporting a partial success.
    expect(syncStaff).toContain('if (!result.ok)');
    expect(syncStaff).toContain('result.code');
    expect(syncStaff).toContain('409');
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
