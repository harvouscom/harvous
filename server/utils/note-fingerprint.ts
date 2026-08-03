/**
 * Passage memory fingerprints — memory layer Workstream A (the substrate).
 *
 * Assembles one per-note semantic profile and persists it to NoteFingerprints, recomputed on each
 * real save (hooked into process-scripture-references). It unifies signals that already exist but
 * were never gathered in one place — the note's passage themes/people/places (canonical knowledge
 * layer), its prose tags, and a NEW emotional tone (lexicon, no AI) — plus a composite
 * `meaningWeight` that quantifies how much study a note represents.
 *
 * This is the shared foundation the other two workstreams consume: forgetting-aware resurfacing (B)
 * weights notes by `meaningWeight`, and study arcs (C) read `themes` over time. The scoring and
 * assembly are split into PURE functions (`computeMeaningWeight`, `buildNoteFingerprintData`) so
 * they can be unit-tested without a database. See docs/future/MEMORY_LAYER_ASSESSMENT.md.
 */

import {
  db,
  eq,
  and,
  or,
  ne,
  inArray,
  count,
  now,
  Notes,
  Tags,
  NoteTags,
  StudyThreadEntries,
  NoteConnections,
  NoteFingerprints,
} from '../db';
import {
  getNotePassages,
  getKnowledgeForPassages,
  MIN_THEME_CORROBORATION_RELEVANCE,
} from './scripture-knowledge';
import { detectEmotionalTone, type EmotionalTone } from '@/utils/bible-study-tone-lexicon';
import { filterUniversalBibleEntities } from '@/utils/universal-bible-entities';
import { dominantCanonProfile, CANON_BOOK_GROUPS } from '@/utils/admin-pulse-canon-groups';
import {
  isNoteFingerprintsTableMissing,
  isStudyThreadEntriesTableMissing,
  isNoteConnectionsTableMissing,
} from './pg-undefined-relation';

// ─── pure scoring ────────────────────────────────────────────────────────────────

/** The deliberate-study signals that feed `meaningWeight`. All cheap to gather server-side. */
export interface MeaningSignals {
  /** Visible (HTML-stripped) body length in characters. */
  visibleTextLength: number;
  /** Distinct cited passages (own + linked scripture notes). */
  passageCount: number;
  /** Non-archived study-thread highlights anchored on this note. */
  highlightCount: number;
  /** Tags (auto + manual) on this note. */
  tagCount: number;
  /** User pinned the note. */
  isPinned: boolean;
  /** User manually assigned or pinned its folder, or pinned its study-thread name. */
  deliberateOrg: boolean;
  /** Note participates in a trail (created-from link or an explicit connection). */
  hasConnections: boolean;
}

/** Mirrors prototype-home-trends' SUBSTANTIVE_CONTENT_MIN — a "real" note clears this body length. */
const SUBSTANTIVE_CONTENT_MIN = 80;
/** Body length at which the depth signal saturates. */
const DEPTH_SATURATION = 500;

/**
 * Composite meaning score in [0,1]. A weighted sum of saturating signals — body depth, cited
 * passages, deliberate annotation (highlights), tag richness, and explicit organization/connection.
 * Pure and deterministic; weights sum to 1.0 so the result is always in range. Higher = more study
 * invested, which forgetting-aware resurfacing uses to favor meaningful-but-fading notes.
 */
export function computeMeaningWeight(s: MeaningSignals): number {
  const depth = Math.min(1, s.visibleTextLength / DEPTH_SATURATION) * 0.25;
  const passages = Math.min(1, s.passageCount / 4) * 0.2;
  const highlights = Math.min(1, s.highlightCount / 3) * 0.2;
  const tags = Math.min(1, s.tagCount / 5) * 0.1;
  // Deliberate organization + being part of a trail are strong "this mattered to me" signals.
  const intentCount = (s.deliberateOrg ? 1 : 0) + (s.hasConnections ? 1 : 0) + (s.isPinned ? 1 : 0);
  const intent = Math.min(1, intentCount / 2) * 0.25;

  const score = depth + passages + highlights + tags + intent;
  return Math.round(Math.min(1, Math.max(0, score)) * 10000) / 10000;
}

export interface NoteFingerprintData {
  themes: string[];
  people: string[];
  places: string[];
  passageCount: number;
  emotionalTone: EmotionalTone | null;
  toneScores: Partial<Record<EmotionalTone, number>>;
  meaningWeight: number;
  canonSection: string | null;
  canonSectionLabel: string | null;
  testament: 'ot' | 'nt' | null;
  canonSections: string[];
}

const MAX_THEMES = 10;
const MAX_ENTITIES = 12;

