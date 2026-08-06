/**
 * A church's recurring service times, and which sermons are preached at them.
 *
 * Two things live here that used to be one. `ChurchServiceTimes` is *when the
 * church gathers* — stable, recurring, edited a few times a decade.
 * `ChurchServiceTimeAssignments` is *which of those a given sermon fills* —
 * many-to-many, because one sermon covers both Sunday morning services while
 * the evening service hears a different one.
 *
 * Display and defaults only. Nothing here schedules or notifies; see
 * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
 */
import {
  db,
  ChurchServiceTimes,
  ChurchServiceTimeAssignments,
  and,
  asc,
  eq,
  inArray,
} from '../db';

export type ChurchServiceTimeRow = typeof ChurchServiceTimes.$inferSelect;

/** The church's slots, in the order staff arranged them, then by day and clock. */
export async function listServiceTimesForChurch(churchId: string): Promise<ChurchServiceTimeRow[]> {
  return db
    .select()
    .from(ChurchServiceTimes)
    .where(eq(ChurchServiceTimes.churchId, churchId))
    .orderBy(
      asc(ChurchServiceTimes.sortOrder),
      asc(ChurchServiceTimes.dayOfWeek),
      asc(ChurchServiceTimes.startTime),
    );
}

/** serviceId → the slot ids it is preached at. Empty array for a sermon with none. */
export async function serviceTimeIdsByService(
  serviceIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (serviceIds.length === 0) return out;

  const rows = await db
    .select({
      serviceId: ChurchServiceTimeAssignments.serviceId,
      serviceTimeId: ChurchServiceTimeAssignments.serviceTimeId,
    })
    .from(ChurchServiceTimeAssignments)
    .where(inArray(ChurchServiceTimeAssignments.serviceId, serviceIds));

  for (const row of rows) {
    const list = out.get(row.serviceId);
    if (list) list.push(row.serviceTimeId);
    else out.set(row.serviceId, [row.serviceTimeId]);
  }
  return out;
}

/**
 * Point a sermon at exactly this set of slots, replacing whatever it had.
 *
 * Delete-then-insert rather than a diff: the set is at most a handful of rows,
 * and a diff would have to reason about the denormalized `serviceDate` on each
 * survivor when the sermon moves to another day. Callers must run this inside
 * the same transaction as the parent write, so a failed insert cannot leave a
 * sermon with no times.
 */
export async function replaceServiceTimeAssignments(
  tx: { delete: typeof db.delete; insert: typeof db.insert },
  input: { serviceId: string; serviceDate: string; serviceTimeIds: string[] },
): Promise<void> {
  await tx
    .delete(ChurchServiceTimeAssignments)
    .where(eq(ChurchServiceTimeAssignments.serviceId, input.serviceId));

  if (input.serviceTimeIds.length === 0) return;

  const now = new Date();
  await tx.insert(ChurchServiceTimeAssignments).values(
    input.serviceTimeIds.map((serviceTimeId) => ({
      id: `csta_${crypto.randomUUID()}`,
      serviceId: input.serviceId,
      serviceTimeId,
      // Denormalized so the unique index can guarantee one sermon per slot per
      // date. Written only here, always from the parent's own date.
      serviceDate: input.serviceDate,
      createdAt: now,
    })),
  );
}

/**
 * Release every slot a sermon held. Call this whenever one is deleted.
 *
 * Nothing enforces it for us: the ids in this table are plain text columns with
 * no foreign key, so there is no cascade. A delete that dropped only the
 * `ChurchServices` row left assignments pointing at a sermon that no longer
 * existed — and because those rows still occupied their place in
 * `ChurchServiceTimeAssignments_slot_date_unique`, that service time on that
 * date was blocked forever, with nothing in the plan to show why.
 *
 * Takes the transaction, so the release and the delete succeed or fail together.
 */
export async function clearServiceTimeAssignments(
  tx: { delete: typeof db.delete },
  serviceId: string,
): Promise<void> {
  await tx
    .delete(ChurchServiceTimeAssignments)
    .where(eq(ChurchServiceTimeAssignments.serviceId, serviceId));
}

/** Which of these slot ids belong to this church — the cross-church guard. */
export async function filterServiceTimeIdsForChurch(
  churchId: string,
  serviceTimeIds: string[],
): Promise<string[]> {
  if (serviceTimeIds.length === 0) return [];
  const rows = await db
    .select({ id: ChurchServiceTimes.id })
    .from(ChurchServiceTimes)
    .where(
      and(eq(ChurchServiceTimes.churchId, churchId), inArray(ChurchServiceTimes.id, serviceTimeIds)),
    );
  return rows.map((row) => row.id);
}

export type ChurchClock = { date: string; time: string };

/**
 * The church's own wall clock, right now.
 *
 * The congregant card needs this to answer "has the 9:00 service started yet?"
 * — a question only the church's clock can settle, since the viewer may be
 * three zones away. This is the *only* place a timezone is applied; every
 * stored time stays a naive wall-clock reading.
 *
 * Falls back to UTC for a church that has not set a zone, which is harmless:
 * with no zone there are usually no service times either, and the card degrades
 * to the date-only behaviour it had before times existed.
 */
export function churchClockNow(timezone: string | null | undefined, now: Date = new Date()): ChurchClock {
  const zone = timezone || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${hour}:${get('minute')}`,
    };
  } catch {
    return churchClockNow('UTC', now);
  }
}
