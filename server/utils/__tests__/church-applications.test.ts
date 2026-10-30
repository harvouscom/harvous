import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canWithdraw, cleanApplicationInput } from '../church-applications';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('cleanApplicationInput', () => {
  it('accepts a directory pick with no typed name', () => {
    const r = cleanApplicationInput({ hmcChurchId: 'TX-1', applicantRole: 'Senior pastor', timezone: 'America/Chicago' });
    expect(r.ok && r.value).toMatchObject({ hmcChurchId: 'TX-1', name: null, timezone: 'America/Chicago' });
  });
  it('accepts a typed church the directory doesn’t have', () => {
    const r = cleanApplicationInput({ name: '  New  Hope  ', city: 'Ames', applicantRole: 'Elder', country: 'us' });
    expect(r.ok && r.value).toMatchObject({ hmcChurchId: null, name: 'New Hope', country: 'US' });
  });
  it('needs a church and a role, and a real-looking email', () => {
    expect(cleanApplicationInput({ applicantRole: 'Pastor' })).toMatchObject({ ok: false, code: 'CHURCH_REQUIRED' });
    expect(cleanApplicationInput({ hmcChurchId: 'TX-1' })).toMatchObject({ ok: false, code: 'ROLE_REQUIRED' });
    expect(cleanApplicationInput({ hmcChurchId: 'TX-1', applicantRole: 'x', contactEmail: 'nope' })).toMatchObject({
      ok: false,
      code: 'EMAIL_INVALID',
    });
  });
  it('drops a time zone it doesn’t know rather than failing the request', () => {
    const r = cleanApplicationInput({ hmcChurchId: 'TX-1', applicantRole: 'x', timezone: 'Mars/Olympus' });
    expect(r.ok && r.value.timezone).toBeNull();
  });
  it('caps notes', () => {
    const r = cleanApplicationInput({ hmcChurchId: 'TX-1', applicantRole: 'x', notes: 'a'.repeat(5000) });
    expect(r.ok && r.value.notes?.length).toBe(1000);
  });
});

describe('canWithdraw', () => {
  it('only the applicant, only while pending', () => {
    expect(canWithdraw({ applicantUserId: 'u1', status: 'pending' }, 'u1')).toBe(true);
    expect(canWithdraw({ applicantUserId: 'u1', status: 'pending' }, 'u2')).toBe(false);
    expect(canWithdraw({ applicantUserId: 'u1', status: 'approved' }, 'u1')).toBe(false);
  });
});

describe('approve — wiring', () => {
  const text = src('server/utils/church-applications.ts');
  const fn = text.slice(text.indexOf('export async function approveApplication'));

  it('claims the request before creating anything, so a double tap makes one org', () => {
    const claim = fn.indexOf("eq(ChurchApplications.status, 'pending')");
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(fn.indexOf('createClerkOrganization('));
    expect(fn.indexOf('createClerkOrganization(')).toBeLessThan(fn.indexOf('.insert(Churches)'));
  });

  it('puts the request back, and removes the org, when registering fails', () => {
    const insert = fn.slice(fn.indexOf('.insert(Churches)'));
    expect(insert.slice(0, 2000)).toContain('deleteClerkOrganization(orgId)');
    expect(insert.slice(0, 2000)).toContain('await release()');
  });

  it('makes the applicant the church’s creator and starts the pilot', () => {
    expect(fn).toContain('createdBy: claimed.applicantUserId');
    expect(fn).toContain('pilotUntil: extendedPilotUntil(null, APPLICATION_PILOT_DAYS, now)');
  });

  it('the admin routes are all behind requireHarvousAdmin', () => {
    const routes = src('server/routes/church-applications.ts');
    for (const path of ["'/api/admin/church-applications'", "'/api/admin/church-applications/:id/approve'", "'/api/admin/church-applications/:id/decline'"]) {
      const at = routes.indexOf(path);
      expect(at).toBeGreaterThan(-1);
      expect(routes.slice(at, at + 200)).toContain('requireHarvousAdmin(c)');
    }
  });
});
