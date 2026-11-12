import { asc, eq } from 'drizzle-orm';
import { FamilyChildConsents } from '../db/schema';
import type { Child, FamilyTx } from './service';

/** Every agreement to the child privacy notice for one notebook, oldest first. */
export function consentHistory(tx: FamilyTx, child: Child) {
  return tx.select({ noticeVersion: FamilyChildConsents.noticeVersion, consentedAt: FamilyChildConsents.consentedAt, kind: FamilyChildConsents.kind })
    .from(FamilyChildConsents).where(eq(FamilyChildConsents.childId, child.id)).orderBy(asc(FamilyChildConsents.consentedAt));
}
