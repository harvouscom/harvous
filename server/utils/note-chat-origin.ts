/**
 * The "From your Claude chat" card on a note an AI app started (Connector `start_note`).
 * Read for the note's author only; never part of a shared or public view of the note.
 */

import { db, NoteChatOrigins, eq, and, first } from '../db';
import { isConnectorSchemaMissing } from './pg-undefined-relation';

export interface NoteChatOriginOut {
  appName: string;
  summary: string;
  passages: string[];
  question: string | null;
  createdAt: string;
}

function parsePassages(raw: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Only notes stamped `mcp-…` can have a card, so every other note skips the query. */
export async function readNoteChatOrigin(
  note: { id: string; userId: string; addedBy?: string | null },
  viewerUserId: string,
): Promise<NoteChatOriginOut | null> {
  if (note.userId !== viewerUserId || !note.addedBy?.startsWith('mcp-')) return null;
  try {
    const row = first(
      await db
        .select()
        .from(NoteChatOrigins)
        .where(and(eq(NoteChatOrigins.noteId, note.id), eq(NoteChatOrigins.userId, viewerUserId)))
        .limit(1),
    );
    if (!row) return null;
    return {
      appName: row.appName,
      summary: row.summary,
      passages: parsePassages(row.passages),
      question: row.question ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  } catch (error) {
    if (isConnectorSchemaMissing(error)) return null;
    throw error;
  }
}

/** Remove the card. The note keeps `addedBy`, so the side panel still says where it started. */
export async function removeNoteChatOrigin(noteId: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(NoteChatOrigins)
    .where(and(eq(NoteChatOrigins.noteId, noteId), eq(NoteChatOrigins.userId, userId)))
    .returning({ noteId: NoteChatOrigins.noteId });
  return rows.length > 0;
}
