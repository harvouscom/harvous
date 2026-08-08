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
 * The church administrator of teaching — the admin assistant, the worship or
 * communications coordinator, the person who actually moves eleven sermons
 * around a quarter.
 *
 * Holds everything a pastor holds, **plus `manage_church_settings`**, and that
 * one difference is the whole role rather than an accident of drafting. A pastor
 * is deliberately denied the church's clock because "setting the church's clock
 * is administration, not teaching" — and administration of teaching is precisely
 * this job. Someone who schedules sermons into service slots but cannot add the
 * Christmas Eve 17:00 they are scheduling into is holding half a role.
 *
 * It is not a rank above pastor. It is the other half: a pastor decides what the
 * church teaches, a coordinator maintains the machinery it is taught through.
 * Neither one gets the roster or the money.
 *
 * Requires an `org:coordinator` custom role in the Clerk dashboard before it can
 * be assigned. Until that exists, Clerk simply never reports the string and the
 * unknown-role fallback below keeps everyone publishing.
 */
export const ROLE_COORDINATOR = 'org:coordinator';

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
  ROLE_COORDINATOR,
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
 * adds the roster, the money, and the church's own settings. Pastor, coordinator,
 * and teacher all get the sermon surfaces; pastor and coordinator reshape what
 * the church teaches, and the coordinator additionally keeps the church's clock.
 * Admin gets the teaching tooling too, so a one-person church is not locked out
 * of its own sermon template.
 */
export function capabilitiesForChurchRole(role: string | null | undefined): ChurchCapability[] {
  const capabilities = new Set<ChurchCapability>(['publish']);

  if (role === ROLE_ADMIN) {
    capabilities.add('manage_staff');
    capabilities.add('manage_billing');
  }
  /* The church's clock — timezone, default meeting day, service times.
     Administration rather than teaching, which is why a pastor does not get it;
     a coordinator does, because administering the teaching calendar is the
     whole of that job and the slots are what a sermon is scheduled into. */
  if (role === ROLE_ADMIN || role === ROLE_COORDINATOR) {
    capabilities.add('manage_church_settings');
  }
  // Everyone who teaches gets the sermon surfaces, including *reading* the
  // church's plan — that is the thing they teach from.
  if (
    role === ROLE_ADMIN ||
    role === ROLE_PASTOR ||
    role === ROLE_COORDINATOR ||
    role === ROLE_TEACHER
  ) {
    capabilities.add('sermon_tools');
  }
  // Deciding what the whole church teaches, and what it writes from, is a
  // pastor/admin act — and a coordinator's, since organizing the plan without
  // being able to change it is not a role. A teacher reads the plan and uses
  // the starters; they don't set them.
  if (role === ROLE_ADMIN || role === ROLE_PASTOR || role === ROLE_COORDINATOR) {
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
