import { sql, type SQLWrapper } from 'drizzle-orm';

export const CHILD_ACCOUNT_ID_PREFIX = 'child_';

/** Keep managed children out of adult backups and product analytics, including orphaned notes. */
export function notChildAccount(ownerId: SQLWrapper) {
  return sql`NOT starts_with(${ownerId}, ${CHILD_ACCOUNT_ID_PREFIX})`;
}
