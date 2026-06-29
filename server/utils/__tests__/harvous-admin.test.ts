import { describe, expect, it } from 'vitest';
import { parseHarvousAdminEmails, parseHarvousAdminUserIds } from '../harvous-admin';

describe('parseHarvousAdminEmails', () => {
  it('normalizes and dedupes comma-separated emails', () => {
    expect([...parseHarvousAdminEmails(' DerekJ@hey.com, derekj@hey.com ')]).toEqual(['derekj@hey.com']);
  });
});

describe('parseHarvousAdminUserIds', () => {
  it('includes the system user id automatically', () => {
    expect([...parseHarvousAdminUserIds('user_a', 'user_system')]).toEqual(['user_a', 'user_system']);
  });
});
