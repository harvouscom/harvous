import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const settingsRoutes = () => source('server/routes/church-settings.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(marker: string): string {
  const text = settingsRoutes();
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

describe('church settings routes', () => {
  it.each([
    ["app.get('/api/church/settings'", 'assertCanViewChurchSettings'],
    ["app.post('/api/church/settings/update'", 'assertCanManageChurchSettings'],
  ])('gates %s on %s before any DB access', (marker, gate) => {
    const body = handlerBody(marker);

    const gateAt = body.indexOf(gate);
    expect(gateAt, 'handler has no gate').toBeGreaterThan(-1);

    for (const access of ['db.insert(', 'db.update(', 'db.delete(', 'db.select(']) {
      const at = body.indexOf(access);
      if (at === -1) continue;
      expect(gateAt, `${access} runs before the gate`).toBeLessThan(at);
    }
  });

  it('does not let the write borrow the read gate', () => {
    // The read asks only for `publish` — every staff member holds it. A write
    // that reached for it would hand the church's clock to anyone on staff.
    expect(handlerBody("app.post('/api/church/settings/update'")).not.toContain(
      'assertCanViewChurchSettings',
    );
  });

  it('rate-limits the write and leaves the read alone', () => {
    expect(handlerBody("app.post('/api/church/settings/update'")).toContain("rateLimit('write')");
    expect(handlerBody("app.get('/api/church/settings'")).not.toContain('rateLimit');
  });

  it('requires auth on both', () => {
    for (const marker of ["app.get('/api/church/settings'", "app.post('/api/church/settings/update'"]) {
      expect(handlerBody(marker)).toContain('requireAuth');
    }
  });

  it('writes only the three config columns, never the rest of the Churches row', () => {
    /*
      This is the risk the file exists for. `Churches` also holds billing state,
      the HMC-owned name/location cache, and the isActive kill-switch — a church
      must not be able to set any of those about itself, and this is the only
      self-serve door into the table.
    */
    const body = handlerBody("app.post('/api/church/settings/update'");
    for (const forbidden of [
      'name:',
      'city:',
      'state:',
      'country:',
      'hmcChurchId',
      'billingPlan',
      'billingStatus',
      'billingSubscriptionId',
      'pilotUntil',
      'isActive',
      'deletedAt',
      'createdBy',
    ]) {
      expect(body, `update assigns ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('validates through the shared normalizers rather than inline regex', () => {
    expect(handlerBody("app.post('/api/church/settings/update'")).toContain(
      'normalizeChurchTimezone',
    );
    const create = handlerBody("app.post('/api/church/settings/service-times/create'");
    expect(create).toContain('normalizeServiceDay');
    expect(create).toContain('normalizeServiceTime');
  });

  it('keeps the timezone null rather than resolving it server-side', () => {
    // Resolving it to the server's zone would leave the form unable to
    // distinguish "chose this one" from "never set".
    expect(settingsRoutes()).toContain('timezone: church.timezone');
  });

  it('scopes a service-time delete to the caller’s own church', () => {
    // Unscoped, this would let one church remove another's service times.
    const body = handlerBody("app.post('/api/church/settings/service-times/delete'");
    expect(body).toContain('eq(ChurchServiceTimes.churchId, gate.church.id)');
  });

  it('clears assignments when a service time is removed, but not the sermons', () => {
    // A slot going away must not leave sermons pointing at nothing — and must
    // not delete the teaching either.
    const body = handlerBody("app.post('/api/church/settings/service-times/delete'");
    expect(body).toContain('delete(ChurchServiceTimeAssignments)');
    expect(body).not.toContain('delete(ChurchServices)');
  });

  it('is mounted in the app', () => {
    const app = source('server/app.ts');
    expect(app).toContain("import churchSettings from './routes/church-settings'");
    expect(app).toContain("app.route('/', churchSettings)");
  });

  it('stays out of church.ts, whose congregant slice must not learn about orgId params', () => {
    // church-services-routes.test.ts and church-receive-routes.test.ts slice
    // church.ts from '/api/church/channels' to '/api/church/billing' and assert
    // that window never reads an orgId from the request. A staff settings route
    // inside it would silently weaken both.
    expect(source('server/routes/church.ts')).not.toContain("'/api/church/settings'");
  });
});
