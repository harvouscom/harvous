/** True if a Drizzle/Postgres error is a unique-constraint violation (23505).
 *  Drizzle wraps driver errors in DrizzleQueryError with the real error on `.cause`. */
export function isUniqueViolationError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  if (!e) return false;
  const code = e.code ?? e.cause?.code;
  if (code === '23505') return true;
  const message = `${e.message ?? ''} ${e.cause?.message ?? ''}`.toLowerCase();
  return message.includes('unique constraint') || message.includes('duplicate key');
}
