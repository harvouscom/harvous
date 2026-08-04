/**
 * Link UserMetadata.hmcChurchId → registered Churches row (home connection).
 * Congregants are never added to the Clerk org; connected* is the home pointer.
 */

import { db, first, Churches, eq, and, isNull } from '../db';
import { nowISO, toDate } from '../db/dates';

export type ChurchConnectionFields = {
  connectedChurchId: string | null;
  connectedOrgId: string | null;
  // `connectedChurchAt` is a ts() column (mode: 'date'), so this is what actually gets
  // written. It used to be typed `string | null` while a preserved value was passed
  // through as a raw string — a string headed for a Date column.
  connectedChurchAt: Date | null;
};

export const CLEARED_CHURCH_CONNECTION: ChurchConnectionFields = {
  connectedChurchId: null,
  connectedOrgId: null,
  connectedChurchAt: null,
};

/** Active registered church for an HMC directory id, if any. */
export async function findActiveChurchByHmcId(
  hmcChurchId: string,
): Promise<{ id: string; orgId: string } | null> {
  const id = hmcChurchId.trim();
  if (!id) return null;
  const row = first(
    await db
      .select({ id: Churches.id, orgId: Churches.orgId, isActive: Churches.isActive })
      .from(Churches)
      .where(and(eq(Churches.hmcChurchId, id), isNull(Churches.deletedAt)))
      .limit(1),
  );
  if (!row?.isActive) return null;
  return { id: row.id, orgId: row.orgId };
}

/**
 * Connection fields to persist for a given HMC id (or clear when null / unregistered).
 * When linking, `connectedChurchAt` is set to now — callers that want to preserve an
 * existing timestamp should pass `preserveConnectedAt`.
 */
export async function connectionFieldsForHmcChurchId(
  hmcChurchId: string | null,
  options?: { preserveConnectedAt?: Date | string | null },
): Promise<ChurchConnectionFields> {
  if (!hmcChurchId) return { ...CLEARED_CHURCH_CONNECTION };
  const church = await findActiveChurchByHmcId(hmcChurchId);
  if (!church) return { ...CLEARED_CHURCH_CONNECTION };
  // Normalize through toDate so a caller preserving an ISO string still writes a Date.
  const preserved = toDate(options?.preserveConnectedAt ?? null);
  return {
    connectedChurchId: church.id,
    connectedOrgId: church.orgId,
    connectedChurchAt: preserved ?? nowISO(),
  };
}
