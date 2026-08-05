import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capabilitiesForChurchRole,
  hasChurchCapability,
  NO_CHURCH_CAPABILITIES,
  ROLE_ADMIN,
  ROLE_PASTOR,
  ROLE_TEACHER,
} from '../church-role-capabilities';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('church role capabilities', () => {
  it('gives an admin the roster and the money', () => {
    const caps = capabilitiesForChurchRole(ROLE_ADMIN);
    expect(caps).toContain('manage_staff');
    expect(caps).toContain('manage_billing');
    expect(caps).toContain('publish');
  });

  it('gives pastor and teacher the teaching tooling but not the roster', () => {
    for (const role of [ROLE_PASTOR, ROLE_TEACHER]) {
      const caps = capabilitiesForChurchRole(role);
      expect(caps).toContain('sermon_tools');
      expect(caps).toContain('manage_templates');
      expect(caps).toContain('publish');
      expect(caps).not.toContain('manage_staff');
      expect(caps).not.toContain('manage_billing');
    }
  });

  it('gives an admin the teaching tooling too — a one-person church still works', () => {
    expect(capabilitiesForChurchRole(ROLE_ADMIN)).toContain('sermon_tools');
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
