/**
 * Re-running a finished series — the seasonal case.
 *
 * A church teaches Advent every year. `repeat` cannot do this: it extends a run
 * *forward into unwritten weeks* and deliberately refuses to copy a passage,
 * because there the next week genuinely is a different text. Re-running copies
 * a **finished study** onto new dates, where last year's outline is the most
 * valuable thing the pastor has. Opposite stances, both correct — do not try to
 * unify them.
 *
 * Server-side for the same reason `repeat` is: writes are rate-limited to 20 a
 * minute and a quarter is thirteen of them, so a client loop would spend most of
 * a pastor's budget on one action.
 */
import { ChurchServices, ChurchSeries } from '../db';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** What a re-run carries across. Each is a deliberate choice, not a default. */
export type RerunCopyFlags = {
  /** Each week's own title. Off means every week is named after the series. */
  titles: boolean;
  /** Each week's passage — the reason a re-run is not just `repeat`. */
  references: boolean;
  /** The congregant starter template each week's note begins from. */
  starterTemplate: boolean;
  /** Library items attached to each week. Off by default — see the route. */
  resources: boolean;
};

export const DEFAULT_RERUN_COPY: RerunCopyFlags = {
  titles: true,
  references: true,
  starterTemplate: true,
  /*
    Off. A handout carrying last year's dates, or a link that has since moved,
    is worse than an empty shelf — and re-attaching is one click from the
    space's own library.
  */
  resources: false,
};

function toUtc(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Date.UTC rolls 2026-02-31 into March, which would silently move a run.
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null;
}

/**
 * The new dates for a re-run, preserving the **shape** of the original.
 *
 * Not a weekly step. Advent has a Christmas Eve in it, Holy Week has a Friday,
 * and a rigid `+7` would flatten precisely the seasons this exists for. Each
 * copied week keeps its offset in days from the source run's own first date, so
 * a run that went Sun, Sun, Thu, Sun lands as Sun, Sun, Thu, Sun.
 *
 * Undated source rows are dropped: they are backlog ideas, and there is no
 * offset to preserve. Returns null when the source has no usable first date.
 */
export function rerunDatesFor(
  sourceDates: readonly (string | null)[],
  startDate: string,
): string[] | null {
  const dated = sourceDates.filter((d): d is string => Boolean(d)).sort();
  if (dated.length === 0) return null;
  const origin = toUtc(dated[0]!);
  const start = toUtc(startDate);
  if (origin === null || start === null) return null;

  return dated.map((d) => {
    const at = toUtc(d);
    // Unparseable dates cannot happen (the column is validated on write), but
    // falling back to the start beats emitting an invalid date string.
    if (at === null) return startDate;
    return new Date(start + (at - origin)).toISOString().slice(0, 10);
  });
}

/** The year a run belongs to, for labelling it — derived, never typed. */
export function runLabelForDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = ISO_DATE.exec(iso);
  return m ? m[1]! : null;
}

/** One copied week, ready to insert. */
export type RerunRow = typeof ChurchServices.$inferInsert;

/**
 * Build the rows for a re-run. Pure — the route owns the transaction, the gate,
 * and the slot-collision handling.
 */
export function buildRerunRows(input: {
  source: readonly (typeof ChurchServices.$inferSelect)[];
  dates: readonly string[];
  seriesId: string;
  seriesTitle: string;
  /** Null for a churchless Shared Space's plan. */
  churchId: string | null;
  spaceId: string | null;
  copy: RerunCopyFlags;
  userId: string;
  now: Date;
}): RerunRow[] {
  const dated = input.source.filter((s) => s.serviceDate).sort((a, b) =>
    String(a.serviceDate).localeCompare(String(b.serviceDate)),
  );
  return dated.map((row, i) => ({
    id: `svc_${crypto.randomUUID()}`,
    churchId: input.churchId,
    spaceId: input.spaceId,
    serviceDate: input.dates[i] ?? null,
    /* A one-off time is a fact about *that* Christmas Eve, not about the
       season, so it never copies. Slots are claimed by the route instead. */
    serviceTime: null,
    /* Falls back to the series name, the same honest substitute `repeat` uses:
       `title` is NOT NULL, and a numbered "Week 3" says something that could
       become false. */
    title: input.copy.titles ? row.title : input.seriesTitle,
    seriesId: input.seriesId,
    reference: input.copy.references ? row.reference : null,
    starterTemplateId: input.copy.starterTemplate ? row.starterTemplateId : null,
    kind: row.kind,
    createdBy: input.userId,
    updatedBy: null,
    createdAt: input.now,
    updatedAt: null,
  }));
}

/** Named export kept beside the builder so a reader finds both at once. */
export const RERUN_SERIES_TABLE = ChurchSeries;