/** Case-insensitive dedupe that preserves first-seen order and original casing. Pure. */
function dedupeLabels(labels: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Assemble the fingerprint from already-fetched inputs. Pure. Themes merge the note's prose tags
 * (the user's own language, listed first) with its passage themes (canonical, threshold-filtered
 * upstream), deduped and capped.
 */
export function buildNoteFingerprintData(input: {
  proseTagNames: string[];
  passageThemes: string[];
  people: string[];
  places: string[];
  passageCount: number;
  passageBooks: string[];
  toneText: string;
  signals: MeaningSignals;
}): NoteFingerprintData {
  const themes = dedupeLabels(
    filterUniversalBibleEntities([...input.proseTagNames, ...input.passageThemes]),
    MAX_THEMES,
  );
  const people = dedupeLabels(filterUniversalBibleEntities(input.people), MAX_ENTITIES);
  const places = dedupeLabels(input.places, MAX_ENTITIES);
  const tone = detectEmotionalTone(input.toneText);
  const canon = dominantCanonProfile(input.passageBooks);

  return {
    themes,
    people,
    places,
    passageCount: input.passageCount,
    emotionalTone: tone.tone,
    toneScores: tone.scores,
    meaningWeight: computeMeaningWeight(input.signals),
    canonSection: canon.sectionId,
    canonSectionLabel: canon.sectionLabel,
    testament: canon.testament,
    canonSections: canon.sectionIds,
  };
}

/** HTML-stripped visible text — same approach as prototype-home-trends' htmlTextLength. */
export function htmlToVisibleText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── DB orchestration (non-throwing) ──────────────────────────────────────────────

/** Count non-archived highlights anchored on a note; 0 if the table isn't pushed yet. */
async function countHighlights(noteId: string): Promise<number> {
  try {
    const row = (
      await db
        .select({ c: count() })
        .from(StudyThreadEntries)
        .where(and(eq(StudyThreadEntries.parentNoteId, noteId), eq(StudyThreadEntries.isArchived, false)))
    )[0];
    return row?.c ?? 0;
  } catch (err) {
    if (isStudyThreadEntriesTableMissing(err)) return 0;
    throw err;
  }
}

/** Whether a note participates in any explicit connection (either direction); false if table missing. */
async function hasNoteConnections(noteId: string): Promise<boolean> {
  try {
    const row = (
      await db
        .select({ id: NoteConnections.id })
        .from(NoteConnections)
        .where(or(eq(NoteConnections.fromNoteId, noteId), eq(NoteConnections.toNoteId, noteId)))
        .limit(1)
    )[0];
    return !!row;
  } catch (err) {
    if (isNoteConnectionsTableMissing(err)) return false;
    throw err;
  }
}

/**
 * Recompute and persist a note's passage memory fingerprint. Non-throwing: any failure logs and
 * returns null so fingerprinting can never break a save. Scripture notes (auto-created verse notes)
 * are skipped — fingerprints describe a user's own study. Runs in the save pipeline's post-idle
 * enrichment block, off the typing hot path.
 */
export async function computeAndStoreNoteFingerprint(
  noteId: string,
  userId: string,
): Promise<NoteFingerprintData | null> {
  try {
    const note = (
      await db
        .select({
          content: Notes.content,
          title: Notes.title,
          noteType: Notes.noteType,
          isPinned: Notes.isPinned,
          collectionUserOverride: Notes.collectionUserOverride,
          collectionPinned: Notes.collectionPinned,
          studyThreadPinned: Notes.studyThreadPinned,
          linkedFromNoteId: Notes.linkedFromNoteId,
        })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
        .limit(1)
    )[0];
    if (!note) return null;
    if (note.noteType === 'scripture') return null;

    const passages = await getNotePassages(noteId);
    const knowledge = passages.length
      ? await getKnowledgeForPassages(passages, {
          minRelevance: MIN_THEME_CORROBORATION_RELEVANCE,
          themeLimit: MAX_THEMES,
        })
      : { themes: [], people: [], places: [] };

    const tagRows = await db
      .select({ name: Tags.name })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(eq(NoteTags.noteId, noteId));

    const [highlightCount, hasConnections] = await Promise.all([
      countHighlights(noteId),
      note.linkedFromNoteId ? Promise.resolve(true) : hasNoteConnections(noteId),
    ]);

    const visibleText = htmlToVisibleText(note.content);
    const signals: MeaningSignals = {
      visibleTextLength: visibleText.length,
      passageCount: passages.length,
      highlightCount,
      tagCount: tagRows.length,
      isPinned: note.isPinned,
      deliberateOrg: note.collectionUserOverride || note.collectionPinned || note.studyThreadPinned,
      hasConnections,
    };

    const data = buildNoteFingerprintData({
      proseTagNames: tagRows.map((t) => t.name),
      passageThemes: knowledge.themes.map((t) => t.label),
      people: knowledge.people.map((p) => p.name),
      places: knowledge.places.map((p) => p.name),
      passageCount: passages.length,
      passageBooks: passages.map((p) => p.book),
      // Title + body: the tone of a note lives in both the heading and the reflection.
      toneText: `${note.title ?? ''} ${visibleText}`.trim(),
      signals,
    });

    await persistFingerprint(noteId, userId, data);
    return data;
  } catch (err) {
    console.error(
      '[computeAndStoreNoteFingerprint] non-critical failure:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Upsert the fingerprint row (PK = noteId). Swallows missing-table until db:push is applied. */
async function persistFingerprint(noteId: string, userId: string, data: NoteFingerprintData): Promise<void> {
  const row = {
    noteId,
    userId,
    themes: JSON.stringify(data.themes),
    people: JSON.stringify(data.people),
    places: JSON.stringify(data.places),
    passageCount: data.passageCount,
    emotionalTone: data.emotionalTone,
    toneScores: JSON.stringify(data.toneScores),
    meaningWeight: data.meaningWeight,
    canonSection: data.canonSection,
    testament: data.testament,
    canonSections: JSON.stringify(data.canonSections),
    computedAt: now(),
  };
  try {
    await db
      .insert(NoteFingerprints)
      .values(row)
      .onConflictDoUpdate({
        target: NoteFingerprints.noteId,
        set: {
          themes: row.themes,
          people: row.people,
          places: row.places,
          passageCount: row.passageCount,
          emotionalTone: row.emotionalTone,
          toneScores: row.toneScores,
          meaningWeight: row.meaningWeight,
          canonSection: row.canonSection,
          testament: row.testament,
          canonSections: row.canonSections,
          computedAt: row.computedAt,
        },
      });
  } catch (err) {
    if (isNoteFingerprintsTableMissing(err)) {
      console.warn('[note-fingerprint] NoteFingerprints table missing; skipping. Run `npm run db:push`.');
      return;
    }
    throw err;
  }
}

// ─── reader ────────────────────────────────────────────────────────────────────────

export interface StoredNoteFingerprint extends NoteFingerprintData {
  noteId: string;
  computedAt: Date;
  recallStabilityDays: number | null;
  lastRecallEngagedAt: Date | null;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function deserializeFingerprint(row: typeof NoteFingerprints.$inferSelect): StoredNoteFingerprint {
  let toneScores: Partial<Record<EmotionalTone, number>> = {};
  if (row.toneScores) {
    try {
      toneScores = JSON.parse(row.toneScores) as Partial<Record<EmotionalTone, number>>;
    } catch {
      toneScores = {};
    }
  }
  const canonSection = row.canonSection ?? null;
  const sectionLabel =
    canonSection != null ? CANON_BOOK_GROUPS.find((g) => g.id === canonSection)?.label ?? null : null;
  return {
    noteId: row.noteId,
    themes: parseJsonArray(row.themes),
    people: parseJsonArray(row.people),
    places: parseJsonArray(row.places),
    passageCount: row.passageCount,
    emotionalTone: (row.emotionalTone as EmotionalTone | null) ?? null,
    toneScores,
    meaningWeight: row.meaningWeight,
    canonSection,
    canonSectionLabel: sectionLabel,
    testament: row.testament === 'ot' || row.testament === 'nt' ? row.testament : null,
    canonSections: parseJsonArray(row.canonSections),
    computedAt: row.computedAt,
    recallStabilityDays: row.recallStabilityDays ?? null,
    lastRecallEngagedAt: row.lastRecallEngagedAt ?? null,
  };
}

/** Read one note's stored fingerprint, or null if not computed yet / table missing. */
export async function getNoteFingerprint(noteId: string): Promise<StoredNoteFingerprint | null> {
  try {
    const row = (await db.select().from(NoteFingerprints).where(eq(NoteFingerprints.noteId, noteId)).limit(1))[0];
    return row ? deserializeFingerprint(row) : null;
  } catch (err) {
    if (isNoteFingerprintsTableMissing(err)) return null;
    throw err;
  }
}

/**
 * Read all of a user's fingerprints (for resurfacing / arcs). Empty if table missing.
 *
 * Joined to Notes so a fingerprint whose note is gone can never come back. Most Home
 * consumers look fingerprints up by live note id and so were already safe, but the
 * greeting's canon-section line iterates every fingerprint — deleted notes kept
 * steering it. The delete cascade now removes these rows too; the join also cleans up
 * rows orphaned before that fix, without needing a backfill.
 */
export async function getUserNoteFingerprints(userId: string): Promise<StoredNoteFingerprint[]> {
  try {
    const rows = await db
      .select()
      .from(NoteFingerprints)
      .innerJoin(
        Notes,
        and(eq(Notes.id, NoteFingerprints.noteId), eq(Notes.userId, NoteFingerprints.userId)),
      )
      .where(eq(NoteFingerprints.userId, userId));
    return rows.map((row) => deserializeFingerprint(row.NoteFingerprints));
  } catch (err) {
    if (isNoteFingerprintsTableMissing(err)) return [];
    throw err;
  }
}

/** Notes that have no fingerprint yet (for the backfill script). Returns note ids. */
export async function findNotesMissingFingerprint(userId: string): Promise<string[]> {
  const existing = new Set((await getUserNoteFingerprints(userId)).map((f) => f.noteId));
  const notes = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')));
  return notes.map((n) => n.id).filter((id) => !existing.has(id));
}
