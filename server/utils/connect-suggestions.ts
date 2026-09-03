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
  inArray,
  Notes,
  NoteConnections,
  NoteScriptureReferences,
  ScriptureMetadata,
  ScriptureTopics,
} from '../db';
import {
  getRelatedNoteCandidates,
  getRelatedNotesForPassages,
  type RelatedNote,
  type VerseKey,
} from './scripture-knowledge';
import { isNoteConnectionsTableMissing } from './pg-undefined-relation';

export interface ConnectSuggestion {
  noteAId: string;
  noteATitle: string;
  noteBId: string;
  noteBTitle: string;
  reason: string;
  score: number;
  /**
   * What the two notes actually have in common, named — "Romans 8" rather than the
   * bare fact that a passage is shared. The client uses it to propose a thread name
   * worth accepting; without it the only honest suggestion was to join the two note
   * titles with "and", which is a description of the pair, not a name for the study.
   */
  sharedSubject?: string;
}

/**
 * A pair as the ranker sees it, before topic ids have been turned into words.
 *
 * Passages and cross-refs name themselves — "Romans 8" is already readable. A theme is
 * stored as a topic id (`topic_assurance`), which is not something to put in front of
 * anyone, so it is carried separately and resolved against `ScriptureTopics` before the
 * suggestion leaves this module.
 */
export interface RankedPair extends ConnectSuggestion {
  sharedThemeId?: string;
}

/**
 * Collapse shared verse keys into the shortest thing that still names them.
 *
 * Keys arrive as `Book|chapter|verse` (see `verseKey` in scripture-knowledge). Two notes
 * that meet over several verses of one chapter are studying that chapter, so "Romans 8"
 * is a truer name than whichever verse happened to sort first — and a pair spread across
 * a book gets the book. Returns null rather than guess when the overlap spans books.
 */
export function describeSharedPassages(keys: string[]): string | null {
  const parsed = keys
    .map((k) => k.split('|'))
    .filter((parts): parts is [string, string, string] => parts.length === 3 && !!parts[0]);
  if (!parsed.length) return null;

  const books = new Set(parsed.map(([book]) => book));
  if (books.size !== 1) return null;
  const book = parsed[0][0];

  const chapters = new Set(parsed.map(([, chapter]) => chapter));
  if (chapters.size !== 1) return book;
  return `${book} ${parsed[0][1]}`;
}

/** Pure ranking: pick the strongest unlinked pair. */
export function pickBestUnlinkedPair(
  noteId: string,
  noteTitle: string,
  related: RelatedNote[],
  linkedIds: Set<string>,
  titleById: Map<string, string>,
): RankedPair | null {
  for (const r of related) {
    if (linkedIds.has(r.noteId)) continue;
    const reason = r.sharedPassages.length
      ? 'Shared passage'
      : r.sharedCrossRefs.length
        ? 'Cross-reference'
        : 'Shared theme';
    // Same precedence as `reason` itself, so the subject always describes the signal
    // the pair was actually ranked on.
    const sharedSubject =
      describeSharedPassages(r.sharedPassages) ?? describeSharedPassages(r.sharedCrossRefs);
    const sharedThemeId = sharedSubject ? undefined : r.sharedThemes[0];
    return {
      noteAId: noteId,
      noteATitle: noteTitle,
      noteBId: r.noteId,
      noteBTitle: titleById.get(r.noteId) ?? 'Untitled note',
      reason,
      score: r.score,
      ...(sharedSubject ? { sharedSubject } : {}),
      ...(sharedThemeId ? { sharedThemeId } : {}),
    };
  }
  return null;
}

/**
 * Swap theme ids for their labels, and drop the id from what callers see.
 *
 * One query for the handful of ids in a page of suggestions. A theme that cannot be
 * resolved simply goes unnamed rather than surfacing `topic_assurance` to a reader — the
 * client already knows how to fall back to joining the two note titles.
 */
async function resolveSharedThemeLabels(pairs: RankedPair[]): Promise<ConnectSuggestion[]> {
  const themeIds = [...new Set(pairs.map((p) => p.sharedThemeId).filter((id): id is string => !!id))];

  let labelById = new Map<string, string>();
  if (themeIds.length) {
    try {
      const rows = await db
        .select({ id: ScriptureTopics.id, label: ScriptureTopics.label })
        .from(ScriptureTopics)
        .where(inArray(ScriptureTopics.id, themeIds));
      labelById = new Map(rows.map((r) => [r.id, r.label]));
    } catch {
      // No topic table (or it cannot be read) means no labels — which costs a nicer
      // thread name and nothing else. Not worth failing the whole shelf over.
    }
  }

  return pairs.map(({ sharedThemeId, ...rest }) => {
    const label = sharedThemeId ? labelById.get(sharedThemeId)?.trim() : undefined;
    return label ? { ...rest, sharedSubject: label } : rest;
  });
}

