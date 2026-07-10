import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const E2E_DISPOSABLE_DB_MARKER = 'HARVOUS_E2E_DISPOSABLE_DB';
export const E2E_DISPOSABLE_DB_MARKER_VALUE =
  'HARVOUS_SHARED_SPACES_E2E_DISPOSABLE_V1';
export const E2E_DATABASE_URL_ENV = 'E2E_SUPABASE_DATABASE_URL';
export const E2E_EXPECTED_PROJECT_REF_ENV =
  'HARVOUS_E2E_EXPECTED_PROJECT_REF';
export const E2E_PRODUCTION_PROJECT_REF_ENV =
  'HARVOUS_E2E_PRODUCTION_PROJECT_REF';
export const E2E_EXPECTED_DB_ROLE_ENV =
  'HARVOUS_E2E_EXPECTED_DB_ROLE';
export const E2E_RUN_ID_ENV = 'HARVOUS_E2E_RUN_ID';
export const SHARED_SPACES_RELEASE_GATE_ENV =
  'HARVOUS_SHARED_SPACES_RELEASE_GATE';

export type SafeE2EConfig = {
  databaseUrl: string;
  projectRef: string;
  productionProjectRef: string;
  expectedDatabaseRole: string;
  runId: string;
  runNamespace: string;
};

export type DisposableDatabaseIdentity = {
  databaseName: string;
  currentUser: string;
  databaseComment: string | null;
  projectRef?: string;
};

export type DisposableDatabaseIdentityQuery = () => Promise<DisposableDatabaseIdentity>;

export type E2ERunRegistry = {
  runNamespace: string;
  spaces: string[];
  notes: string[];
  threads: string[];
  studyThreadEntries: string[];
};

const REQUIRED_SHARED_SPACES_ENV = [
  'TEST_USER_A_EMAIL',
  'TEST_USER_B_EMAIL',
  'TEST_USER_A_CLERK_ID',
  'TEST_USER_B_CLERK_ID',
  'CLERK_SECRET_KEY',
  'PUBLIC_CLERK_PUBLISHABLE_KEY',
  E2E_DISPOSABLE_DB_MARKER,
  E2E_DATABASE_URL_ENV,
  E2E_EXPECTED_PROJECT_REF_ENV,
  E2E_PRODUCTION_PROJECT_REF_ENV,
  E2E_EXPECTED_DB_ROLE_ENV,
  E2E_RUN_ID_ENV,
] as const;

const COMMON_OWNER_ROLES = new Set([
  'postgres',
  'supabase_admin',
  'supabase_pooler_user',
  'postgres_pooler',
  'service_role',
]);

function parsePostgresUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid Postgres URL`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${label} must be a postgres:// or postgresql:// URL`);
  }
  return url;
}

function normalizedDatabaseTarget(value: string): string {
  const url = parsePostgresUrl(value, E2E_DATABASE_URL_ENV);
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

/**
 * Supabase direct URLs use db.<ref>.supabase.co; transaction/session poolers
 * encode the ref in the username as postgres.<ref>.
 */
export function supabaseProjectRefFromDatabaseUrl(value: string): string {
  const url = parsePostgresUrl(value, E2E_DATABASE_URL_ENV);
  const host = url.hostname.toLowerCase();
  const username = decodeURIComponent(url.username).toLowerCase();
  const candidates = new Set<string>();

  const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct?.[1]) candidates.add(direct[1]);

  const projectHost = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (projectHost?.[1] && projectHost[1] !== 'db') {
    candidates.add(projectHost[1]);
  }

  const poolerUser = username.match(/^[a-z0-9_]+\.([a-z0-9]+)$/);
  if (poolerUser?.[1] && /\.pooler\.supabase\.com$/.test(host)) {
    candidates.add(poolerUser[1]);
  }

  if (candidates.size !== 1) {
    throw new Error(
      `Refusing destructive E2E setup: could not unambiguously parse a Supabase project ref from ${E2E_DATABASE_URL_ENV}`,
    );
  }
  return [...candidates][0];
}

