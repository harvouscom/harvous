/**
 * Connector limits and per-app records.
 *
 *   per IP, any request      IP_REQUESTS_PER_MINUTE   in memory, before auth (HTTP 429)
 *   per person, any request  REQUESTS_PER_MINUTE      in memory
 *   per person, tool calls   CALLS_PER_MINUTE         in memory
 *   per person, tool calls   DAILY_CALLS / UTC day    Postgres (ConnectorUsageDays)
 *   per person, start_note   NOTES_STARTED_PER_DAY    Postgres (ConnectorUsageDays.notesStarted)
 *
 * The daily cap is in the database because it has to survive deploys and hold across
 * machines; the per-minute buckets only need to stop a runaway loop on one machine.
 */

import { randomUUID } from 'node:crypto';
import { checkRateLimit } from '@/utils/rate-limit';
import { db, ConnectorClients, ConnectorUsageDays, eq, and, sql, first } from '../db';
import {
  CALLS_PER_MINUTE,
  DAILY_CALLS,
  IP_REQUESTS_PER_MINUTE,
  NOTES_STARTED_PER_DAY,
  REQUESTS_PER_MINUTE,
} from './config';
import { ConnectorRefusal } from './shapes';

const MINUTE = 60_000;

export function allowIpRequest(ip: string | undefined): boolean {
  return checkRateLimit(null, 'connector:ip', { maxRequests: IP_REQUESTS_PER_MINUTE, windowMs: MINUTE }, ip ?? 'unknown')
    .allowed;
}

export function allowUserRequest(userId: string): boolean {
  return checkRateLimit(userId, 'connector:request', { maxRequests: REQUESTS_PER_MINUTE, windowMs: MINUTE }).allowed;
}

