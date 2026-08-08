import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capabilitiesForChurchRole,
  CHURCH_CAPABILITIES,
  hasChurchCapability,
  NO_CHURCH_CAPABILITIES,
  ROLE_ADMIN,
  ROLE_COORDINATOR,
  ROLE_PASTOR,
  ROLE_TEACHER,
} from '../church-role-capabilities';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('church role capabilities', () => {
  it('gives an admin the roster, the money, and the church settings', () => {
    const caps = capabilitiesForChurchRole(ROLE_ADMIN);
    expect(caps).toContain('manage_staff');
    expect(caps).toContain('manage_billing');
    expect(caps).toContain('manage_church_settings');
    expect(caps).toContain('publish');
  });

  it('gives a pastor the teaching tooling but not the roster', () => {
    const caps = capabilitiesForChurchRole(ROLE_PASTOR);
    expect(caps).toContain('sermon_tools');
    expect(caps).toContain('manage_teaching_plan');
    expect(caps).toContain('manage_templates');
    expect(caps).toContain('publish');
    expect(caps).not.toContain('manage_staff');
    expect(caps).not.toContain('manage_billing');
    // Setting the church's clock is administration, not teaching.
    expect(caps).not.toContain('manage_church_settings');
  });

  it('gives a teacher the sermon surfaces only — teaching from the plan is not setting it', () => {
    const caps = capabilitiesForChurchRole(ROLE_TEACHER);
    expect(caps).toContain('sermon_tools');
    expect(caps).toContain('publish');
    // The distinction the two roles exist for: a teacher neither reshapes the
    // plan nor provisions what the whole church writes from.
    expect(caps).not.toContain('manage_teaching_plan');
    expect(caps).not.toContain('manage_templates');
    expect(caps).not.toContain('manage_staff');
    expect(caps).not.toContain('manage_billing');
    expect(caps).not.toContain('manage_church_settings');
  });

  it('gives a coordinator the teaching tooling and the clock, but not the roster', () => {
    const caps = capabilitiesForChurchRole(ROLE_COORDINATOR);
    expect(caps).toContain('sermon_tools');
    expect(caps).toContain('manage_teaching_plan');
    expect(caps).toContain('manage_templates');
    expect(caps).toContain('manage_library');
    expect(caps).toContain('publish');
    // The point of the role: scheduling sermons into slots is useless without
    // the ability to add the slot you are scheduling into.
    expect(caps).toContain('manage_church_settings');
    // It is administration *of teaching*, never of the church itself.
    expect(caps).not.toContain('manage_staff');
    expect(caps).not.toContain('manage_billing');
  });

  it('separates coordinator from pastor by exactly one capability', () => {
    /*
      If these two ever collapse to the same set, one of them has stopped
      earning its place in the picker. The difference is the church's clock, and
      it runs the direction it does on purpose: a pastor decides what the church
      teaches, a coordinator maintains the machinery it is taught through.
    */
    const pastor = new Set(capabilitiesForChurchRole(ROLE_PASTOR));
    const coordinator = capabilitiesForChurchRole(ROLE_COORDINATOR);
    expect(coordinator.filter((cap) => !pastor.has(cap))).toEqual(['manage_church_settings']);
    // And nothing a pastor holds is taken away.
    for (const cap of pastor) expect(coordinator).toContain(cap);
  });

  it('lets every teaching role see the plan', () => {
    // `sermon_tools` is the *read*. Narrowing it would take the plan away from
    // the teachers who teach out of it, which is the regression to guard.
    for (const role of [ROLE_ADMIN, ROLE_PASTOR, ROLE_COORDINATOR, ROLE_TEACHER]) {
      expect(capabilitiesForChurchRole(role)).toContain('sermon_tools');
    }
  });

  it('gives an admin the teaching tooling too — a one-person church still works', () => {
    expect(capabilitiesForChurchRole(ROLE_ADMIN)).toContain('sermon_tools');
    expect(capabilitiesForChurchRole(ROLE_ADMIN)).toContain('manage_teaching_plan');
    expect(capabilitiesForChurchRole(ROLE_ADMIN)).toContain('manage_templates');
  });

  it('degrades an unknown role to plain staff rather than to nothing', () => {
    // A church inventing its own role must not lose the ability to publish.
    const caps = capabilitiesForChurchRole('org:worship_leader');
    expect(caps).toEqual(['publish']);
  });

  it('gives a plain member publish only', () => {
    expect(capabilitiesForChurchRole('org:member')).toEqual(['publish']);
    expect(capabilitiesForChurchRole(null)).toEqual(['publish']);
  });

  it('grants a non-staff viewer nothing at all', () => {
    expect(NO_CHURCH_CAPABILITIES).toEqual([]);
    expect(hasChurchCapability(NO_CHURCH_CAPABILITIES, 'publish')).toBe(false);
    expect(hasChurchCapability(null, 'sermon_tools')).toBe(false);
  });
});

