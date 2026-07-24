import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  readSafeE2EConfig,
  SHARED_SPACES_RELEASE_GATE_ENV,
} from './fixtures/e2e-db-safety';

export default function globalTeardown() {
  if (process.env[SHARED_SPACES_RELEASE_GATE_ENV] !== '1') return;

  const config = readSafeE2EConfig();
  execFileSync(
    process.execPath,
    [
      resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      'scripts/seed-e2e.ts',
      '--cleanup',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPABASE_DATABASE_URL: config.databaseUrl,
      },
    },
  );
}
