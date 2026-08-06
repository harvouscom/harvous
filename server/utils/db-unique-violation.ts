/**
 * Did this error come from a specific unique index?
 *
 * Needed because `String(error).includes('<index name>')` does not work against
 * a Drizzle error and never did: `DrizzleQueryError.toString()` renders
 * "Failed query: <the SQL>", and an INSERT's SQL never mentions the index it
 * violated. The constraint name lives on the wrapped driver error at
 * `error.cause`, as `constraint_name` (postgres.js) or `constraint` (pg).
 *
 * Walks the cause chain rather than checking one level, since a wrapper may sit
 * between, and guards against a cycle because an error that references itself
 * would otherwise hang the request.
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      constraint_name?: unknown;
      constraint?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.constraint_name === constraintName || candidate.constraint === constraintName) {
      return true;
    }
    if (typeof candidate.message === 'string' && candidate.message.includes(constraintName)) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}