export function missingSharedSpacesE2EPrerequisites(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_SHARED_SPACES_ENV.filter((key) => !env[key]?.trim());
}

export function readSafeE2EConfig(
  env: NodeJS.ProcessEnv = process.env,
): SafeE2EConfig {
  const missing = missingSharedSpacesE2EPrerequisites(env);
  if (missing.length > 0) {
    throw new Error(
      `Shared Spaces E2E preflight failed; missing: ${missing.join(', ')}`,
    );
  }

  if (
    env[E2E_DISPOSABLE_DB_MARKER] !== E2E_DISPOSABLE_DB_MARKER_VALUE
  ) {
    throw new Error(
      `Refusing destructive E2E setup: ${E2E_DISPOSABLE_DB_MARKER} must exactly equal ${E2E_DISPOSABLE_DB_MARKER_VALUE}`,
    );
  }
  if (
    env.TEST_USER_A_CLERK_ID!.trim() === env.TEST_USER_B_CLERK_ID!.trim() ||
    env.TEST_USER_A_EMAIL!.trim().toLowerCase() ===
      env.TEST_USER_B_EMAIL!.trim().toLowerCase()
  ) {
    throw new Error(
      'Shared Spaces E2E preflight failed: owner and member Clerk users must be distinct',
    );
  }
  if (!env.CLERK_SECRET_KEY!.startsWith('sk_test_')) {
    throw new Error(
      'Shared Spaces E2E preflight failed: CLERK_SECRET_KEY must use a Clerk test instance (sk_test_)',
    );
  }
  if (!env.PUBLIC_CLERK_PUBLISHABLE_KEY!.startsWith('pk_test_')) {
    throw new Error(
      'Shared Spaces E2E preflight failed: PUBLIC_CLERK_PUBLISHABLE_KEY must use a Clerk test instance (pk_test_)',
    );
  }

  const databaseUrl = env[E2E_DATABASE_URL_ENV]!.trim();
  const expectedProjectRef = env[E2E_EXPECTED_PROJECT_REF_ENV]!
    .trim()
    .toLowerCase();
  const actualProjectRef = supabaseProjectRefFromDatabaseUrl(databaseUrl);
  if (actualProjectRef !== expectedProjectRef) {
    throw new Error(
      `Refusing destructive E2E setup: database project ref ${actualProjectRef} does not match ${E2E_EXPECTED_PROJECT_REF_ENV}=${expectedProjectRef}`,
    );
  }
  const productionProjectRef = env[E2E_PRODUCTION_PROJECT_REF_ENV]!
    .trim()
    .toLowerCase();
  if (
    actualProjectRef === productionProjectRef ||
    expectedProjectRef === productionProjectRef
  ) {
    throw new Error(
      `Refusing destructive E2E setup: disposable project ref matches ${E2E_PRODUCTION_PROJECT_REF_ENV}`,
    );
  }
  const expectedDatabaseRole = env[E2E_EXPECTED_DB_ROLE_ENV]!.trim();
  if (isCommonOwnerRole(expectedDatabaseRole)) {
    throw new Error(
      `Refusing destructive E2E setup: ${E2E_EXPECTED_DB_ROLE_ENV} must name a dedicated least-privilege role, not ${expectedDatabaseRole}`,
    );
  }

  const productionUrl = env.PRODUCTION_SUPABASE_DATABASE_URL?.trim();
  if (
    productionUrl &&
    normalizedDatabaseTarget(productionUrl) ===
      normalizedDatabaseTarget(databaseUrl)
  ) {
    throw new Error(
      `Refusing destructive E2E setup: ${E2E_DATABASE_URL_ENV} matches PRODUCTION_SUPABASE_DATABASE_URL`,
    );
  }

  const runId = env[E2E_RUN_ID_ENV]!.trim();
  const readablePrefix = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  if (!readablePrefix) {
    throw new Error(
      `${E2E_RUN_ID_ENV} must contain at least one letter or number`,
    );
  }
  const hash = createHash('sha256').update(runId).digest('hex').slice(0, 16);
  const runNamespace = `${readablePrefix}-${hash}`;

  return {
    databaseUrl,
    projectRef: actualProjectRef,
    productionProjectRef,
    expectedDatabaseRole,
    runId,
    runNamespace,
  };
}

