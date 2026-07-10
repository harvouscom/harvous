/**
 * Guarded final Shared Spaces schema reconciliation. Dry-run by default;
 * --apply validates the migration identity before spawning Drizzle and RLS.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  loadSharedSpacesMigrationIdentity,
  logSharedSpacesMigrationIdentity,
} from './shared-spaces-migration-target';

type MigrationCommand = {
  label: 'drizzle push' | 'RLS';
  executable: string;
  args: string[];
};

const DRIZZLE_PUSH_COMMAND: MigrationCommand = {
  label: 'drizzle push',
  executable: process.execPath,
  args: [
    '-r',
    'dotenv/config',
    'node_modules/.bin/drizzle-kit',
    'push',
    '--config',
    'drizzle.config.ts',
  ],
};

const RLS_COMMAND: MigrationCommand = {
  label: 'RLS',
  executable: process.execPath,
  args: ['node_modules/.bin/tsx', 'scripts/run-enable-rls.ts'],
};

function printableCommand(command: MigrationCommand): string {
  return [command.executable, ...command.args].join(' ');
}

function runCommand(command: MigrationCommand, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const options: SpawnOptions = {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: false,
    };
    const child: ChildProcess = spawn(command.executable, command.args, options);
    child.once('error', (error) => {
      reject(new Error(`${command.label} failed to start: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`;
      reject(new Error(`${command.label} failed with ${detail}`));
    });
  });
}

export async function runSharedSpacesDbPush(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const unsupportedArgs = args.filter((arg) => arg !== '--apply');
  if (unsupportedArgs.length > 0) {
    throw new Error(`Unsupported argument(s): ${unsupportedArgs.join(', ')}`);
  }

  const apply = args.includes('--apply');
  const identity = loadSharedSpacesMigrationIdentity(env);
  logSharedSpacesMigrationIdentity(identity);
  console.log(`[shared-spaces:db:push] command 1: ${printableCommand(DRIZZLE_PUSH_COMMAND)}`);
  console.log(`[shared-spaces:db:push] command 2: ${printableCommand(RLS_COMMAND)}`);

  if (!apply) {
    console.log('[shared-spaces:db:push] DRY RUN; no child process spawned');
    console.log('[shared-spaces:db:push] review, then re-run with --apply');
    return;
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    SUPABASE_DIRECT_URL: identity.databaseUrl,
    SUPABASE_DATABASE_URL: identity.databaseUrl,
  };
  await runCommand(DRIZZLE_PUSH_COMMAND, childEnv);
  await runCommand(RLS_COMMAND, childEnv);
  console.log('[shared-spaces:db:push] schema reconciliation and RLS completed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSharedSpacesDbPush(process.argv.slice(2), process.env).catch((error) => {
    console.error('[shared-spaces:db:push] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
