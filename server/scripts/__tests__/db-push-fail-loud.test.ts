import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { FAIL_LOUD_PRELOAD, drizzlePushArgs } from '../db-push-guarded';

/** Run a snippet the way drizzle-kit is run: a fresh node with the preload in front of it. */
function run(code: string) {
  const result = spawnSync(process.execPath, ['-r', FAIL_LOUD_PRELOAD, '-e', code], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

describe('db-push fail-loud preload', () => {
  it("fails the run on drizzle-kit's swallowed statement error", () => {
    // The exact shape of pgPush's catch and the push command's explicit exit(0).
    const { status, stderr } = run(`
      try { throw new Error('column "parentNoteId" contains null values'); }
      catch (e4) { console.error(e4); }
      process.exit(0);
    `);
    expect(status).toBe(1);
    expect(stderr).toContain('contains null values');
    expect(stderr).toContain('failing the run');
  });

  it('counts a driver error that is a plain object shaped like one', () => {
    const { status } = run(`
      console.error({ message: 'null value violates not-null constraint', code: '23502' });
      process.exit(0);
    `);
    expect(status).toBe(1);
  });

  it('fails even when nothing calls process.exit', () => {
    expect(run(`console.error(new Error('boom'));`).status).toBe(1);
  });

  it('leaves a clean push at 0', () => {
    expect(run(`console.log('[i] No changes detected'); process.exit(0);`).status).toBe(0);
    expect(run(`console.log('[✓] Changes applied');`).status).toBe(0);
  });

  it('leaves an aborted prompt at 0 — declining is not a failure', () => {
    expect(run(`console.log('[x] All changes were aborted'); process.exit(0);`).status).toBe(0);
  });

  it("does not treat drizzle-kit's own string messages as errors", () => {
    expect(run(`console.error('Warning: something to note'); process.exit(0);`).status).toBe(0);
  });

  it('keeps a failure drizzle-kit already reports as a failure', () => {
    expect(run(`console.log('Please install pg'); process.exit(1);`).status).toBe(1);
  });
});

describe('drizzlePushArgs', () => {
  it('loads the preload before drizzle-kit, after dotenv', () => {
    const args = drizzlePushArgs('bin.cjs', ['--verbose']);
    expect(args).toEqual([
      '-r',
      'dotenv/config',
      '-r',
      FAIL_LOUD_PRELOAD,
      'bin.cjs',
      'push',
      '--config',
      'drizzle.config.ts',
      '--verbose',
    ]);
    expect(FAIL_LOUD_PRELOAD).toMatch(/db-push-fail-loud\.cjs$/);
  });
});
