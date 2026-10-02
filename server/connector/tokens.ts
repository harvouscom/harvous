/**
 * Personal Connector tokens — for apps that take a fixed `Authorization: Bearer` header and
 * cannot run a sign-in (Grok Bot, scripts).
 *
 *   - `hvous_` + 32 random bytes, base64url. Shown once, at creation; only the sha256 is kept.
 *   - One active token per person: creating a new one revokes the old one, and a partial
 *     unique index backs that up in the database.
 *   - A token is just another client: its calls are recorded in ConnectorClients as
 *     `token:<id>`, gated by Plus and the same limits, and read-only like everything else.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, ConnectorApiKeys, eq, and, isNull, first } from '../db';

export const PERSONAL_TOKEN_PREFIX = 'hvous_';

export function isPersonalToken(value: string): boolean {
  return value.startsWith(PERSONAL_TOKEN_PREFIX);
}

export function hashPersonalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePersonalToken(): string {
  return `${PERSONAL_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** What Settings shows: never the token, only enough to recognise it. */
export interface PersonalTokenSummary {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function getActivePersonalToken(userId: string): Promise<PersonalTokenSummary | null> {
  const row = first(
    await db
      .select({
        keyPrefix: ConnectorApiKeys.keyPrefix,
        createdAt: ConnectorApiKeys.createdAt,
        lastUsedAt: ConnectorApiKeys.lastUsedAt,
      })
      .from(ConnectorApiKeys)
      .where(and(eq(ConnectorApiKeys.userId, userId), isNull(ConnectorApiKeys.revokedAt)))
      .limit(1),
  );
  if (!row) return null;
  return {
    prefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

/** Revoke any active token and issue a new one. Returns the plaintext — the only time it exists. */
export async function createPersonalToken(userId: string, now = new Date()): Promise<{ token: string } & PersonalTokenSummary> {
  const token = generatePersonalToken();
  const prefix = token.slice(0, PERSONAL_TOKEN_PREFIX.length + 4);
  await db.transaction(async (tx) => {
    await tx
      .update(ConnectorApiKeys)
      .set({ revokedAt: now })
      .where(and(eq(ConnectorApiKeys.userId, userId), isNull(ConnectorApiKeys.revokedAt)));
    await tx.insert(ConnectorApiKeys).values({
      id: `ctoken_${randomUUID()}`,
      userId,
      keyHash: hashPersonalToken(token),
      keyPrefix: prefix,
      createdAt: now,
    });
  });
  return { token, prefix, createdAt: now.toISOString(), lastUsedAt: null };
}

export async function revokePersonalToken(userId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(ConnectorApiKeys)
    .set({ revokedAt: now })
    .where(and(eq(ConnectorApiKeys.userId, userId), isNull(ConnectorApiKeys.revokedAt)))
    .returning({ id: ConnectorApiKeys.id });
  return rows.length > 0;
}

const lastTouch = new Map<string, number>();

/** The active token this value names, or null. Records last use at most once a minute. */
export async function resolvePersonalToken(token: string, now = new Date()): Promise<{ id: string; userId: string } | null> {
  const row = first(
    await db
      .select({ id: ConnectorApiKeys.id, userId: ConnectorApiKeys.userId })
      .from(ConnectorApiKeys)
      .where(and(eq(ConnectorApiKeys.keyHash, hashPersonalToken(token)), isNull(ConnectorApiKeys.revokedAt)))
      .limit(1),
  );
  if (!row) return null;
  const last = lastTouch.get(row.id) ?? 0;
  if (now.getTime() - last >= 60_000) {
    lastTouch.set(row.id, now.getTime());
    void db
      .update(ConnectorApiKeys)
      .set({ lastUsedAt: now })
      .where(eq(ConnectorApiKeys.id, row.id))
      .catch(() => {});
  }
  return row;
}
