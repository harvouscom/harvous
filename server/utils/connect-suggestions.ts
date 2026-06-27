/**
 * Connect suggestions: strongly-related note pairs that share a passage, cross-reference, or theme
 * but have NO existing NoteConnections edge. Surfacing these as a one-tap "link these" card in the
 * recall carousel grows the connection graph (currently ~8 edges total), which strengthens study arcs
 * and resurfacing. Reuses `getRelatedNotesForPassages` scoring. Deterministic, no AI.
 */

import {
  db,
  eq,
  and,
  ne,
  Notes,
  NoteConnections,
  ScriptureMetadata,
} from '../db';
import {
  getRelatedNotesForPassages,
  getNotePassages,
  type RelatedNote,
} from './scripture-knowledge';
import { isNoteConnectionsTableMissing } from './pg-undefined-relation';

export interface ConnectSuggestion {
  noteAId: string;
  noteATitle: string;
  noteBId: string;
  noteBTitle: string;
  reason: string;
  score: number;
}

/** Pure ranking: pick the strongest unlinked pair. */
export function pickBestUnlinkedPair(
  noteId: string,
  noteTitle: string,
  related: RelatedNote[],
  linkedIds: Set<string>,
  titleById: Map<string, string>,
): ConnectSuggestion | null {
  for (const r of related) {
    if (linkedIds.has(r.noteId)) continue;
    const reason = r.sharedPassages.length
      ? 'Shared passage'
      : r.sharedCrossRefs.length
        ? 'Cross-reference'
        : 'Shared theme';
    return {
      noteAId: noteId,
      noteATitle: noteTitle,
      noteBId: r.noteId,
      noteBTitle: titleById.get(r.noteId) ?? 'Untitled note',
      reason,
      score: r.score,
    };
  }
  return null;
}

/**
 * Find the strongest pair of the user's notes that are related (by passage/cross-ref/theme) but
 * not yet connected via NoteConnections. Checks the top N notes by meaning weight (from fingerprints)
 * to keep the query bounded. Returns at most `limit` suggestions.
 */
export async function getConnectSuggestions(
  userId: string,
  opts: { limit?: number; candidateLimit?: number } = {},
): Promise<ConnectSuggestion[]> {
  const { limit = 3, candidateLimit = 20 } = opts;

  const userNotes = await db
    .select({ id: Notes.id, title: Notes.title })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')));

  if (userNotes.length < 2) return [];

  const titleById = new Map(userNotes.map((n) => [n.id, n.title?.trim() || 'Untitled note']));
  const noteIds = userNotes.map((n) => n.id);

  let existingEdges: Set<string>;
  try {
    const edges = await db
      .select({ from: NoteConnections.fromNoteId, to: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(eq(NoteConnections.userId, userId));
    existingEdges = new Set<string>();
    for (const e of edges) {
      existingEdges.add(`${e.from}|${e.to}`);
      existingEdges.add(`${e.to}|${e.from}`);
    }
  } catch (err) {
    if (isNoteConnectionsTableMissing(err)) {
      existingEdges = new Set();
    } else {
      throw err;
    }
  }

  const linkedByNote = new Map<string, Set<string>>();
  for (const key of existingEdges) {
    const [a, b] = key.split('|');
    if (!linkedByNote.has(a!)) linkedByNote.set(a!, new Set());
    linkedByNote.get(a!)!.add(b!);
  }

  const out: ConnectSuggestion[] = [];
  const usedPairs = new Set<string>();
  const candidates = noteIds.slice(0, candidateLimit);

  for (const noteId of candidates) {
    if (out.length >= limit) break;
    const passages = await getNotePassages(noteId);
    if (!passages.length) continue;

    const related = await getRelatedNotesForPassages(userId, passages, {
      excludeNoteId: noteId,
      limit: 10,
    });

    const linkedIds = linkedByNote.get(noteId) ?? new Set();
    const best = pickBestUnlinkedPair(
      noteId,
      titleById.get(noteId) ?? 'Untitled note',
      related,
      linkedIds,
      titleById,
    );

    if (best) {
      const pairKey = [best.noteAId, best.noteBId].sort().join('|');
      if (!usedPairs.has(pairKey)) {
        usedPairs.add(pairKey);
        out.push(best);
      }
    }
  }

  return out;
}
