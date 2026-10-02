/**
 * Per-person Connector settings (ConnectorPreferences). Today one switch: "Let apps start
 * notes", **off until the person turns it on** — no row means the default. Reading is
 * everything else the Connector does; writing into someone's study is opt-in.
 */

import { db, ConnectorPreferences, eq, first } from '../db';
import { isConnectorSchemaMissing } from '../utils/pg-undefined-relation';

export interface ConnectorPrefs {
  allowStartNotes: boolean;
}

export const DEFAULT_CONNECTOR_PREFS: ConnectorPrefs = { allowStartNotes: false };

export async function getConnectorPreferences(userId: string): Promise<ConnectorPrefs> {
  try {
    const row = first(
      await db
        .select({ allowStartNotes: ConnectorPreferences.allowStartNotes })
        .from(ConnectorPreferences)
        .where(eq(ConnectorPreferences.userId, userId))
        .limit(1),
    );
    return row ? { allowStartNotes: row.allowStartNotes } : DEFAULT_CONNECTOR_PREFS;
  } catch (error) {
    if (isConnectorSchemaMissing(error)) return DEFAULT_CONNECTOR_PREFS;
    throw error;
  }
}

export async function allowsStartNotes(userId: string): Promise<boolean> {
  return (await getConnectorPreferences(userId)).allowStartNotes;
}

export async function setConnectorPreferences(userId: string, prefs: ConnectorPrefs, now = new Date()): Promise<ConnectorPrefs> {
  await db
    .insert(ConnectorPreferences)
    .values({ userId, allowStartNotes: prefs.allowStartNotes, updatedAt: now })
    .onConflictDoUpdate({
      target: ConnectorPreferences.userId,
      set: { allowStartNotes: prefs.allowStartNotes, updatedAt: now },
    });
  return prefs;
}
