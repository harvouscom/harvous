/**
 * Which Supabase project a connection string points at, and whether that is the live one.
 *
 * This exists because environment selection in this repo is implicit: fourteen scripts read
 * `SUPABASE_DIRECT_URL` and act on whatever it names, and the only thing distinguishing dev
 * from production is which `.env` happens to be in the directory. One script says so outright
 * — "point `.env` at the target Supabase DB before running; there is no separate flag". That
 * works until a file is copied into a worktree, at which point a throwaway checkout is holding
 * live credentials and nothing on screen says so.
 *
 * The check is a comparison against a known project ref rather than a `HARVOUS_ENV` variable,
 * for one reason: a variable can be forgotten when a `.env` is copied, and its absence would
 * read as "not production" exactly when the copy *is* production. A ref travels inside the
 * connection string itself, so it cannot be separated from the thing it describes.
 *
 * The ref is not a credential. It appears in the Supabase dashboard URL and in CI logs, and it
 * opens nothing on its own.
 */

/** The live database. Everything else is, by definition, not it. */
export const PRODUCTION_SUPABASE_PROJECT_REF = 'mhriprqpyvhjgdssjlfl';

/**
 * Supabase hands out two connection-string shapes and the ref sits in a different place in
 * each. Direct puts it in the host (`db.<ref>.supabase.co`); the pooler puts it in the
 * username (`postgres.<ref>@aws-1-....pooler.supabase.com`), because one pooler host serves
 * every project in a region.
 */
export function supabaseProjectRefFromUrl(connectionString: string | undefined | null): string | null {
  if (!connectionString) return null;

  const direct = /@db\.([a-z0-9]{16,})\.supabase\.(?:co|com)/i.exec(connectionString);
  if (direct) return direct[1].toLowerCase();

  const pooler = /:\/\/[^:/@]*\.([a-z0-9]{16,})(?::[^@]*)?@[^/]*pooler\.supabase\./i.exec(connectionString);
  if (pooler) return pooler[1].toLowerCase();

  return null;
}

export type DbTargetVerdict =
  /** Positively identified as the live database. */
  | { kind: 'production'; projectRef: string }
  /** A ref was found and it is not production, so this provably is not the live database. */
  | { kind: 'other'; projectRef: string }
  /** No ref could be read, so production cannot be ruled out. */
  | { kind: 'unknown'; projectRef: null };

/**
 * Classify a connection string.
 *
 * `unknown` is deliberately not treated as safe. A string this cannot parse might still be
 * production — a proxy, a custom host, a future URL shape — and the whole point of the guard
 * is that the dangerous case must never be the silent default. `other`, by contrast, is
 * genuinely safe: a ref that was read and does not match cannot be the live project.
 */
export function classifyDbTarget(connectionString: string | undefined | null): DbTargetVerdict {
  const projectRef = supabaseProjectRefFromUrl(connectionString);
  if (!projectRef) return { kind: 'unknown', projectRef: null };
  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) return { kind: 'production', projectRef };
  return { kind: 'other', projectRef };
}

/** Whether a write to this target should be refused without an explicit acknowledgement. */
export function writeNeedsConfirmation(verdict: DbTargetVerdict): boolean {
  return verdict.kind !== 'other';
}

/** One line naming the target, printed before anything connects. */
export function describeDbTarget(verdict: DbTargetVerdict): string {
  switch (verdict.kind) {
    case 'production':
      return `PRODUCTION (project ${verdict.projectRef})`;
    case 'other':
      return `project ${verdict.projectRef} (not production)`;
    case 'unknown':
      return 'an unrecognized database (project ref could not be read)';
  }
}
