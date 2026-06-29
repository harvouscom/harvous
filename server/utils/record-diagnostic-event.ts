import { db, DiagnosticEvents, count, eq, gte, and } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import { isDiagnosticEventsTableMissing } from './pg-undefined-relation';
import { sanitizeDiagnosticPayload, type SanitizedDiagnosticInput } from './diagnostics-sanitize';

const MAX_EVENTS_PER_SESSION_PER_HOUR = 60;

export type DiagnosticEventInput = SanitizedDiagnosticInput;

export function validateDiagnosticEventInput(body: unknown): DiagnosticEventInput | null {
  return sanitizeDiagnosticPayload(body);
}

async function isRateLimited(anonymousSessionId: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const row = await db
    .select({ cnt: count() })
    .from(DiagnosticEvents)
    .where(
      and(
        eq(DiagnosticEvents.anonymousSessionId, anonymousSessionId),
        gte(DiagnosticEvents.createdAt, oneHourAgo),
      ),
    )
    .limit(1);
  return (row[0]?.cnt ?? 0) >= MAX_EVENTS_PER_SESSION_PER_HOUR;
}

export async function recordDiagnosticEvent(input: DiagnosticEventInput): Promise<boolean> {
  try {
    if (await isRateLimited(input.anonymousSessionId)) {
      return false;
    }

    await db.insert(DiagnosticEvents).values({
      id: generateTimestampId('diag'),
      issueSignature: input.issueSignature,
      source: input.source,
      severity: input.severity,
      message: input.message,
      stack: input.stack,
      route: input.route,
      platform: input.platform,
      appVersion: input.appVersion,
      anonymousSessionId: input.anonymousSessionId,
      manualNote: input.manualNote,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: nowISO(),
    });

    return true;
  } catch (error) {
    if (isDiagnosticEventsTableMissing(error)) {
      console.warn('[recordDiagnosticEvent] DiagnosticEvents table missing; skipping. Run `npm run db:push`.');
      return false;
    }
    console.error('[recordDiagnosticEvent]', error instanceof Error ? error.message : error);
    return false;
  }
}
