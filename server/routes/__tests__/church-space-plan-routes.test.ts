import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const spaceRoutes = () => source('server/routes/church-space-plan.ts');
const churchRoutes = () => source('server/routes/church-teaching-plan.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const SPACE_HANDLERS = [
  ["app.get('/api/church/spaces/:spaceId/plan'", 'assertCanViewSpaceTeachingPlan'],
  ["app.post('/api/church/spaces/:spaceId/services/create'", 'assertCanManageSpaceTeachingPlan'],
  ["app.post('/api/church/spaces/:spaceId/services/update'", 'assertCanManageSpaceTeachingPlan'],
  ["app.post('/api/church/spaces/:spaceId/services/repeat'", 'assertCanManageSpaceTeachingPlan'],
  ["app.post('/api/church/spaces/:spaceId/services/delete'", 'assertCanManageSpaceTeachingPlan'],
  // Series ride the plan's own gate rather than growing one of their own —
  // otherwise who may rename Youth's series could drift from who may plan it.
  ["app.post('/api/church/spaces/:spaceId/series/update'", 'assertCanManageSpaceTeachingPlan'],
  ["app.post('/api/church/spaces/:spaceId/series/delete'", 'assertCanManageSpaceTeachingPlan'],
] as const;

describe('space plan routes', () => {
  it.each(SPACE_HANDLERS)('gates %s on %s before any DB access', (marker, gate) => {
    const body = handlerBody(spaceRoutes(), marker);
    const gateAt = body.indexOf(gate);
    expect(gateAt, 'handler has no gate').toBeGreaterThan(-1);
    for (const access of ['db.insert(', 'db.update(', 'db.delete(', 'db.select(']) {
      const at = body.indexOf(access);
      if (at === -1) continue;
      expect(gateAt, `${access} runs before the gate`).toBeLessThan(at);
    }
  });

  it('lets no write borrow the read gate', () => {
    for (const noun of ['services', 'series']) {
      for (const verb of ['create', 'update', 'repeat', 'delete', 'rename']) {
        const marker = `app.post('/api/church/spaces/:spaceId/${noun}/${verb}'`;
        if (!spaceRoutes().includes(marker)) continue;
        const body = handlerBody(spaceRoutes(), marker);
        expect(body, `${noun}/${verb} uses the read gate`).not.toContain(
          'assertCanViewSpaceTeachingPlan',
        );
      }
    }
  });

  /*
    The whole reason ChurchSeries is plan-scoped rather than church-scoped: the
    space plan's gate is the widened OR, so a granted volunteer leader reaches
    these handlers. If they could name a church-plan series, they could rename a
    row the main service renders.
  */
  it('passes its own space as the series scope, never a bare church', () => {
    const text = spaceRoutes();
    const scopes = text.match(/scope: \{ churchId: [^}]+\}/g) ?? [];
    expect(scopes.length).toBeGreaterThan(0);
    for (const scope of scopes) {
      expect(scope, `series scope not bound to the space: ${scope}`).toContain(
        'spaceId: gate.space.id',
      );
    }
    // The church plan's mirror image — its scopes are always the church's.
    for (const scope of churchRoutes().match(/scope: \{ churchId: [^}]+\}/g) ?? []) {
      expect(scope, `church series scope leaked a space: ${scope}`).toContain('spaceId: null');
    }
  });

  it('keeps the two plans on separate gates', () => {
    // Church gates take an orgId; space gates derive the church from the space.
    // Crossing them would let a caller name a church that does not own the room.
    const space = spaceRoutes();
    expect(space).not.toContain('assertCanViewTeachingPlan');
    expect(space).not.toContain('assertCanManageTeachingPlan');
    const church = churchRoutes();
    expect(church).not.toContain('SpaceTeachingPlan');
  });

  it('never takes a church or org id from the request', () => {
    // The space is the only id a caller supplies; the church is derived from
    // it, which is what enforces the same-church invariant.
    const text = spaceRoutes();
    expect(text).not.toMatch(/body\.orgId/);
    expect(text).not.toMatch(/body\.churchId/);
    expect(text).not.toMatch(/query\('orgId'\)/);
  });

  it('scopes every row lookup to the space, not just the church', () => {
    // An id from the church plan must read as "not found" from this door, and
    // this is also what makes spaceId immutable — nothing can rewrite it.
    for (const verb of ['update', 'delete']) {
      const body = handlerBody(spaceRoutes(), `app.post('/api/church/spaces/:spaceId/services/${verb}'`);
      expect(body, verb).toContain('eq(ChurchServices.spaceId, gate.space.id)');
    }
  });

  it('stops a repeat run at a collision instead of skipping the week', () => {
    const body = handlerBody(spaceRoutes(), "app.post('/api/church/spaces/:spaceId/services/repeat'");
    expect(body).toMatch(/stoppedAt = serviceDate;\s*break;/);
    expect(body).not.toMatch(/\bcontinue\b/);
    // Seeded from this space's own row, so a church sermon can't be repeated here.
    expect(body).toContain('eq(ChurchServices.spaceId, gate.space.id)');
  });

  it('writes spaceId on create and never on update', () => {
    const create = handlerBody(spaceRoutes(), "app.post('/api/church/spaces/:spaceId/services/create'");
    expect(create).toContain('spaceId: gate.space.id');
    const update = handlerBody(spaceRoutes(), "app.post('/api/church/spaces/:spaceId/services/update'");
    expect(update).not.toMatch(/updates\.spaceId/);
  });

  it('refuses church service-time slots on a space row', () => {
    /*
      Slots belong to the church; a space gathers once, at its own meetingTime.
      The serializer still emits an empty `serviceTimeIds` so one client
      component can render either plan without branching — what must not exist
      is any path that *claims* a slot.
    */
    const text = spaceRoutes();
    expect(text).not.toContain('replaceServiceTimeAssignments');
    expect(text).not.toContain('filterServiceTimeIdsForChurch');
    expect(text).not.toMatch(/body\.serviceTimeIds/);
    // And the row literal must pin serviceTime to null rather than take input.
    const create = handlerBody(spaceRoutes(), "app.post('/api/church/spaces/:spaceId/services/create'");
    expect(create).toMatch(/serviceTime: null/);
    expect(create).not.toMatch(/normalizeServiceTime/);
  });

  it('catches the space uniqueness violation rather than pre-checking it', () => {
    // The partial index is the real guard; a SELECT-then-INSERT is a race.
    const create = handlerBody(spaceRoutes(), "app.post('/api/church/spaces/:spaceId/services/create'");
    expect(create).toContain("isUniqueViolation(error, 'ChurchServices_space_date_unique')");
  });
});

