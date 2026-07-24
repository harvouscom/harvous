import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: {
      ...actual,
      spawn: spawnMock,
    },
    spawn: spawnMock,
  };
});

import { runSharedSpacesDbPush } from '../shared-spaces-db-push';

const stagingEnv = {
  SHARED_SPACES_MIGRATION_DATABASE_URL:
    'postgresql://postgres:very-secret@db.staging-ref.supabase.co:5432/postgres',
  SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'staging-ref',
  SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF: 'production-ref',
  SHARED_SPACES_MIGRATION_ENVIRONMENT: 'staging',
};

function closingChild(code: number): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  queueMicrotask(() => child.emit('close', code, null));
  return child;
}

describe('guarded Shared Spaces db push', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a redacted dry-run without spawning', async () => {
    await runSharedSpacesDbPush([], stagingEnv);

    expect(spawnMock).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('fingerprint=');
    expect(output).toContain('DRY RUN');
    expect(output).not.toContain('very-secret');
    expect(output).not.toContain(stagingEnv.SHARED_SPACES_MIGRATION_DATABASE_URL);
  });

  it('rejects a production target labeled staging before spawning', async () => {
    await expect(
      runSharedSpacesDbPush([], {
        ...stagingEnv,
        SHARED_SPACES_MIGRATION_DATABASE_URL:
          'postgresql://postgres:secret@db.production-ref.supabase.co:5432/postgres',
      }),
    ).rejects.toThrow('Refusing staging migration');

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('runs Drizzle then RLS with the validated direct URL', async () => {
    spawnMock
      .mockImplementationOnce(() => closingChild(0))
      .mockImplementationOnce(() => closingChild(0));

    await runSharedSpacesDbPush(['--apply'], stagingEnv);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0][1]).toEqual([
      '-r',
      'dotenv/config',
      'node_modules/.bin/drizzle-kit',
      'push',
      '--config',
      'drizzle.config.ts',
    ]);
    expect(spawnMock.mock.calls[1][1]).toEqual([
      'node_modules/.bin/tsx',
      'scripts/run-enable-rls.ts',
    ]);
    for (const call of spawnMock.mock.calls) {
      expect(call[2]).toMatchObject({
        shell: false,
        env: expect.objectContaining({
          SUPABASE_DIRECT_URL: stagingEnv.SHARED_SPACES_MIGRATION_DATABASE_URL,
          SUPABASE_DATABASE_URL: stagingEnv.SHARED_SPACES_MIGRATION_DATABASE_URL,
        }),
      });
    }
  });

  it('stops before RLS when Drizzle fails', async () => {
    spawnMock.mockImplementationOnce(() => closingChild(7));

    await expect(runSharedSpacesDbPush(['--apply'], stagingEnv)).rejects.toThrow(
      'drizzle push failed with exit code 7',
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('propagates an RLS failure', async () => {
    spawnMock
      .mockImplementationOnce(() => closingChild(0))
      .mockImplementationOnce(() => closingChild(9));

    await expect(runSharedSpacesDbPush(['--apply'], stagingEnv)).rejects.toThrow(
      'RLS failed with exit code 9',
    );
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