export function isCommonOwnerRole(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return (
    COMMON_OWNER_ROLES.has(normalized) ||
    normalized.startsWith('postgres.') ||
    normalized.endsWith('_owner')
  );
}

export async function assertDisposableDatabaseIdentity(
  config: SafeE2EConfig,
  queryIdentity: DisposableDatabaseIdentityQuery,
): Promise<DisposableDatabaseIdentity> {
  const identity = await queryIdentity();
  if (!identity.databaseName?.trim()) {
    throw new Error(
      'Refusing destructive E2E setup: database identity query returned no current_database()',
    );
  }
  if (identity.databaseComment !== E2E_DISPOSABLE_DB_MARKER_VALUE) {
    throw new Error(
      `Refusing destructive E2E setup: database comment must exactly equal ${E2E_DISPOSABLE_DB_MARKER_VALUE}`,
    );
  }
  if (
    isCommonOwnerRole(identity.currentUser) ||
    identity.currentUser !== config.expectedDatabaseRole
  ) {
    throw new Error(
      `Refusing destructive E2E setup: current_user must exactly equal dedicated role ${config.expectedDatabaseRole}`,
    );
  }
  if (identity.projectRef && identity.projectRef !== config.projectRef) {
    throw new Error(
      `Refusing destructive E2E setup: connected project ref ${identity.projectRef} does not match ${config.projectRef}`,
    );
  }
  return identity;
}

export async function runWithVerifiedDisposableDatabase<T>(
  config: SafeE2EConfig,
  queryIdentity: DisposableDatabaseIdentityQuery,
  destructiveCallback: () => Promise<T>,
): Promise<T> {
  await assertDisposableDatabaseIdentity(config, queryIdentity);
  return destructiveCallback();
}

export function e2eFixtureIds(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
) {
  return {
    spaceId: `space_e2e_${config.runNamespace}`,
    inviteId: `sinv_e2e_${config.runNamespace}`,
    membershipId: `smem_e2e_${config.runNamespace}_owner`,
    inviteToken: `e2e-${config.runNamespace}`,
    spaceTitle: `E2E Shared ${config.runNamespace}`,
  };
}

export function e2eRunRegistryPath(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
): string {
  return resolve(
    process.cwd(),
    'test-results',
    `shared-spaces-e2e-${config.runNamespace}.json`,
  );
}

function emptyRegistry(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
): E2ERunRegistry {
  return {
    runNamespace: config.runNamespace,
    spaces: [],
    notes: [],
    threads: [],
    studyThreadEntries: [],
  };
}

export function readE2ERunRegistry(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
): E2ERunRegistry {
  const path = e2eRunRegistryPath(config);
  if (!existsSync(path)) return emptyRegistry(config);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as E2ERunRegistry;
  if (parsed.runNamespace !== config.runNamespace) {
    throw new Error('E2E run registry namespace mismatch');
  }
  return parsed;
}

function writeE2ERunRegistry(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
  registry: E2ERunRegistry,
): void {
  const path = e2eRunRegistryPath(config);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

export function resetE2ERunRegistry(
  config: Pick<SafeE2EConfig, 'runNamespace'>,
  initial: Partial<Omit<E2ERunRegistry, 'runNamespace'>> = {},
): void {
  writeE2ERunRegistry(config, {
    ...emptyRegistry(config),
    ...initial,
    runNamespace: config.runNamespace,
  });
}

export function registerE2ERunResources(
  resources: Partial<Omit<E2ERunRegistry, 'runNamespace'>>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const config = readSafeE2EConfig(env);
  const registry = readE2ERunRegistry(config);
  for (const key of [
    'spaces',
    'notes',
    'threads',
    'studyThreadEntries',
  ] as const) {
    registry[key] = [
      ...new Set([...registry[key], ...(resources[key] ?? [])].filter(Boolean)),
    ];
  }
  writeE2ERunRegistry(config, registry);
}
