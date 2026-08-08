/**
 * Source-contract tests for the teaching-plan routes.
 *
 * Same style as church-receive-routes.test.ts: these assert on the shape of the
 * route source rather than booting the app, because the invariants that matter
 * here are structural — which gate runs before which write, and which columns
 * are read where. A behavioural test would exercise one path; these fail if
 * anyone adds a second path that skips the gate.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
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
    ["app.post('/api/church/services/create'", 'assertCanManageTeachingPlan'],
    ["app.post('/api/church/services/update'", 'assertCanManageTeachingPlan'],
    ["app.post('/api/church/services/repeat'", 'assertCanManageTeachingPlan'],
    ["app.post('/api/church/services/delete'", 'assertCanManageTeachingPlan'],
    // Series ride the plan's own gate rather than growing one of their own.
    ["app.post('/api/church/series/update'", 'assertCanManageTeachingPlan'],
    ["app.post('/api/church/series/delete'", 'assertCanManageTeachingPlan'],
    // The read is deliberately the wider gate: `sermon_tools`, so a teacher
    // sees the plan they teach from, and no sponsorship check on a read.
    ["app.get('/api/church/services/plan'", 'assertCanViewTeachingPlan'],
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

  it('ships slot ids to staff and resolved clock times to congregants', () => {
    // Staff pick from checkboxes, so they need the ids. A congregant gets clock
    // readings and learns nothing about the church's wider schedule.
    expect(staffRoutes()).toContain('serviceTimeIds');
    expect(churchRoutes()).toContain('serviceTimes: times');
    expect(churchRoutes()).not.toContain('serviceTimeIds:');
  });

  it('sends the church clock so the card can tell whether a service has started', () => {
    // The only place a timezone is applied; every stored time stays naive.
    expect(churchRoutes()).toContain('churchNow: churchClockNow(church.timezone)');
  });

  it('puts serviceTime in the create row literal', () => {
    // The literal is echoed straight back through serializeSermon, so omitting
    // the key ships a create response shaped differently from every read — a
    // bug no read-back test can see.
    const body = handlerBody("app.post('/api/church/services/create'");
    expect(body).toMatch(/const row = \{[\s\S]*?\bserviceTime,/);
  });

  it('writes the sermon and its service times in one transaction', () => {
    // A sermon that failed to claim its slots must not survive half-created:
    // "no slots" means something else entirely (a one-off time, or nothing).
    for (const marker of [
      "app.post('/api/church/services/create'",
      "app.post('/api/church/services/update'",
    ]) {
      const body = handlerBody(marker);
      expect(body, marker).toContain('db.transaction');
      expect(body, marker).toContain('replaceServiceTimeAssignments');
    }
  });

  it('exposes the church service times on the plan payload, not on its church envelope', () => {
    // The `church` object is deliberately the same shape as the congregant
    // payload's; the slots ride beside it so a space plan can fill the same key
    // later without a rename.
    const body = handlerBody("app.get('/api/church/services/plan'");
    expect(body).toMatch(/serviceTimes:\s*serviceTimes\.map/);
    expect(body).toMatch(/church:\s*\{\s*id: gate\.church\.id,\s*name: gate\.church\.name\s*\}/);
  });

  it('lets no write borrow the read gate', () => {
    // Two gate names is what keeps the table above honest, so nothing may
    // quietly downgrade a write to the capability a teacher already holds.
    for (const path of [
      'services/create',
      'services/update',
      'services/repeat',
      'services/delete',
      'series/update',
      'series/delete',
    ]) {
      const body = handlerBody(`app.post('/api/church/${path}'`);
      expect(body, `${path} uses the read gate`).not.toContain('assertCanViewTeachingPlan');
    }
  });

  it('rate-limits every write', () => {
    const text = staffRoutes();
    for (const path of [
      'services/create',
      'services/update',
      'services/repeat',
      'services/delete',
      'series/update',
      'series/delete',
    ]) {
      const start = text.indexOf(`app.post('/api/church/${path}'`);
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

  /*
    Bulk entry is where a scoping slip is most expensive: one bad `where` and a
    pastor generates a quarter of someone else's Sundays, or repeats a space's
    Wednesday into the church plan.
  */
  it('repeats only within the church plan, from a row this church owns', () => {
    const body = handlerBody("app.post('/api/church/services/repeat'");
    expect(body).toContain('eq(ChurchServices.churchId, gate.church.id)');
    expect(body).toContain('isNull(ChurchServices.spaceId)');
  });

  it('stops the run at a collision instead of skipping the week', () => {
    const body = handlerBody("app.post('/api/church/services/repeat'");
    // `break`, never `continue` — a plan with an unnoticed hole is worse than a
    // short one the pastor can see.
    expect(body).toMatch(/stoppedAt = serviceDate;\s*break;/);
    expect(body).not.toMatch(/\bcontinue\b/);
  });

  it('never copies the seed passage onto generated weeks', () => {
    const body = handlerBody("app.post('/api/church/services/repeat'");
    expect(body).toContain('reference: null');
    expect(body).not.toContain('reference: seed.reference');
  });

  /*
    Nothing cascades here — the ids in ChurchServiceTimeAssignments are plain
    text columns with no foreign key. A delete that dropped only the sermon left
    assignments holding its place in the slot/date unique index, so that service
    time on that date was blocked forever with nothing in the plan to show why.
  */
  it('releases a deleted sermon’s service-time slots in the same transaction', () => {
    const body = handlerBody("app.post('/api/church/services/delete'");
    expect(body).toContain('clearServiceTimeAssignments');
    expect(body).toContain('db.transaction(');
    // The bare delete is what left the orphans; it must not come back.
    expect(body).not.toMatch(/await db\s*\.delete\(ChurchServices\)/);
  });

  it('canonicalizes the passage rather than storing raw input', () => {
    const text = staffRoutes();
    expect(text).toContain('canonicalizeServiceReference');
    expect(text).toContain('INVALID_REFERENCE');
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

  /*
    ChurchSeries brought the first COUNT into church code (`listSeriesForPlan`
    counts sermons under a series). It counts *rows of the plan*, never people —
    and the rule that keeps it that way is that the series helper may not touch
    Notes at all. Asserted at its source in church-series.test.ts; asserted here
    so the boundary is visible from the privacy suite that owns the doctrine.
  */
  it('keeps the series helper away from note lineage entirely', () => {
    const series = source('server/utils/church-series.ts');
    expect(series).not.toContain('startedFromServiceId');
    expect(series).not.toMatch(/\bNotes\b/);
  });

  /*
    Aggregate engagement (roadmap item 12) is the one church surface allowed to
    count. The line it must not cross is this one: a pastor may learn how many
    people are connected, never that anyone wrote — so the lineage column stays
    off-limits there too. Its own suite asserts the same thing from the other
    side; both are listed here so the doctrine reads in one place.
  */
  it('lets the engagement view count people, never notes', () => {
    // Comments stripped first: those files *name* the column in the docblock
    // that explains why they never read it, and that prose is the point.
    for (const path of [
      'server/utils/church-engagement.ts',
      'server/routes/church-engagement.ts',
    ]) {
      const code = withoutComments(source(path));
      expect(code, path).not.toContain('startedFromServiceId');
      expect(code, path).not.toMatch(/\bNotes\b/);
    }
  });

  /*
    The staff half of the same promise.

    `plannedForServiceId` is the pastor writing a sermon, where
    `startedFromServiceId` is the congregant receiving one. Opposite directions,
    same rule: **only ever read scoped to the viewer's own userId.** A pastor may
    see that they started a draft for a week; no route may tell them a colleague
    has. Holding both columns to one discipline is what keeps "Review is never
    shared" a property of the schema rather than of whoever wrote the last route.
  */
  it('keeps the staff draft column out of the route files entirely', () => {
    for (const text of [churchRoutes(), staffRoutes()]) {
      expect(withoutComments(text)).not.toContain('plannedForServiceId');
    }
  });

  it('leaves the staff draft column with one viewer-scoped reader', () => {
    const allowed = [
      'server/utils/church-teaching-plan.ts', // resolveViewerPlannedNotes + linkNoteToService
      'server/db/schema.ts',
      'server/db/validate-schema.ts',
      // Creates the column; it is DDL, not a read.
      'server/scripts/add-series-presentation-schema.ts',
    ];
    const hits = execSync(
      "grep -rl 'plannedForServiceId' server --include='*.ts' | grep -v '__tests__' || true",
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !allowed.includes(file))
      .filter((file) => withoutComments(source(file)).includes('plannedForServiceId'));
    expect(hits, `unexpected readers of the staff draft column: ${hits.join(', ')}`).toEqual([]);
  });

  it('scopes both of the lineage readers by the viewer', () => {
    /*
      The rule the two helpers exist to hold. A reader that dropped its userId
      predicate would still compile, still return rows, and quietly turn a
      private draft into a roster of who has written what.
    */
    const util = source('server/utils/church-teaching-plan.ts');
    for (const helper of ['resolveViewerServiceNotes', 'resolveViewerPlannedNotes']) {
      const start = util.indexOf(`export async function ${helper}`);
      expect(start, `${helper} missing`).toBeGreaterThan(-1);
      const body = util.slice(start, util.indexOf('\nexport ', start + 1));
      expect(body, `${helper} is not viewer-scoped`).toContain('eq(Notes.userId, userId)');
    }
    // The write is scoped too: nothing may stamp somebody else's note.
    const link = util.slice(util.indexOf('export async function linkNoteToService'));
    expect(link).toContain('eq(Notes.userId, userId)');
  });

  it('leaves the lineage column with exactly one reader in the whole server', () => {
    /*
      The strongest form of "Review is never shared": grep the server. Every
      mention of the congregant's lineage column outside their own note routes
      and the viewer-scoped resolver is a new reader, and there must not be one.
    */
    const allowed = [
      'server/utils/church-teaching-plan.ts', // resolveViewerServiceNotes, viewer-scoped
      'server/db/schema.ts',
      'server/db/validate-schema.ts',
      'server/routes/notes.ts',
      'server/routes/sync.ts',
    ];
    const hits = execSync(
      "grep -rl 'startedFromServiceId' server --include='*.ts' | grep -v '__tests__' || true",
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => !allowed.includes(file))
      // A file that only *mentions* the column in prose is not a reader. Naming
      // the boundary in a comment is how the next author learns it exists.
      .filter((file) => withoutComments(source(file)).includes('startedFromServiceId'));
    expect(hits, `unexpected readers of the lineage column: ${hits.join(', ')}`).toEqual([]);
  });
});
