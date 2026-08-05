/**
 * Source-contract test for POST /api/church/staff/role.
 *
 * This is the one write that hands out the teaching plan and church templates,
 * so its guardrails are structural: a church must never be left without an
 * admin, and nobody may change their own role out from under the request.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const handler = () => {
  const text = readFileSync(resolve(process.cwd(), 'server/routes/church.ts'), 'utf8');
  const start = text.indexOf("app.post('/api/church/staff/role'");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('// ─── POST /api/church/staff/sync', start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe('POST /api/church/staff/role', () => {
  it('authorises with the manage_staff capability', () => {
    // The capability that names this act is the thing that gates it, rather
    // than a second inline admin check that could drift from it.
    expect(handler()).toContain("capabilitiesForChurchRole(ctx.role).includes('manage_staff')");
  });

  it('refuses to change your own role', () => {
    const body = handler();
    expect(body).toContain('targetUserId === auth.userId');
    expect(body).toContain('CANNOT_CHANGE_SELF');
  });

  it('refuses to demote the last admin', () => {
    const body = handler();
    expect(body).toContain('LAST_ADMIN');
    expect(body).toContain('admins <= 1');
  });

  it('only accepts roles from the allowlist', () => {
    // The role string goes straight to Clerk and back out as capabilities, so
    // an arbitrary one would be a role Harvous has no gating for.
    expect(handler()).toContain('isAssignableChurchRole(nextRole)');
  });

  it('gates before it writes to Clerk', () => {
    const body = handler();
    const gateAt = body.indexOf("includes('manage_staff')");
    const writeAt = body.indexOf('updateClerkOrgMemberRole(');
    expect(writeAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(writeAt);
  });

  it('checks every guardrail before it writes', () => {
    const body = handler();
    const writeAt = body.indexOf('updateClerkOrgMemberRole(');
    for (const guard of ['CANNOT_CHANGE_SELF', 'LAST_ADMIN', 'NOT_STAFF']) {
      expect(body.indexOf(guard), `${guard} is checked after the write`).toBeLessThan(writeAt);
    }
  });

  it('reconciles staff rows immediately, like remove does', () => {
    // A role change moves someone between leader and member rows on the
    // church's channels; leaving that to the webhook would show stale access.
    expect(handler()).toContain('syncChurchStaffForOrg(ctx.church.orgId)');
  });
});
