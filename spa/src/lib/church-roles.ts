/**
 * The roles a church admin can assign, with the plain-language promise each one
 * makes. Mirrors `ASSIGNABLE_CHURCH_ROLES` server-side; the server remains the
 * authority — this exists so the picker can say what a role *does* rather than
 * showing a Clerk role string.
 *
 * Descriptions are derived from `capabilitiesForChurchRole`, so if that changes
 * these have to change with it. Two pairs are worth watching: Pastor and Teacher
 * differ by `manage_teaching_plan` and `manage_templates`, and Pastor and
 * Coordinator differ by `manage_church_settings` alone. Their lines here are the
 * only place a person is told which.
 *
 * Role is carried by silhouette, never by colour — see ChurchDesignScenePreview.
 *
 * Every icon carries a figure, and they differ by what that figure is doing:
 * Staff is a badge — on the team, nothing more specific claimed; Teacher stands
 * at a board, which is the act rather than the rank; Pastor is bent over the
 * open book they teach from; Coordinator holds the pen, because theirs is the
 * hand that writes the plan down rather than decides it; Admin carries the
 * shield, because theirs is the one row in a roster you want to spot at a glance
 * as holding the keys. One family, so the difference reads as degree rather than
 * as five unrelated kinds of thing.
 *
 * `churchRoleIcon`'s fallback stays `user` — a role the church invented outside
 * this list has no claim to any of these five, and the plainest figure is the
 * honest answer.
 */
import type { IconName } from '@/components/react/Icon';

export type AssignableChurchRole =
  | 'org:admin'
  | 'org:pastor'
  | 'org:coordinator'
  | 'org:teacher'
  | 'org:member';

export const ASSIGNABLE_CHURCH_ROLES: {
  role: AssignableChurchRole;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    role: 'org:admin',
    label: 'Admin',
    icon: 'user-shield',
    description: 'The team, billing, and everything below',
  },
  {
    role: 'org:pastor',
    label: 'Pastor',
    icon: 'book-open-reader',
    description: 'Sets the teaching plan and note templates',
  },
  {
    role: 'org:coordinator',
    label: 'Coordinator',
    icon: 'user-pen',
    // The one capability that separates this from Pastor, said as a job rather
    // than as a permission: the coordinator keeps the calendar the sermons are
    // scheduled into, which is why they also hold the church's service times.
    description: 'Organizes the plan and the service times',
  },
  {
    role: 'org:teacher',
    label: 'Teacher',
    icon: 'chalkboard-user',
    description: 'Sees the teaching plan, publishes',
  },
  { role: 'org:member', label: 'Staff', icon: 'id-badge', description: 'Publish to channels' },
];

/** Label for any role, including one a church defined outside this list. */
export function churchRoleLabel(role: string | null | undefined): string {
  return ASSIGNABLE_CHURCH_ROLES.find((r) => r.role === role)?.label ?? 'Staff';
}

/** Icon for any role, including one a church defined outside this list. */
export function churchRoleIcon(role: string | null | undefined): IconName {
  return ASSIGNABLE_CHURCH_ROLES.find((r) => r.role === role)?.icon ?? 'user';
}
