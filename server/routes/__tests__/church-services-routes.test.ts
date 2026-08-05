/**
 * Source-contract tests for the teaching-plan routes.
 *
 * Same style as church-receive-routes.test.ts: these assert on the shape of the
 * route source rather than booting the app, because the invariants that matter
 * here are structural — which gate runs before which write, and which columns
 * are read where. A behavioural test would exercise one path; these fail if
 * anyone adds a second path that skips the gate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const staffRoutes = () => source('server/routes/church-teaching-plan.ts');
const churchRoutes = () => source('server/routes/church.ts');

describe('congregant read (/api/church/services)', () => {
  /** The slice church-receive-routes.test.ts also treats as congregant-only. */
  const congregantSurface = () => {
    const text = churchRoutes();
    return text.slice(
      text.indexOf("'/api/church/channels'"),
      text.indexOf("'/api/church/billing'"),
    );
  };

  it('lives inside the congregant slice, not the staff one', () => {
    expect(congregantSurface()).toContain("'/api/church/services'");
  });

  it('never takes an orgId from the request', () => {
    // The church always comes from the caller's own UserMetadata.connectedOrgId.
    // An orgId parameter here would be a cross-church lever.
    const surface = congregantSurface();
    expect(surface).not.toMatch(/c\.req\.(query|param)\(\s*'orgId'\s*\)/);
    expect(surface).not.toMatch(/body\.orgId/);
  });

  it('is never sponsorship-gated — a lapsed church keeps its Sunday', () => {
    const text = churchRoutes();
    const block = text.slice(
      text.indexOf("app.get('/api/church/services'"),
      text.indexOf("// ─── GET /api/church/billing"),
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toContain('churchSponsorship');
    expect(block).not.toContain('CHURCH_LAPSED_CODE');
    expect(block).not.toContain('churchIsSponsored');
  });

  it('only ever inlines org templates belonging to the caller’s own church', () => {
    const text = churchRoutes();
    const block = text.slice(
      text.indexOf("app.get('/api/church/services'"),
      text.indexOf("// ─── GET /api/church/billing"),
    );
    expect(block).toContain('eq(NoteTemplates.orgId, church.orgId)');
  });

  it('creates no notes — the starter goes through /api/notes/create', () => {
    // church-receive-routes.test.ts already forbids this file from inserting
    // notes; restated here so the rule survives if these routes ever move.
    expect(churchRoutes()).not.toContain('db.insert(Notes)');
    expect(staffRoutes()).not.toContain('db.insert(Notes)');
  });
});

describe('staff writes (/api/church/services/*)', () => {
  /** Source of one handler, from its `app.<verb>(` to the next one. */
  function handlerBody(marker: string): string {
    const text = staffRoutes();
    const start = text.indexOf(marker);
    expect(start, `${marker} not found`).toBeGreaterThan(-1);
    const next = text.indexOf('\napp.', start + 1);
    return text.slice(start, next === -1 ? undefined : next);
  }

  it.each([
    ["app.post('/api/church/services/create'"],
    ["app.post('/api/church/services/update'"],
    ["app.post('/api/church/services/delete'"],
    ["app.get('/api/church/services/plan'"],
  ])('gates %s on assertCanManageTeachingPlan before any DB access', (marker) => {
    const body = handlerBody(marker);

    const gateAt = body.indexOf('assertCanManageTeachingPlan');
    expect(gateAt, 'handler has no gate').toBeGreaterThan(-1);

    for (const access of ['db.insert(', 'db.update(', 'db.delete(', 'db.select(']) {
      const at = body.indexOf(access);
      if (at === -1) continue;
      expect(gateAt, `${access} runs before the gate`).toBeLessThan(at);
    }
  });

  it('rate-limits every write', () => {
    const text = staffRoutes();
    for (const path of ['create', 'update', 'delete']) {
      const start = text.indexOf(`app.post('/api/church/services/${path}'`);
      const signature = text.slice(start, start + 160);
      expect(signature, `${path} is not rate limited`).toContain("rateLimit('write')");
    }
  });

  it('scopes every service lookup to the caller’s own church', () => {
    // An id from another church must read as "not found", never confirm it exists.
    const text = staffRoutes();
    const lookups = text.split('eq(ChurchServices.id, serviceId)').length - 1;
    const scoped = text.split('eq(ChurchServices.churchId, gate.church.id)').length - 1;
    expect(lookups).toBeGreaterThan(0);
    expect(scoped).toBeGreaterThanOrEqual(lookups);
  });

  it('validates cross-church foreign keys against this org', () => {
    const text = staffRoutes();
    expect(text).toContain('eq(NoteTemplates.orgId, orgId)');
    expect(text).toContain('isMinistryBroadcastSpaceRow');
  });

  it('canonicalizes the passage rather than storing raw input', () => {
    const text = staffRoutes();
    expect(text).toContain('canonicalizeServiceReference');
    expect(text).toContain('INVALID_REFERENCE');
  });
});

describe('companion channel', () => {
  const congregantBlock = () => {
    const text = churchRoutes();
    return text.slice(
      text.indexOf("app.get('/api/church/services'"),
      text.indexOf('// ─── GET /api/church/billing'),
    );
  };

  it('resolves the channel inside this church’s own org', () => {
    // A raw channelSpaceId from another org would otherwise render a title the
    // congregant has no access to.
    const block = congregantBlock();
    expect(block).toContain('eq(Spaces.orgId, church.orgId)');
    expect(block).toContain('isNull(Spaces.deletedAt)');
  });

  it('re-checks that the space is still a ministry channel', () => {
    // A space reclassified out of `public` must degrade to null, not keep
    // pointing congregants at something that is no longer a channel.
    expect(congregantBlock()).toContain('isMinistryBroadcastSpaceRow');
  });

  it('serializes a resolved channel, never the raw id', () => {
    const block = congregantBlock();
    expect(block).toContain('channel: service.channelSpaceId');
    // The payload hands over { id, title, color }; `channelSpaceId:` as an
    // output key would leak an unresolvable pointer.
    expect(block).not.toMatch(/channelSpaceId:\s*service\.channelSpaceId/);
  });

  it('offers staff the church’s channels from the plan endpoint, after the gate', () => {
    // Sourced here rather than from useChurchChannels, which answers for the
    // caller's *home* church and would be the wrong one for a staff member
    // looking at a church they merely help lead.
    const text = staffRoutes();
    const gateAt = text.indexOf('assertCanManageTeachingPlan');
    const channelsAt = text.indexOf('const channelRows');
    expect(channelsAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(channelsAt);
    expect(text).toContain('eq(Spaces.orgId, gate.church.orgId)');
  });
});

describe('privacy: no analytics on who took notes', () => {
  it('neither route file reads the note lineage column', () => {
    // startedFromServiceId belongs to the congregant. The only reader is
    // resolveViewerServiceNotes, scoped to the viewer's own userId.
    for (const text of [churchRoutes(), staffRoutes()]) {
      expect(text).not.toContain('startedFromServiceId');
    }
  });

  it('neither route file aggregates over services', () => {
    for (const text of [churchRoutes(), staffRoutes()]) {
      expect(text).not.toMatch(/groupBy\s*\(/);
    }
  });
});
