/** Types for `scripts/db-push.js`, which stays plain JS so `db:push` needs no loader. */

/** Did drizzle-kit print an error it swallowed instead of exiting non-zero? */
export function looksLikeSwallowedError(stderrText: string): boolean;

/** Operator-facing explanation printed when a push stops partway through. */
export const PARTIAL_APPLY_MESSAGE: string;
