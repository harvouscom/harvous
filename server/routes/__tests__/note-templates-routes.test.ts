/**
 * Source-contract tests for org-scoped note templates ("church starters").
 *
 * Same style as church-services-routes.test.ts: these assert on the shape of the
 * route source rather than booting the app, because what matters is structural —
 * which gate runs before which write, and in what order. A behavioural test
 * exercises one path; these fail if anyone adds a second path that skips a gate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(process.cwd(), 'server/routes/note-templates.ts'), 'utf8');

/** The org-write gate, from its signature to the end of its body. */
const gateBody = () => {
  const text = source();
  const start = text.indexOf('async function assertCanManageOrgTemplates');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('\ntype StoredTemplateRow', start);
  return text.slice(start, end);
};

describe('org template write gate', () => {
  it('proves staff membership before revealing billing state', () => {
    // Deliberate order, shared with assertCanManageTeachingPlan: a signed-in
    // stranger must never learn whether a given church has lapsed.
    const body = gateBody();
    const staffAt = body.indexOf('isChurchStaffForOrg');
    const sponsoredAt = body.indexOf('churchIsSponsored');
    expect(staffAt).toBeGreaterThan(-1);
    expect(sponsoredAt).toBeGreaterThan(-1);
    expect(staffAt).toBeLessThan(sponsoredAt);
  });

  it('gates on sponsorship before role, so a lapsed church cannot write', () => {
    const body = gateBody();
    const sponsoredAt = body.indexOf('churchIsSponsored');
    const capabilityAt = body.indexOf('capabilitiesForChurchRole');
    expect(capabilityAt).toBeGreaterThan(-1);
    expect(sponsoredAt).toBeLessThan(capabilityAt);
  });

  it('answers 402 with the shared lapse code, not a bespoke one', () => {
    const body = gateBody();
    expect(body).toContain('status: 402');
    expect(body).toContain('CHURCH_LAPSED_CODE');
    expect(body).toContain('CHURCH_LAPSED_ERROR');
  });

  it('requires the manage_templates capability, not merely staff', () => {
    expect(gateBody()).toContain("includes('manage_templates')");
  });

  it('fails closed when Clerk cannot be reached', () => {
    // A Clerk outage must not let a plain staff member provision a church-wide
    // template. The catch has to deny, never fall through to allow.
    const body = gateBody();
    const catchAt = body.indexOf('} catch {');
    expect(catchAt).toBeGreaterThan(-1);
    const tail = body.slice(catchAt);
    expect(tail).toContain('ok: false');
    expect(tail).not.toContain('ok: true');
  });
});

describe('scope exclusivity', () => {
  it('rejects org + space together on create', () => {
    const text = source();
    const create = text.slice(
      text.indexOf("'/api/note-templates/create'"),
      text.indexOf('async function assertCanManageTemplate'),
    );
    expect(create).toContain('if (orgId && spaceId)');
    expect(create).toContain('INVALID_SCOPE');
  });

  it('rejects re-scoping a church starter into a space on update', () => {
    // Create enforced this from the start; update did not, which let a starter
    // end up carrying both scopes and appearing in two lists.
    const text = source();
    const update = text.slice(text.indexOf("'/api/note-templates/update'"));
    expect(update).toContain('nextSpaceId && existing.orgId');
    expect(update).toContain('INVALID_SCOPE');
  });
});

describe('write ordering', () => {
  it.each([
    ["'/api/note-templates/create'", /db\s*\n?\s*\.?insert\(NoteTemplates\)/],
    ["'/api/note-templates/update'", /db\s*\n?\s*\.?update\(NoteTemplates\)/],
    ["'/api/note-templates/delete'", /db\s*\n?\s*\.?delete\(NoteTemplates\)/],
  ])('%s gates before it writes', (route, write) => {
    const text = source();
    const start = text.indexOf(route);
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, start + 4000);
    const writeAt = body.search(write);
    expect(writeAt, `${route} performs no ${write}`).toBeGreaterThan(-1);
    const gateAt = Math.min(
      ...['assertCanManageOrgTemplates', 'assertCanManageTemplate']
        .map((name) => body.indexOf(name))
        .filter((i) => i > -1),
    );
    expect(gateAt, `${route} writes without a gate`).toBeLessThan(writeAt);
  });

  it('routes every org check through the one gate', () => {
    // A second, hand-rolled org check is how the sponsorship rule drifts.
    const text = source();
    const gateCalls = text.split('assertCanManageOrgTemplates(').length - 1;
    expect(gateCalls).toBeGreaterThanOrEqual(2);
    expect(text).not.toContain('canManageOrgTemplates(');
  });
});

describe('privacy', () => {
  it('never reads the note lineage column', () => {
    expect(source()).not.toContain('startedFromServiceId');
  });

  it('scopes the org list to the caller’s own connected church', () => {
    const text = source();
    const list = text.slice(
      text.indexOf("'/api/note-templates/list'"),
      text.indexOf("'/api/note-templates/create'"),
    );
    expect(list).toContain('connectedOrgIdFor(auth.userId)');
    expect(list).toContain('eq(NoteTemplates.orgId, orgId)');
    // No orgId parameter: the church always comes from the caller's own record.
    expect(list).not.toMatch(/c\.req\.query\(\s*'orgId'\s*\)/);
  });
});
