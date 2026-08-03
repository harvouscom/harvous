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
] as const;

export type ChurchCapability = (typeof CHURCH_CAPABILITIES)[number];

/** Clerk built-in admin role — the only role that may change the roster. */
export const ROLE_ADMIN = 'org:admin';
/** Custom roles a church can define in Clerk to unlock teaching tooling. */
export const ROLE_PASTOR = 'org:pastor';
export const ROLE_TEACHER = 'org:teacher';

/**
 * Capabilities for a staff member's Clerk org role.
 *
 * Every staff member can publish — that is what being staff means here. Admin
 * adds the roster and the money. Pastor/teacher add the teaching tooling, and
 * admin gets it too so a one-person church is not locked out of its own
 * sermon template.
 */
export function capabilitiesForChurchRole(role: string | null | undefined): ChurchCapability[] {
  const capabilities = new Set<ChurchCapability>(['publish']);

  if (role === ROLE_ADMIN) {
    capabilities.add('manage_staff');
    capabilities.add('manage_billing');
  }
  if (role === ROLE_ADMIN || role === ROLE_PASTOR || role === ROLE_TEACHER) {
    capabilities.add('manage_templates');
    capabilities.add('sermon_tools');
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