describe('the church plan stays church-scoped', () => {
  it('filters the staff plan read to spaceId IS NULL', () => {
    // Without this the moment spaceId existed, every ministry's rows would
    // appear in the church's own sermon list.
    const body = handlerBody(churchRoutes(), "app.get('/api/church/services/plan'");
    expect(body).toContain('isNull(ChurchServices.spaceId)');
  });

  it('scopes the timeless-duplicate guard to the church plan', () => {
    const body = handlerBody(churchRoutes(), "app.post('/api/church/services/create'");
    expect(body).toContain('isNull(ChurchServices.spaceId)');
  });

  it('defaults listServicesForChurch to the church plan', () => {
    // The congregant card calls this. A churchId-only filter would merge
    // Youth's Wednesday into "This Sunday" with no code change anywhere.
    const helper = source('server/utils/church-teaching-plan.ts');
    expect(helper).toContain('isNull(ChurchServices.spaceId)');
    expect(helper).toMatch(/plan \? plan\.spaceId : null/);
  });
});

describe('plan entry kind', () => {
  it('derives kind from the space, never from the request body', () => {
    // A client that could name its own kind could file a gathering as content
    // and walk straight through the one-per-date index.
    const text = spaceRoutes();
    expect(text).toContain('planKindForSpace(gate.space)');
    expect(text).not.toMatch(/body\.kind/);
  });

  it('stamps kind on every row a space plan writes', () => {
    for (const marker of [
      "app.post('/api/church/spaces/:spaceId/services/create'",
      "app.post('/api/church/spaces/:spaceId/services/repeat'",
    ]) {
      const body = handlerBody(spaceRoutes(), marker);
      expect(body, `${marker} writes a row without a kind`).toMatch(/kind: /);
    }
  });

  it('keeps the church plan explicitly a gathering', () => {
    // Stated rather than left to the column default, so the intent survives a
    // schema edit that changes what the default is.
    const body = handlerBody(churchRoutes(), "app.post('/api/church/services/create'");
    expect(body).toContain("kind: 'gathering'");
  });

  it('narrows the one-per-date index to gatherings', () => {
    // A daily channel puts several entries on one date by design; "one per
    // date" is a fact about a room people walk into, not a publishing queue.
    const schema = source('server/db/schema.ts');
    expect(schema).toMatch(/ChurchServices_space_date_unique/);
    expect(schema).toMatch(/kind\} = 'gathering'/);
  });

  it('publishes planKind on the plan read so the client never re-derives it', () => {
    const body = handlerBody(spaceRoutes(), "app.get('/api/church/spaces/:spaceId/plan'");
    expect(body).toContain('planKind:');
  });
});