describe('role payload is server-derived', () => {
  it('returns no capabilities to a non-staff viewer before any Clerk call', () => {
    const route = source('server/routes/user.ts');
    const handler = route.slice(route.indexOf("'/api/user/church-staff-status'"));
    expect(handler).toContain('NO_CHURCH_CAPABILITIES');
    // The early return for non-staff must precede the roster read.
    expect(handler.indexOf('NO_CHURCH_CAPABILITIES')).toBeLessThan(
      handler.indexOf('fetchClerkOrgMemberships'),
    );
  });

  it('degrades to plain staff when Clerk is unreachable, never to nothing', () => {
    const route = source('server/routes/user.ts');
    const handler = route.slice(route.indexOf("'/api/user/church-staff-status'"));
    // role stays null on failure, and capabilitiesForChurchRole(null) is publish-only.
    expect(handler).toContain('catch');
    expect(handler).toContain('capabilitiesForChurchRole(role)');
  });

  it('is never re-derived on the client', () => {
    const hook = source('spa/src/hooks/queries/useChurchStaffStatus.ts');
    // The client may read `role` for display, but capabilities must come
    // straight from the server payload.
    expect(hook).toContain('query.data?.capabilities');
    expect(hook).not.toContain('capabilitiesForChurchRole');
    expect(hook).not.toMatch(/role === 'org:pastor'/);
  });

  it('mirrors every server capability in the hand-written client union', () => {
    // The union in useChurchStaffStatus is maintained by hand. A capability the
    // server grants but the client can't name is one no surface can gate on.
    const hook = source('spa/src/hooks/queries/useChurchStaffStatus.ts');
    for (const capability of CHURCH_CAPABILITIES) {
      expect(hook, `${capability} missing from the client union`).toContain(`'${capability}'`);
    }
  });
});

describe('org-provisioned note templates', () => {
  const route = () => source('server/routes/note-templates.ts');

  it('lets any connected member use church templates', () => {
    const list = route().slice(
      route().indexOf("'/api/note-templates/list'"),
      route().indexOf("'/api/note-templates/create'"),
    );
    // Availability keys off connection, not staff — a congregant using the
    // sermon template is the point.
    expect(list).toContain('connectedOrgIdFor');
    expect(list).not.toContain('assertCanManageOrgTemplates(');
  });

  it('restricts writing them to staff with manage_templates', () => {
    expect(route()).toContain('assertCanManageOrgTemplates');
    expect(route()).toContain("includes('manage_templates')");
    expect(route()).toContain("code: 'CHURCH_TEMPLATE_FORBIDDEN'");
  });

  it('fails closed when Clerk is unreachable for a provisioning write', () => {
    // The gate returns a typed result rather than a boolean now, so "closed"
    // is `ok: false` — but the rule is unchanged: an outage denies.
    const gate = route().slice(
      route().indexOf('async function assertCanManageOrgTemplates'),
      route().indexOf('type StoredTemplateRow'),
    );
    const tail = gate.slice(gate.indexOf('} catch {'));
    expect(tail).toContain('ok: false');
    expect(tail).not.toContain('ok: true');
  });

  it('checks org ownership before the author fallback', () => {
    const manage = route().slice(route().indexOf('async function assertCanManageTemplate'));
    // Otherwise a departed author keeps permanent control of a church starter.
    expect(manage.indexOf('row.orgId')).toBeLessThan(manage.indexOf('row.userId !== userId'));
  });

  it('refuses a template scoped to both a space and an org', () => {
    expect(route()).toContain("code: 'INVALID_SCOPE'");
  });
});

describe('manage_library', () => {
  it('is a pastor/admin act, like the note starters it sits beside', () => {
    expect(capabilitiesForChurchRole(ROLE_ADMIN)).toContain('manage_library');
    expect(capabilitiesForChurchRole(ROLE_PASTOR)).toContain('manage_library');
  });

  it('is not given to a teacher or a plain staff member', () => {
    // A teacher browses and attaches; deciding what the church studies from is
    // a different job. Widening later is one line — narrowing after churches
    // have grown used to it is not.
    expect(capabilitiesForChurchRole(ROLE_TEACHER)).not.toContain('manage_library');
    expect(capabilitiesForChurchRole('org:member')).not.toContain('manage_library');
  });

  it('is never held by a non-staff congregant', () => {
    expect(NO_CHURCH_CAPABILITIES).not.toContain('manage_library');
  });

  it('stays in lockstep with the client union that renders from it', () => {
    // The union is duplicated in spa/src/hooks/queries/useChurchStaffStatus.ts
    // because the client cannot import server code. A capability added on one
    // side and not the other is a surface that silently never renders.
    const clientSource = readFileSync(
      resolve(process.cwd(), 'spa/src/hooks/queries/useChurchStaffStatus.ts'),
      'utf8',
    );
    for (const capability of CHURCH_CAPABILITIES) {
      expect(clientSource, `client union is missing '${capability}'`).toContain(`'${capability}'`);
    }
  });
});
