/**
 * Admin outreach demand: aggregate Here’s My Church picks from Settings → My Church
 * (UserMetadata.hmcChurchId). Counts + church identity only — no user PII.
 */

import { db, UserMetadata, Churches, count, isNotNull, sql } from '../db';

export type HmcChurchInterestRow = {
  hmcChurchId: string;
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  userCount: number;
  registeredChurchId: string | null;
  registeredOrgId: string | null;
};

type AggregateRow = {
  hmcChurchId: string;
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  userCount: number;
};

type RegisteredRow = {
  id: string;
  orgId: string;
  hmcChurchId: string | null;
};

/** Pure merge + sort for tests and the DB loader. */
export function mergeHmcChurchInterest(
  aggregates: AggregateRow[],
  registered: RegisteredRow[],
): HmcChurchInterestRow[] {
  const byHmc = new Map<string, RegisteredRow>();
  for (const row of registered) {
    const id = row.hmcChurchId?.trim();
    if (id) byHmc.set(id, row);
  }

  return aggregates
    .filter((row) => Boolean(row.hmcChurchId?.trim()))
    .map((row) => {
      const hmcChurchId = row.hmcChurchId.trim();
      const reg = byHmc.get(hmcChurchId);
      return {
        hmcChurchId,
        churchName: row.churchName?.trim() || null,
        churchCity: row.churchCity?.trim() || null,
        churchState: row.churchState?.trim() || null,
        userCount: row.userCount,
        registeredChurchId: reg?.id ?? null,
        registeredOrgId: reg?.orgId ?? null,
      };
    })
    .sort((a, b) => {
      if (b.userCount !== a.userCount) return b.userCount - a.userCount;
      return (a.churchName ?? a.hmcChurchId).localeCompare(b.churchName ?? b.hmcChurchId, undefined, {
        sensitivity: 'base',
      });
    });
}

/** Load HMC interest from UserMetadata, flagging already-registered Churches. */
export async function listHmcChurchInterest(): Promise<HmcChurchInterestRow[]> {
  const aggregates = await db
    .select({
      hmcChurchId: UserMetadata.hmcChurchId,
      churchName: sql<string | null>`max(${UserMetadata.churchName})`,
      churchCity: sql<string | null>`max(${UserMetadata.churchCity})`,
      churchState: sql<string | null>`max(${UserMetadata.churchState})`,
      userCount: count(),
    })
    .from(UserMetadata)
    .where(isNotNull(UserMetadata.hmcChurchId))
    .groupBy(UserMetadata.hmcChurchId);

  const registered = await db
    .select({
      id: Churches.id,
      orgId: Churches.orgId,
      hmcChurchId: Churches.hmcChurchId,
    })
    .from(Churches)
    .where(isNotNull(Churches.hmcChurchId));

  return mergeHmcChurchInterest(
    aggregates
      .filter((row): row is typeof row & { hmcChurchId: string } => Boolean(row.hmcChurchId))
      .map((row) => ({
        hmcChurchId: row.hmcChurchId,
        churchName: row.churchName ?? null,
        churchCity: row.churchCity ?? null,
        churchState: row.churchState ?? null,
        userCount: Number(row.userCount),
      })),
    registered,
  );
}
