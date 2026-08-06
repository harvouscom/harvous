/**
 * Server-derived church role capabilities.
 *
 * The gating principle (locked with Derek, see docs/future/PASTOR_FEATURES_ROADMAP.md):
 * pastor/staff tooling is **never** general-app UI. It is unlocked by a Clerk
 * org custom role, and the *server* decides — clients render a role surface only
 * when this payload says so, never by inspecting a role string themselves.
 * Congregants (connectedOrgId only, never Clerk org members) receive nothing.
 *
 * Roles are Clerk org roles. `org:admin` and `org:member` are Clerk's built-ins;
 * anything else (`org:pastor`, `org:teacher`, …) is a custom role a church can
 * define. Unknown roles degrade to plain staff rather than failing closed to
 * nothing — a church inventing a role should not lose the ability to publish.
 */

export const CHURCH_CAPABILITIES = [
  /** Publish into ministry channels and church Shared Spaces. */
  'publish',
  /** Invite/remove staff, change the roster. */
  'manage_staff',
  /** Buy or manage the church plan. */
  'manage_billing',
  /** Author org-provisioned note templates (e.g. the sermon template). */
  'manage_templates',
  /** Sermon-prep surfaces — role-gated, never general-app UI. */
  'sermon_tools',
  /**
   * Reshape the teaching plan — add, edit, remove services. Narrower than
   * `sermon_tools` on purpose: a teacher teaches *from* the plan, a pastor
   * sets it.
   */
  'manage_teaching_plan',
  /**
   * Change the church's own configuration — timezone, default meeting day and
   * time. Deliberately not folded into `manage_billing`: capabilities are the
   * contract clients render surfaces from, and "billing" gating a timezone
   * picker would mislead every future reader while foreclosing the option of
   * giving a pastor the settings without giving them the money.
   */
  'manage_church_settings',
  /**
   * Curate the church's Resource Library — add, edit, scope, and archive its
   * items, and review what congregants suggest for it.
   *
   * Reading the library is not gated by this and never should be: any
   * connected congregant sees what their church has published to them, the
   * same bargain `manage_templates` strikes for note starters. This is only
   * the right to decide what is in it.
   *
   * A granted space leader holds no church capability at all (by hard rule in
   * church-space-leaders.ts) and reaches their own space's items through the
   * space lane's widened gate instead.
   */
  'manage_library',
] as const;

export type ChurchCapability = (typeof CHURCH_CAPABILITIES)[number];

/** Clerk built-in admin role — the only role that may change the roster. */
export const ROLE_ADMIN = 'org:admin';
/** Custom roles a church can define in Clerk to unlock teaching tooling. */
export const ROLE_PASTOR = 'org:pastor';
export const ROLE_TEACHER = 'org:teacher';

/**
 * Roles a church admin may assign from Harvous.
 *
 * An allowlist, not a passthrough: the role string goes straight to Clerk and
 * straight back out as capabilities, so accepting an arbitrary one would let a
 * caller invent a role Harvous has no gating for. `org:member` is the plain
 * staff role — everyone can publish, which is what being staff means here.
 */
export const ASSIGNABLE_CHURCH_ROLES = [
  ROLE_ADMIN,
  ROLE_PASTOR,
  ROLE_TEACHER,
  'org:member',
] as const;

export type AssignableChurchRole = (typeof ASSIGNABLE_CHURCH_ROLES)[number];

export function isAssignableChurchRole(role: string): role is AssignableChurchRole {
  return (ASSIGNABLE_CHURCH_ROLES as readonly string[]).includes(role);
}

/**
 * Capabilities for a staff member's Clerk org role.
 *
 * Every staff member can publish — that is what being staff means here. Admin
 * adds the roster, the money, and the church's own settings. Pastor and teacher
 * both get the sermon surfaces; only pastor reshapes what the church teaches.
 * Admin gets the teaching tooling too, so a one-person church is not locked out
 * of its own sermon template.
 */
export function capabilitiesForChurchRole(role: string | null | undefined): ChurchCapability[] {
  const capabilities = new Set<ChurchCapability>(['publish']);

  if (role === ROLE_ADMIN) {
    capabilities.add('manage_staff');
    capabilities.add('manage_billing');
    capabilities.add('manage_church_settings');
  }
  // Everyone who teaches gets the sermon surfaces, including *reading* the
  // church's plan — that is the thing they teach from.
  if (role === ROLE_ADMIN || role === ROLE_PASTOR || role === ROLE_TEACHER) {
    capabilities.add('sermon_tools');
  }
  // Deciding what the whole church teaches, and what it writes from, is a
  // pastor/admin act. A teacher reads the plan and uses the starters; they
  // don't set them.
  if (role === ROLE_ADMIN || role === ROLE_PASTOR) {
    capabilities.add('manage_templates');
    capabilities.add('manage_teaching_plan');
    /* Same reasoning as templates: what the church studies from is a
       pastor/admin decision. Widening to teachers later is one line. */
    capabilities.add('manage_library');
  }

  return [...capabilities];
}

/** Capabilities for someone who is not staff at all — deliberately none. */
export const NO_CHURCH_CAPABILITIES: ChurchCapability[] = [];

export function hasChurchCapability(
  capabilities: readonly string[] | null | undefined,
  capability: ChurchCapability,
): boolean {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}