/** UTC calendar day, `YYYY-MM-DD`. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "in 3h 12m" until the next UTC midnight. */
export function untilUtcMidnight(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(1, Math.ceil((next - now.getTime()) / MINUTE));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

/**
 * Spend one tool call: the per-minute bucket, then the daily counter.
 * Throws a `ConnectorRefusal` the tool returns as `isError`.
 */
export async function consumeToolCall(userId: string, now = new Date()): Promise<{ today: number }> {
  const minute = checkRateLimit(userId, 'connector:call', { maxRequests: CALLS_PER_MINUTE, windowMs: MINUTE });
  if (!minute.allowed) {
    throw new ConnectorRefusal(
      'rate_limited',
      `Too many Harvous requests in a minute (limit ${CALLS_PER_MINUTE}). Wait a moment and try again.`,
    );
  }

  const day = utcDay(now);
  const rows = await db
    .insert(ConnectorUsageDays)
    .values({ userId, day, toolCalls: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [ConnectorUsageDays.userId, ConnectorUsageDays.day],
      set: { toolCalls: sql`${ConnectorUsageDays.toolCalls} + 1`, updatedAt: now },
    })
    .returning({ toolCalls: ConnectorUsageDays.toolCalls });
  const today = first(rows)?.toolCalls ?? 1;
  if (today > DAILY_CALLS) {
    throw new ConnectorRefusal(
      'daily_limit',
      `Daily limit reached (${DAILY_CALLS.toLocaleString('en-US')} Harvous requests). ` +
        `It resets at 00:00 UTC (${untilUtcMidnight(now)}).`,
    );
  }
  return { today };
}

/**
 * Spend one started note. Counted before the note is created, so a refused call never
 * leaves a note behind; a failed create after this costs one of the day's twenty, which
 * is the safe direction.
 */
export async function consumeNoteStart(userId: string, now = new Date()): Promise<{ today: number }> {
  const day = utcDay(now);
  const rows = await db
    .insert(ConnectorUsageDays)
    .values({ userId, day, toolCalls: 0, notesStarted: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [ConnectorUsageDays.userId, ConnectorUsageDays.day],
      set: { notesStarted: sql`${ConnectorUsageDays.notesStarted} + 1`, updatedAt: now },
    })
    .returning({ notesStarted: ConnectorUsageDays.notesStarted });
  const today = first(rows)?.notesStarted ?? 1;
  if (today > NOTES_STARTED_PER_DAY) {
    throw new ConnectorRefusal(
      'daily_limit',
      `You've started ${NOTES_STARTED_PER_DAY} notes from apps today, the daily limit. ` +
        `It resets at 00:00 UTC (${untilUtcMidnight(now)}).`,
    );
  }
  return { today };
}

export async function usageToday(userId: string, now = new Date()): Promise<number> {
  const row = first(
    await db
      .select({ toolCalls: ConnectorUsageDays.toolCalls })
      .from(ConnectorUsageDays)
      .where(and(eq(ConnectorUsageDays.userId, userId), eq(ConnectorUsageDays.day, utcDay(now))))
      .limit(1),
  );
  return Math.min(row?.toolCalls ?? 0, DAILY_CALLS);
}

// ─── Connected apps ────────────────────────────────────────────────────────────

/** Last write per (user, client) in this process — `lastUsedAt` needs minute precision, not every call. */
const lastTouch = new Map<string, number>();
/** Revocation answers, cached briefly so every call doesn't re-read the row. */
const revokedCache = new Map<string, { revoked: boolean; at: number }>();

function pairKey(userId: string, clientId: string): string {
  return `${userId}\u0000${clientId}`;
}

/**
 * Record that this app was used (and, from `initialize`, what it calls itself).
 * Best-effort: a failed write must never fail the person's request.
 */
export async function touchConnectorClient(
  userId: string,
  clientId: string,
  clientName?: string | null,
  now = new Date(),
): Promise<void> {
  const key = pairKey(userId, clientId);
  const last = lastTouch.get(key) ?? 0;
  if (!clientName && now.getTime() - last < MINUTE) return;
  lastTouch.set(key, now.getTime());
  const name = clientName?.trim().slice(0, 120) || null;
  try {
    await db
      .insert(ConnectorClients)
      .values({
        id: `cclient_${randomUUID()}`,
        userId,
        clientId,
        clientName: name,
        firstUsedAt: now,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: [ConnectorClients.userId, ConnectorClients.clientId],
        set: name ? { lastUsedAt: now, clientName: name } : { lastUsedAt: now },
      });
  } catch (error) {
    console.warn('[connector] could not record client use:', error instanceof Error ? error.message : error);
  }
}

export async function isClientRevoked(userId: string, clientId: string, now = Date.now()): Promise<boolean> {
  const key = pairKey(userId, clientId);
  const cached = revokedCache.get(key);
  if (cached && now - cached.at < MINUTE) return cached.revoked;
  const row = first(
    await db
      .select({ revokedAt: ConnectorClients.revokedAt })
      .from(ConnectorClients)
      .where(and(eq(ConnectorClients.userId, userId), eq(ConnectorClients.clientId, clientId)))
      .limit(1),
  );
  const revoked = Boolean(row?.revokedAt);
  revokedCache.set(key, { revoked, at: now });
  return revoked;
}

/** Settings' Disconnect / Allow again. Clears this process's cache so it takes effect here at once. */
export async function setClientRevoked(userId: string, clientId: string, revoked: boolean): Promise<boolean> {
  const rows = await db
    .update(ConnectorClients)
    .set({ revokedAt: revoked ? new Date() : null })
    .where(and(eq(ConnectorClients.userId, userId), eq(ConnectorClients.clientId, clientId)))
    .returning({ id: ConnectorClients.id });
  revokedCache.delete(pairKey(userId, clientId));
  return rows.length > 0;
}

/** What this app called itself at `initialize`, if it has connected before. */
export async function connectorClientName(userId: string, clientId: string): Promise<string | null> {
  const row = first(
    await db
      .select({ clientName: ConnectorClients.clientName })
      .from(ConnectorClients)
      .where(and(eq(ConnectorClients.userId, userId), eq(ConnectorClients.clientId, clientId)))
      .limit(1),
  );
  return row?.clientName ?? null;
}

export async function listConnectorClients(userId: string) {
  return db
    .select({
      clientId: ConnectorClients.clientId,
      clientName: ConnectorClients.clientName,
      firstUsedAt: ConnectorClients.firstUsedAt,
      lastUsedAt: ConnectorClients.lastUsedAt,
      revokedAt: ConnectorClients.revokedAt,
    })
    .from(ConnectorClients)
    .where(eq(ConnectorClients.userId, userId))
    .orderBy(sql`${ConnectorClients.lastUsedAt} DESC`);
}
