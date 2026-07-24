import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createHash } from 'node:crypto';
import * as schema from '../db/schema';

export const SHARED_SPACES_PRODUCTION_ACK =
  'I_ACKNOWLEDGE_SHARED_SPACES_PRODUCTION_MIGRATION';

export type SharedSpacesMigrationIdentity = {
  databaseUrl: string;
  environment: 'staging' | 'production';
  projectRef: string;
  fingerprint: string;
  host: string;
  port: string;
  database: string;
};

export function loadSharedSpacesMigrationIdentity(
  env: NodeJS.ProcessEnv,
): SharedSpacesMigrationIdentity {
  const databaseUrl = env.SHARED_SPACES_MIGRATION_DATABASE_URL?.trim();
  const expectedProjectRef =
    env.SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF?.trim().toLowerCase();
  const productionProjectRef =
    env.SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
  const environment = env.SHARED_SPACES_MIGRATION_ENVIRONMENT?.trim();
  if (!databaseUrl) throw new Error('SHARED_SPACES_MIGRATION_DATABASE_URL is required');
  if (!expectedProjectRef) {
    throw new Error('SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF is required');
  }
  if (!productionProjectRef) {
    throw new Error('SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF is required');
  }
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('SHARED_SPACES_MIGRATION_ENVIRONMENT must be staging or production');
  }
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Migration target must be a Postgres URL');
  }
  const port = url.port || '5432';
  if (port !== '5432' || /pooler/i.test(url.hostname)) {
    throw new Error('Use the direct migration database URL on port 5432, not the pooler');
  }
  const projectRef = /^db\.([^.]+)\.supabase\.co$/i.exec(url.hostname)?.[1]?.toLowerCase();
  if (!projectRef) {
    throw new Error('Could not parse Supabase project ref from direct database hostname');
  }
  if (environment === 'staging' && projectRef === productionProjectRef) {
    throw new Error(
      'Refusing staging migration: actual target project ref matches SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF',
    );
  }
  if (environment === 'staging' && expectedProjectRef === productionProjectRef) {
    throw new Error(
      'Staging requires SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF to differ from SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF',
    );
  }
  if (environment === 'production' && projectRef !== productionProjectRef) {
    throw new Error(
      'Refusing production migration: actual target project ref does not match SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF',
    );
  }
  if (environment === 'production' && expectedProjectRef !== productionProjectRef) {
    throw new Error(
      'Production requires SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF to equal SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF',
    );
  }
  if (projectRef !== expectedProjectRef) {
    throw new Error(
      `Migration project ref mismatch: parsed=${projectRef} expected=${expectedProjectRef}`,
    );
  }
  if (
    environment === 'production' &&
    env.SHARED_SPACES_MIGRATION_PRODUCTION_ACK !== SHARED_SPACES_PRODUCTION_ACK
  ) {
    throw new Error(
      `Production requires SHARED_SPACES_MIGRATION_PRODUCTION_ACK=${SHARED_SPACES_PRODUCTION_ACK}`,
    );
  }
  const database = url.pathname.replace(/^\/+/, '') || 'postgres';
  const fingerprint = createHash('sha256')
    .update(`${environment}|${url.hostname}|${port}|${database}|${projectRef}`)
    .digest('hex')
    .slice(0, 16);
  return {
    databaseUrl,
    environment,
    projectRef,
    fingerprint,
    host: url.hostname,
    port,
    database,
  };
}

export function logSharedSpacesMigrationIdentity(
  identity: SharedSpacesMigrationIdentity,
): void {
  console.log(
    `[shared-spaces:migration-target] environment=${identity.environment} projectRef=${identity.projectRef} host=${identity.host} port=${identity.port} database=${identity.database} fingerprint=${identity.fingerprint}`,
  );
}

export function createSharedSpacesMigrationDatabase(
  identity: SharedSpacesMigrationIdentity,
) {
  const client = postgres(identity.databaseUrl, { max: 1 });
  return {
    client,
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
