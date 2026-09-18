import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideImportSpaceTarget } from '../import-space-target';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('decideImportSpaceTarget', () => {
  it('lets a channel’s leader import straight into it', () => {
    expect(decideImportSpaceTarget({ space: { type: 'public' }, role: 'leader', isBackupRestore: false })).toEqual({ ok: true });
  });

  it('lets any member import into a Shared Space', () => {
    expect(decideImportSpaceTarget({ space: { type: 'shared' }, role: 'member', isBackupRestore: false })).toEqual({ ok: true });
  });

  it('refuses a channel follower', () => {
    expect(decideImportSpaceTarget({ space: { type: 'public' }, role: 'member', isBackupRestore: false })).toMatchObject({
      status: 403,
    });
  });

  it('keeps a backup restore in Home', () => {
    expect(decideImportSpaceTarget({ space: { type: 'shared' }, role: 'owner', isBackupRestore: true })).toMatchObject({
      code: 'BACKUP_NEEDS_HOME',
    });
  });

  it('refuses a personal space as a "target"', () => {
    expect(decideImportSpaceTarget({ space: { type: 'personal' }, role: 'owner', isBackupRestore: false })).toMatchObject({
      status: 400,
    });
  });
});

describe('commit route', () => {
  it('gates the target before writing anything, and adds room rows after', () => {
    const route = source('server/routes/user.ts');
    const commit = route.slice(route.indexOf("'/api/user/import/session/:id/commit'"), route.indexOf("'/api/user/import/session/:id/enrich'"));
    expect(commit.indexOf('decideImportSpaceTarget')).toBeGreaterThan(-1);
    expect(commit.indexOf('decideImportSpaceTarget')).toBeLessThan(commit.indexOf('commitImportItem('));
    expect(commit.indexOf('addImportedNotesToSpace')).toBeGreaterThan(commit.indexOf('commitImportItem('));
  });
});
