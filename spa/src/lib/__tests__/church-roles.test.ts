import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_CHURCH_ROLES,
  churchRoleIcon,
  churchRoleLabel,
} from '../church-roles';

describe('church role catalogue', () => {
  it('gives each role its own icon and its own promise', () => {
    // The whole reason this catalogue gained an icon: Pastor and Teacher used
    // to share a description *and* a silhouette, so the picker showed two rows
    // making the same offer. Two roles that read identically are the bug.
    const icons = ASSIGNABLE_CHURCH_ROLES.map((r) => r.icon);
    const descriptions = ASSIGNABLE_CHURCH_ROLES.map((r) => r.description);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('falls back for a role a church defined outside the list', () => {
    // Unknown roles degrade to plain staff server-side; the picker has to say
    // something rather than render an empty row.
    expect(churchRoleLabel('org:worship_leader')).toBe('Staff');
    expect(churchRoleIcon('org:worship_leader')).toBe('user');
    expect(churchRoleIcon(null)).toBe('user');
  });
});
