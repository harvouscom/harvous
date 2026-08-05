/**
 * The roles a church admin can assign, with the plain-language promise each one
 * makes. Mirrors `ASSIGNABLE_CHURCH_ROLES` server-side; the server remains the
 * authority — this exists so the picker can say what a role *does* rather than
 * showing a Clerk role string.
 *
 * Descriptions are derived from `capabilitiesForChurchRole`, so if that changes
 * these have to change with it.
 */
export type AssignableChurchRole = 'org:admin' | 'org:pastor' | 'org:teacher' | 'org:member';

export const ASSIGNABLE_CHURCH_ROLES: {
  role: AssignableChurchRole;
  label: string;
  description: string;
}[] = [
  { role: 'org:admin', label: 'Admin', description: 'The team, billing, and everything below' },
  { role: 'org:pastor', label: 'Pastor', description: 'Teaching plan and note templates' },
  { role: 'org:teacher', label: 'Teacher', description: 'Teaching plan and note templates' },
  { role: 'org:member', label: 'Staff', description: 'Publish to channels' },
];

/** Label for any role, including one a church defined outside this list. */
export function churchRoleLabel(role: string | null | undefined): string {
  return ASSIGNABLE_CHURCH_ROLES.find((r) => r.role === role)?.label ?? 'Staff';
}