/**
 * Every candidate's passages in two queries instead of two per candidate.
 *
 * `getNotePassages` is the single-note version and stays the right call for a single note.
 * Here it was being awaited once per candidate inside a serial loop, so twenty candidates
 * cost forty round trips before the ranking had even started — and the ranking then paid for
 * more of its own. Same rows, same dedupe, one pass.
 */
async function getNotePassagesBatch(noteIds: string[]): Promise<Map<string, VerseKey[]>> {
  const out = new Map<string, VerseKey[]>();
  if (!noteIds.length) return out;

  // A note's passages are its own scripture metadata plus that of every scripture note it
  // links to, so the linked ids have to be resolved before the metadata can be asked for.
  const links = await db
    .select({ noteId: NoteScriptureReferences.noteId, sid: NoteScriptureReferences.scriptureNoteId })
    .from(NoteScriptureReferences)
    .where(inArray(NoteScriptureReferences.noteId, noteIds));

  const linkedByNote = new Map<string, string[]>();
  for (const l of links) {
    const list = linkedByNote.get(l.noteId);
    if (list) list.push(l.sid);
    else linkedByNote.set(l.noteId, [l.sid]);
  }

  const metadataIds = [...new Set([...noteIds, ...links.map((l) => l.sid)])];
  const rows = await db
    .select({
      noteId: ScriptureMetadata.noteId,
      book: ScriptureMetadata.book,
      chapter: ScriptureMetadata.chapter,
      verse: ScriptureMetadata.verse,
    })
    .from(ScriptureMetadata)
    .where(inArray(ScriptureMetadata.noteId, metadataIds));

  const rowsByNote = new Map<string, VerseKey[]>();
  for (const r of rows) {
    const list = rowsByNote.get(r.noteId);
    const key = { book: r.book, chapter: r.chapter, verse: r.verse };
    if (list) list.push(key);
    else rowsByNote.set(r.noteId, [key]);
  }

  for (const noteId of noteIds) {
    const seen = new Set<string>();
    const passages: VerseKey[] = [];
    for (const sourceId of [noteId, ...(linkedByNote.get(noteId) ?? [])]) {
      for (const v of rowsByNote.get(sourceId) ?? []) {
        const k = `${v.book}|${v.chapter}|${v.verse}`;
        if (seen.has(k)) continue;
        seen.add(k);
        passages.push(v);
      }
    }
    out.set(noteId, passages);
  }

  return out;
}

/**
 * How many candidates are ranked at once.
 *
 * Each ranking pass is four dependent queries, so running them one candidate at a time made
 * the endpoint as slow as twenty of those chains end to end. Four at a time is the useful
 * part of that win without turning one dashboard request into twenty concurrent connections:
 * the Supabase session pooler caps clients per process, and exhausting it surfaces as
 * unrelated requests failing rather than as this one being slow.
 */
const RANKING_CONCURRENCY = 4;

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

  const out: RankedPair[] = [];
  const usedPairs = new Set<string>();
  const candidates = noteIds.slice(0, candidateLimit);

  // Fetched once for the whole run. Every ranking pass below scans the same set — the user's
  // scripture-tagged notes — and differs only by which single note it excludes, so leaving the
  // scan inside the pass meant running it twenty times for twenty one-row differences.
  const [passagesByNote, relatedCandidates] = await Promise.all([
    getNotePassagesBatch(candidates),
    getRelatedNoteCandidates(userId),
  ]);
  // A candidate with no passages has nothing to match on, so it never reaches the ranker.
  // Dropping those here rather than inside the loop means the concurrency below is spent
  // entirely on candidates that can actually produce a pair.
  const rankable = candidates.filter((noteId) => (passagesByNote.get(noteId) ?? []).length > 0);

  /*
   * Ranked a few at a time, still stopping as soon as there are enough suggestions.
   *
   * The early exit is what makes the chunking worth keeping over a plain `Promise.all`: a user
   * whose first four notes yield three pairs pays for one wave, not twenty candidates' worth of
   * queries. The order candidates are considered in is unchanged, and so is the result — the
   * chunk's outcomes are folded back in list order, not completion order, so two runs over the
   * same data still produce the same suggestions in the same sequence.
   */
  for (let i = 0; i < rankable.length && out.length < limit; i += RANKING_CONCURRENCY) {
    const chunk = rankable.slice(i, i + RANKING_CONCURRENCY);
    const ranked = await Promise.all(
      chunk.map(async (noteId) => {
        const related = await getRelatedNotesForPassages(userId, passagesByNote.get(noteId)!, {
          excludeNoteId: noteId,
          limit: 10,
          candidates: relatedCandidates,
        });
        return pickBestUnlinkedPair(
          noteId,
          titleById.get(noteId) ?? 'Untitled note',
          related,
          linkedByNote.get(noteId) ?? new Set(),
          titleById,
        );
      }),
    );

    for (const best of ranked) {
      if (out.length >= limit) break;
      if (!best) continue;
      const pairKey = [best.noteAId, best.noteBId].sort().join('|');
      if (usedPairs.has(pairKey)) continue;
      usedPairs.add(pairKey);
      out.push(best);
    }
  }

  return resolveSharedThemeLabels(out);
}
