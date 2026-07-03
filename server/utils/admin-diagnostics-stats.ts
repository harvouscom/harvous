import {
  db,
  DiagnosticEvents,
  DiagnosticIssueTriage,
  eq,
  gte,
  desc,
  inArray,
  and,
} from '../db';
import { nowISO } from '../db/dates';
import {
  isDiagnosticTriageStatus,
  type DiagnosticSourceEnv,
  type DiagnosticTriageStatus,
} from '@/utils/diagnostic-sources';
import { isDiagnosticEventsTableMissing, isDiagnosticIssueTriageTableMissing } from './pg-undefined-relation';

export type DiagnosticIssueSummary = {
  issueSignature: string;
  message: string;
  count: number;
  lastSeen: string;
  topRoute: string | null;
  sources: string[];
  status: DiagnosticTriageStatus;
  adminNotes: string | null;
};

export type DiagnosticEventSample = {
  id: string;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  route: string | null;
  platform: string;
  appVersion: string | null;
  manualNote: string | null;
  metadata: string | null;
  createdAt: string;
};

const MAX_EVENTS_SCAN = 10_000;

function sinceDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

type GroupAcc = {
  issueSignature: string;
  count: number;
  lastSeen: string | Date;
  message: string;
  routeCounts: Map<string, number>;
  sources: Set<string>;
};

function eventTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function aggregateEvents(
  rows: Array<{
    issueSignature: string;
    message: string;
    route: string | null;
    source: string;
    createdAt: string | Date;
  }>,
): GroupAcc[] {
  const map = new Map<string, GroupAcc>();

  for (const row of rows) {
    let acc = map.get(row.issueSignature);
    if (!acc) {
      acc = {
        issueSignature: row.issueSignature,
        count: 0,
        lastSeen: row.createdAt,
        message: row.message,
        routeCounts: new Map(),
        sources: new Set(),
      };
      map.set(row.issueSignature, acc);
    }
    acc.count++;
    acc.sources.add(row.source);
    if (eventTime(row.createdAt) > eventTime(acc.lastSeen)) {
      acc.lastSeen = row.createdAt;
      acc.message = row.message;
    }
    if (row.route) {
      acc.routeCounts.set(row.route, (acc.routeCounts.get(row.route) ?? 0) + 1);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function topRoute(acc: GroupAcc): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [route, cnt] of acc.routeCounts) {
    if (cnt > bestCount) {
      best = route;
      bestCount = cnt;
    }
  }
  return best;
}

export async function getDiagnosticIssues(
  days: number,
  sourceEnv?: DiagnosticSourceEnv,
): Promise<DiagnosticIssueSummary[]> {
  const since = sinceDate(days);
  const where = sourceEnv
    ? and(gte(DiagnosticEvents.createdAt, since), eq(DiagnosticEvents.sourceEnv, sourceEnv))
    : gte(DiagnosticEvents.createdAt, since);

  try {
    const rows = await db
      .select({
        issueSignature: DiagnosticEvents.issueSignature,
        message: DiagnosticEvents.message,
        route: DiagnosticEvents.route,
        source: DiagnosticEvents.source,
        createdAt: DiagnosticEvents.createdAt,
      })
      .from(DiagnosticEvents)
      .where(where)
      .orderBy(desc(DiagnosticEvents.createdAt))
      .limit(MAX_EVENTS_SCAN);

    if (rows.length === 0) return [];

    const grouped = aggregateEvents(rows);
    const signatures = grouped.map((g) => g.issueSignature);
    let triageRows: Array<{
      issueSignature: string;
      status: string;
      adminNotes: string | null;
    }> = [];
    if (signatures.length > 0) {
      try {
        triageRows = await db
          .select({
            issueSignature: DiagnosticIssueTriage.issueSignature,
            status: DiagnosticIssueTriage.status,
            adminNotes: DiagnosticIssueTriage.adminNotes,
          })
          .from(DiagnosticIssueTriage)
          .where(inArray(DiagnosticIssueTriage.issueSignature, signatures));
      } catch (error) {
        if (!isDiagnosticEventsTableMissing(error) && !isDiagnosticIssueTriageTableMissing(error)) {
          throw error;
        }
      }
    }

    const triageMap = new Map(triageRows.map((t) => [t.issueSignature, t]));

    return grouped.map((g) => {
      const triage = triageMap.get(g.issueSignature);
      const status =
        triage?.status && isDiagnosticTriageStatus(triage.status) ? triage.status : 'open';
      return {
        issueSignature: g.issueSignature,
        message: g.message,
        count: g.count,
        lastSeen:
          g.lastSeen instanceof Date ? g.lastSeen.toISOString() : String(g.lastSeen),
        topRoute: topRoute(g),
        sources: Array.from(g.sources),
        status,
        adminNotes: triage?.adminNotes ?? null,
      };
    });
  } catch (error) {
    if (isDiagnosticEventsTableMissing(error)) return [];
    throw error;
  }
}

export async function countDiagnosticEventsSince(
  since: Date,
  sourceEnv?: DiagnosticSourceEnv,
): Promise<number> {
  const where = sourceEnv
    ? and(gte(DiagnosticEvents.createdAt, since), eq(DiagnosticEvents.sourceEnv, sourceEnv))
    : gte(DiagnosticEvents.createdAt, since);

  try {
    const rows = await db
      .select({ id: DiagnosticEvents.id })
      .from(DiagnosticEvents)
      .where(where)
      .limit(MAX_EVENTS_SCAN + 1);
    return rows.length > MAX_EVENTS_SCAN ? MAX_EVENTS_SCAN : rows.length;
  } catch (error) {
    if (isDiagnosticEventsTableMissing(error)) return 0;
    throw error;
  }
}

export async function getDiagnosticIssueEvents(
  issueSignature: string,
  limit: number,
): Promise<DiagnosticEventSample[]> {
  const capped = Math.min(Math.max(limit, 1), 50);

  try {
    return await db
      .select({
        id: DiagnosticEvents.id,
        source: DiagnosticEvents.source,
        severity: DiagnosticEvents.severity,
        message: DiagnosticEvents.message,
        stack: DiagnosticEvents.stack,
        route: DiagnosticEvents.route,
        platform: DiagnosticEvents.platform,
        appVersion: DiagnosticEvents.appVersion,
        manualNote: DiagnosticEvents.manualNote,
        metadata: DiagnosticEvents.metadata,
        createdAt: DiagnosticEvents.createdAt,
      })
      .from(DiagnosticEvents)
      .where(eq(DiagnosticEvents.issueSignature, issueSignature))
      .orderBy(desc(DiagnosticEvents.createdAt))
      .limit(capped);
  } catch (error) {
    if (isDiagnosticEventsTableMissing(error)) return [];
    throw error;
  }
}

export async function updateDiagnosticIssueTriage(
  issueSignature: string,
  status: DiagnosticTriageStatus,
  adminNotes?: string | null,
): Promise<void> {
  const now = nowISO();
  try {
    const existing = await db
      .select({ issueSignature: DiagnosticIssueTriage.issueSignature })
      .from(DiagnosticIssueTriage)
      .where(eq(DiagnosticIssueTriage.issueSignature, issueSignature))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(DiagnosticIssueTriage)
        .set({
          status,
          adminNotes: adminNotes ?? null,
          updatedAt: now,
        })
        .where(eq(DiagnosticIssueTriage.issueSignature, issueSignature));
      return;
    }

    await db.insert(DiagnosticIssueTriage).values({
      issueSignature,
      status,
      adminNotes: adminNotes ?? null,
      updatedAt: now,
    });
  } catch (error) {
    if (isDiagnosticIssueTriageTableMissing(error)) {
      console.warn('[updateDiagnosticIssueTriage] DiagnosticIssueTriage table missing; run `npm run db:push`.');
      return;
    }
    throw error;
  }
}

export async function bulkUpdateDiagnosticIssueTriage(
  issueSignatures: string[],
  status: DiagnosticTriageStatus,
  adminNotes?: string | null,
): Promise<number> {
  const unique = [...new Set(issueSignatures.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  for (const issueSignature of unique) {
    await updateDiagnosticIssueTriage(issueSignature, status, adminNotes);
  }
  return unique.length;
}
