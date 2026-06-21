/**
 * Connection layer over the shared scripture-knowledge data (Phase 1).
 *
 * Two read paths, both deterministic (no AI):
 *   - getKnowledgeForReference(book, ch, v): everything the canonical layer knows about a
 *     passage — cross-references, themes, people, places.
 *   - getRelatedNotesForNote(noteId): the user's OTHER notes that connect to this one through
 *     a shared passage, a cross-reference, or a shared theme — the "you've written about this
 *     before" engine.
 *
 * The scoring/aggregation is split into a pure, unit-tested `rankRelatedNotes` so the SQL
 * assembly and the ranking logic can be reasoned about separately. The join key throughout is
 * (book, chapter, verse) against ScriptureMetadata. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import {
  db,
  eq,
  and,
  or,
  ne,
  gte,
  desc,
  inArray,
  Notes,
  ScriptureMetadata,
  NoteScriptureReferences,
  ScriptureCrossReferences,
  ScriptureTopics,
  ScriptureTopicVerses,
  BiblePeople,
  BiblePlaces,
  ScriptureEntityRefs,
} from '../db';
import { normalizePlaceName } from '@/utils/bible-place-name';

export interface VerseKey {
  book: string;
  chapter: number;
  verse: number;
}

export interface CrossReference {
  book: string;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number;
  verseEnd: number;
  votes: number;
}

export interface ThemeRef {
  topicId: string;
  slug: string;
  label: string;
  relevance: number;
}

export interface EntityRef {
  id: string;
  slug: string;
  name: string;
}

export interface PassageKnowledge {
  reference: VerseKey;
  crossReferences: CrossReference[];
  themes: ThemeRef[];
  people: EntityRef[];
  places: EntityRef[];
}

const verseKey = (v: VerseKey) => `${v.book}|${v.chapter}|${v.verse}`;

/**
 * Relevance floor for surfacing an OpenBible topic edge in product UI. OpenBible topic breadth is
 * noisy; below this an edge is incidental and should not be shown (dock strip) or used to corroborate
 * a tag (passage-aware-tags). Single source of truth — passage-aware-tags imports this.
 */
export const MIN_THEME_CORROBORATION_RELEVANCE = 50;

// ─── getKnowledgeForReference ───────────────────────────────────────────────────

export interface KnowledgeOptions {
  crossRefLimit?: number;
  themeLimit?: number;
  minVotes?: number;
  minRelevance?: number;
}

/** Everything the canonical layer knows about a single passage. */
export async function getKnowledgeForReference(
  book: string,
  chapter: number,
  verse: number,
  opts: KnowledgeOptions = {},
): Promise<PassageKnowledge> {
  const { crossRefLimit = 12, themeLimit = 12, minVotes = 1, minRelevance = 0 } = opts;
  const here = and(
    eq(ScriptureCrossReferences.fromBook, book),
    eq(ScriptureCrossReferences.fromChapter, chapter),
    eq(ScriptureCrossReferences.fromVerse, verse),
  );

  const crossReferences = await db
    .select({
      book: ScriptureCrossReferences.toBook,
      chapterStart: ScriptureCrossReferences.toChapterStart,
      chapterEnd: ScriptureCrossReferences.toChapterEnd,
      verseStart: ScriptureCrossReferences.toVerseStart,
      verseEnd: ScriptureCrossReferences.toVerseEnd,
      votes: ScriptureCrossReferences.votes,
    })
    .from(ScriptureCrossReferences)
    .where(and(here, gte(ScriptureCrossReferences.votes, minVotes)))
    .orderBy(desc(ScriptureCrossReferences.votes))
    .limit(crossRefLimit);

  const themes = await db
    .select({
      topicId: ScriptureTopics.id,
      slug: ScriptureTopics.slug,
      label: ScriptureTopics.label,
      relevance: ScriptureTopicVerses.relevance,
    })
    .from(ScriptureTopicVerses)
    .innerJoin(ScriptureTopics, eq(ScriptureTopicVerses.topicId, ScriptureTopics.id))
    .where(
      and(
        eq(ScriptureTopicVerses.book, book),
        eq(ScriptureTopicVerses.chapter, chapter),
        eq(ScriptureTopicVerses.verse, verse),
        gte(ScriptureTopicVerses.relevance, minRelevance),
      ),
    )
    .orderBy(desc(ScriptureTopicVerses.relevance))
    .limit(themeLimit);

  const atVerse = (type: 'person' | 'place') =>
    and(
      eq(ScriptureEntityRefs.entityType, type),
      eq(ScriptureEntityRefs.book, book),
      eq(ScriptureEntityRefs.chapter, chapter),
      eq(ScriptureEntityRefs.verse, verse),
    );

  const people = await db
    .select({ id: BiblePeople.id, slug: BiblePeople.slug, name: BiblePeople.name })
    .from(ScriptureEntityRefs)
    .innerJoin(BiblePeople, eq(ScriptureEntityRefs.entityId, BiblePeople.id))
    .where(atVerse('person'));

  const places = await db
    .select({ id: BiblePlaces.id, slug: BiblePlaces.slug, name: BiblePlaces.name })
    .from(ScriptureEntityRefs)
    .innerJoin(BiblePlaces, eq(ScriptureEntityRefs.entityId, BiblePlaces.id))
    .where(atVerse('place'));

  return {
    reference: { book, chapter, verse },
    crossReferences,
    themes,
    people,
    places: places.map((p) => ({ ...p, name: normalizePlaceName(p.name) })),
  };
}

// ─── passage aggregation (for related-notes + passage-aware tagging) ─────────────

/** A note's cited passages — its own ScriptureMetadata plus any linked scripture notes, deduped. */
export async function getNotePassages(noteId: string): Promise<VerseKey[]> {
  const linked = await db
    .select({ sid: NoteScriptureReferences.scriptureNoteId })
    .from(NoteScriptureReferences)
    .where(eq(NoteScriptureReferences.noteId, noteId));
  const ids = [noteId, ...linked.map((l) => l.sid)];
  const rows = await db
    .select({ book: ScriptureMetadata.book, chapter: ScriptureMetadata.chapter, verse: ScriptureMetadata.verse })
    .from(ScriptureMetadata)
    .where(inArray(ScriptureMetadata.noteId, ids));
  const seen = new Set<string>();
  const out: VerseKey[] = [];
  for (const r of rows) {
    const k = verseKey(r);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

export interface PassagesKnowledge {
  people: EntityRef[];
  places: EntityRef[];
  themes: ThemeRef[];
}

/** Themes + entities aggregated across a set of passages (deduped; max relevance per theme). */
export async function getKnowledgeForPassages(
  passages: VerseKey[],
  opts: { themeLimit?: number; minRelevance?: number } = {},
): Promise<PassagesKnowledge> {
  const { themeLimit = 25, minRelevance = 0 } = opts;
  const ps = passages.slice(0, 30);
  if (!ps.length) return { people: [], places: [], themes: [] };

  const entityAt = or(
    ...ps.map((p) => and(eq(ScriptureEntityRefs.book, p.book), eq(ScriptureEntityRefs.chapter, p.chapter), eq(ScriptureEntityRefs.verse, p.verse))),
  );
  const peopleRows = await db
    .select({ id: BiblePeople.id, slug: BiblePeople.slug, name: BiblePeople.name })
    .from(ScriptureEntityRefs)
    .innerJoin(BiblePeople, eq(ScriptureEntityRefs.entityId, BiblePeople.id))
    .where(and(eq(ScriptureEntityRefs.entityType, 'person'), entityAt));
  const placeRows = await db
    .select({ id: BiblePlaces.id, slug: BiblePlaces.slug, name: BiblePlaces.name })
    .from(ScriptureEntityRefs)
    .innerJoin(BiblePlaces, eq(ScriptureEntityRefs.entityId, BiblePlaces.id))
    .where(and(eq(ScriptureEntityRefs.entityType, 'place'), entityAt));

  const topicAt = or(
    ...ps.map((p) => and(eq(ScriptureTopicVerses.book, p.book), eq(ScriptureTopicVerses.chapter, p.chapter), eq(ScriptureTopicVerses.verse, p.verse))),
  );
  const themeRows = await db
    .select({ topicId: ScriptureTopics.id, slug: ScriptureTopics.slug, label: ScriptureTopics.label, relevance: ScriptureTopicVerses.relevance })
    .from(ScriptureTopicVerses)
    .innerJoin(ScriptureTopics, eq(ScriptureTopicVerses.topicId, ScriptureTopics.id))
    .where(and(topicAt, gte(ScriptureTopicVerses.relevance, minRelevance)))
    .orderBy(desc(ScriptureTopicVerses.relevance));

  const dedupeEntities = (rows: EntityRef[]) => {
    const seen = new Set<string>();
    const out: EntityRef[] = [];
    for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    return out;
  };
  const byTopic = new Map<string, ThemeRef>();
  for (const t of themeRows) {
    const ex = byTopic.get(t.topicId);
    if (!ex || t.relevance > ex.relevance) byTopic.set(t.topicId, t);
  }
  const themes = [...byTopic.values()].sort((a, b) => b.relevance - a.relevance).slice(0, themeLimit);

  return {
    people: dedupeEntities(peopleRows),
    places: dedupeEntities(placeRows).map((p) => ({ ...p, name: normalizePlaceName(p.name) })),
    themes,
  };
}

// ─── rankRelatedNotes (pure) ────────────────────────────────────────────────────

export type RelatedSignalKind = 'passage' | 'crossref' | 'theme';

export interface RelatedSignal {
  noteId: string;
  kind: RelatedSignalKind;
  /** Stable identifier for the shared thing (a verse key, or a theme label) — used for dedup. */
  detail: string;
}

export interface RelatedNote {
  noteId: string;
  score: number;
  sharedPassages: string[];
  sharedCrossRefs: string[];
  sharedThemes: string[];
}

const SIGNAL_WEIGHT: Record<RelatedSignalKind, number> = { passage: 3, crossref: 2, theme: 1 };
// A note sharing many themes shouldn't drown out a shared passage; cap theme contribution.
const MAX_THEME_SIGNALS = 5;

/**
 * Aggregate per-note signals into a ranked list. Pure so it can be unit-tested without a DB:
 * each distinct (kind, detail) counts once per note; theme contribution is capped; ties break
 * on noteId for determinism.
 */
export function rankRelatedNotes(signals: RelatedSignal[], opts: { limit?: number } = {}): RelatedNote[] {
  const { limit = 10 } = opts;
  const byNote = new Map<string, { passages: Set<string>; crossrefs: Set<string>; themes: Set<string> }>();

  for (const s of signals) {
    let entry = byNote.get(s.noteId);
    if (!entry) {
      entry = { passages: new Set(), crossrefs: new Set(), themes: new Set() };
      byNote.set(s.noteId, entry);
    }
    if (s.kind === 'passage') entry.passages.add(s.detail);
    else if (s.kind === 'crossref') entry.crossrefs.add(s.detail);
    else entry.themes.add(s.detail);
  }

  const ranked: RelatedNote[] = [];
  for (const [noteId, e] of byNote) {
    const themeCount = Math.min(e.themes.size, MAX_THEME_SIGNALS);
    const score =
      e.passages.size * SIGNAL_WEIGHT.passage +
      e.crossrefs.size * SIGNAL_WEIGHT.crossref +
      themeCount * SIGNAL_WEIGHT.theme;
    if (score <= 0) continue;
    ranked.push({
      noteId,
      score,
      sharedPassages: [...e.passages],
      sharedCrossRefs: [...e.crossrefs],
      sharedThemes: [...e.themes],
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId));
  return ranked.slice(0, limit);
}

// ─── getRelatedNotesForNote ─────────────────────────────────────────────────────

export interface RelatedNotesOptions {
  limit?: number;
  maxThemes?: number;
  maxCrossRefs?: number;
}

export interface RelatedNotesForPassagesOptions extends RelatedNotesOptions {
  /** When set, exclude this note from candidate matches (e.g. the source note). */
  excludeNoteId?: string;
}

/**
 * The user's other notes that connect to the given source passages via shared passages,
 * cross-refs, or themes — the passage-first variant of getRelatedNotesForNote.
 */
export async function getRelatedNotesForPassages(
  userId: string,
  sourcePassages: VerseKey[],
  opts: RelatedNotesForPassagesOptions = {},
): Promise<RelatedNote[]> {
  const { limit = 10, maxThemes = 25, maxCrossRefs = 80, excludeNoteId } = opts;

  const deduped: VerseKey[] = [];
  const sourceKeys = new Set<string>();
  for (const p of sourcePassages) {
    const k = verseKey(p);
    if (!sourceKeys.has(k)) {
      sourceKeys.add(k);
      deduped.push(p);
    }
  }
  if (sourceKeys.size === 0) return [];

  const passageMatch = deduped.slice(0, 50);
  const anyOf = (b: typeof ScriptureCrossReferences.fromBook | typeof ScriptureTopicVerses.book, c: any, v: any) =>
    or(...passageMatch.map((p) => and(eq(b, p.book), eq(c, p.chapter), eq(v, p.verse))));

  const crossRows = await db
    .select({
      book: ScriptureCrossReferences.toBook,
      chapter: ScriptureCrossReferences.toChapterStart,
      verse: ScriptureCrossReferences.toVerseStart,
    })
    .from(ScriptureCrossReferences)
    .where(anyOf(ScriptureCrossReferences.fromBook, ScriptureCrossReferences.fromChapter, ScriptureCrossReferences.fromVerse))
    .orderBy(desc(ScriptureCrossReferences.votes))
    .limit(maxCrossRefs);
  const crossRefKeys = new Set(crossRows.map(verseKey));

  const themeRows = await db
    .select({ topicId: ScriptureTopicVerses.topicId, relevance: ScriptureTopicVerses.relevance })
    .from(ScriptureTopicVerses)
    .where(anyOf(ScriptureTopicVerses.book, ScriptureTopicVerses.chapter, ScriptureTopicVerses.verse))
    .orderBy(desc(ScriptureTopicVerses.relevance))
    .limit(maxThemes);
  const themeIds = [...new Set(themeRows.map((t) => t.topicId))];

  const candidateWhere = excludeNoteId
    ? and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture'), ne(ScriptureMetadata.noteId, excludeNoteId))
    : and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture'));

  const candidates = await db
    .select({ noteId: ScriptureMetadata.noteId, book: ScriptureMetadata.book, chapter: ScriptureMetadata.chapter, verse: ScriptureMetadata.verse })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(candidateWhere);

  const verseToNotes = new Map<string, Set<string>>();
  for (const c of candidates) {
    const key = verseKey(c);
    if (!verseToNotes.has(key)) verseToNotes.set(key, new Set());
    verseToNotes.get(key)!.add(c.noteId);
  }

  const signals: RelatedSignal[] = [];
  for (const c of candidates) {
    const key = verseKey(c);
    if (sourceKeys.has(key)) signals.push({ noteId: c.noteId, kind: 'passage', detail: key });
    if (crossRefKeys.has(key)) signals.push({ noteId: c.noteId, kind: 'crossref', detail: key });
  }

  if (themeIds.length && verseToNotes.size) {
    const candidateBooks = [...new Set(candidates.map((c) => c.book))];
    const themeHits = await db
      .select({ topicId: ScriptureTopicVerses.topicId, book: ScriptureTopicVerses.book, chapter: ScriptureTopicVerses.chapter, verse: ScriptureTopicVerses.verse })
      .from(ScriptureTopicVerses)
      .where(and(inArray(ScriptureTopicVerses.topicId, themeIds), inArray(ScriptureTopicVerses.book, candidateBooks)));
    for (const hit of themeHits) {
      const notes = verseToNotes.get(verseKey(hit));
      if (!notes) continue;
      for (const nid of notes) signals.push({ noteId: nid, kind: 'theme', detail: hit.topicId });
    }
  }

  return rankRelatedNotes(signals, { limit });
}

/** The user's other notes that connect to this one via shared passages, cross-refs, or themes. */
export async function getRelatedNotesForNote(
  noteId: string,
  opts: RelatedNotesOptions = {},
): Promise<RelatedNote[]> {
  const note = (await db.select({ id: Notes.id, userId: Notes.userId }).from(Notes).where(eq(Notes.id, noteId)).limit(1))[0];
  if (!note) return [];

  const sourcePassages = await getNotePassages(noteId);
  if (sourcePassages.length === 0) return [];

  return getRelatedNotesForPassages(note.userId, sourcePassages, { ...opts, excludeNoteId: noteId });
}

// ─── getPassageContext (dock passage context strip) ──────────────────────────────

export interface PassageRelatedNote {
  noteId: string;
  title: string;
  /** Why this note connects — derived from the strongest shared signal. */
  reason: 'Same passage' | 'Cross-reference' | 'Shared theme';
}

export interface PassageContext {
  themes: ThemeRef[];
  crossReferences: CrossReference[];
  people: EntityRef[];
  places: EntityRef[];
  relatedNotes: PassageRelatedNote[];
}

export interface PassageContextOptions {
  excludeNoteId?: string;
  themeLimit?: number;
  crossRefLimit?: number;
  entityLimit?: number;
  relatedLimit?: number;
}

/** Strongest shared signal first — matches the SIGNAL_WEIGHT ordering in rankRelatedNotes. Pure. */
export function relatedNoteReason(r: RelatedNote): PassageRelatedNote['reason'] {
  if (r.sharedPassages.length) return 'Same passage';
  if (r.sharedCrossRefs.length) return 'Cross-reference';
  return 'Shared theme';
}

/** Merge cross-ref rows by target ref (keep highest votes), sort desc, cap. Pure. */
export function mergeCrossReferences(rows: CrossReference[], limit: number): CrossReference[] {
  const byTarget = new Map<string, CrossReference>();
  for (const cr of rows) {
    const k = `${cr.book}|${cr.chapterStart}|${cr.verseStart}|${cr.chapterEnd}|${cr.verseEnd}`;
    const existing = byTarget.get(k);
    if (!existing || cr.votes > existing.votes) byTarget.set(k, cr);
  }
  return [...byTarget.values()].sort((a, b) => b.votes - a.votes).slice(0, limit);
}

/**
 * Everything the scripture dock's passage context strip needs for a displayed passage (which may
 * span a verse range): themes, cross-references, people/places, and the user's other notes that
 * connect. Composes the existing deterministic read paths — no AI, no new datasets. Themes are
 * threshold-filtered with MIN_THEME_CORROBORATION_RELEVANCE so weak OpenBible edges never surface.
 */
export async function getPassageContext(
  userId: string,
  passages: VerseKey[],
  opts: PassageContextOptions = {},
): Promise<PassageContext> {
  const { excludeNoteId, themeLimit = 5, crossRefLimit = 6, entityLimit = 8, relatedLimit = 5 } = opts;

  const ps = passages.slice(0, 30);
  if (!ps.length) {
    return { themes: [], crossReferences: [], people: [], places: [], relatedNotes: [] };
  }

  // Themes + entities aggregated + deduped across the verse range (threshold-filtered themes).
  const { themes, people, places } = await getKnowledgeForPassages(ps, {
    minRelevance: MIN_THEME_CORROBORATION_RELEVANCE,
    themeLimit,
  });

  // Cross-refs across the range in one query, merged by target ref keeping the highest votes.
  const fromAnyVerse = or(
    ...ps.map((p) =>
      and(
        eq(ScriptureCrossReferences.fromBook, p.book),
        eq(ScriptureCrossReferences.fromChapter, p.chapter),
        eq(ScriptureCrossReferences.fromVerse, p.verse),
      ),
    ),
  );
  const crossRows = await db
    .select({
      book: ScriptureCrossReferences.toBook,
      chapterStart: ScriptureCrossReferences.toChapterStart,
      chapterEnd: ScriptureCrossReferences.toChapterEnd,
      verseStart: ScriptureCrossReferences.toVerseStart,
      verseEnd: ScriptureCrossReferences.toVerseEnd,
      votes: ScriptureCrossReferences.votes,
    })
    .from(ScriptureCrossReferences)
    .where(and(fromAnyVerse, gte(ScriptureCrossReferences.votes, 1)))
    .orderBy(desc(ScriptureCrossReferences.votes));
  const crossReferences = mergeCrossReferences(crossRows, crossRefLimit);

  // The user's other notes connected to this passage, hydrated with titles + a reason.
  const related = await getRelatedNotesForPassages(userId, ps, { excludeNoteId, limit: relatedLimit });
  let relatedNotes: PassageRelatedNote[] = [];
  if (related.length) {
    const titleRows = await db
      .select({ id: Notes.id, title: Notes.title })
      .from(Notes)
      .where(inArray(Notes.id, related.map((r) => r.noteId)));
    const titleById = new Map(titleRows.map((r) => [r.id, r.title]));
    relatedNotes = related.map((r) => ({
      noteId: r.noteId,
      title: titleById.get(r.noteId)?.trim() || 'Untitled note',
      reason: relatedNoteReason(r),
    }));
  }

  return {
    themes: themes.slice(0, themeLimit),
    crossReferences,
    people: people.slice(0, entityLimit),
    places: places.slice(0, entityLimit),
    relatedNotes,
  };
}

// ─── per-user passage knowledge (compact, client-cacheable) ──────────────────────

export interface PassageKnowledgeEntry {
  themes: string[];
  people: string[];
  places: string[];
}

/** Keyed by "book|chapter|verse". */
export type UserPassageKnowledge = Record<string, PassageKnowledgeEntry>;

/**
 * Compact passage knowledge for every verse a user has cited: top themes + the people and places
 * mentioned. Bounded by the user's distinct references, so it's small enough to ship to the
 * client (cached offline) for passage-aware folder/tag suggestions without exposing the whole
 * knowledge layer. Queried in chunks to keep each SQL statement bounded.
 */
export async function getUserPassageKnowledge(
  userId: string,
  opts: { themesPerVerse?: number } = {},
): Promise<UserPassageKnowledge> {
  const themesPerVerse = opts.themesPerVerse ?? 5;

  const cited = await db
    .select({ book: ScriptureMetadata.book, chapter: ScriptureMetadata.chapter, verse: ScriptureMetadata.verse })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(eq(Notes.userId, userId));

  const verses: VerseKey[] = [];
  const seen = new Set<string>();
  for (const r of cited) {
    const k = verseKey(r);
    if (!seen.has(k)) { seen.add(k); verses.push(r); }
  }

  const out: UserPassageKnowledge = {};
  if (!verses.length) return out;
  const entry = (k: string): PassageKnowledgeEntry => (out[k] ??= { themes: [], people: [], places: [] });

  const CHUNK = 150;
  for (let i = 0; i < verses.length; i += CHUNK) {
    const chunk = verses.slice(i, i + CHUNK);

    const peopleRows = await db
      .select({ book: ScriptureEntityRefs.book, chapter: ScriptureEntityRefs.chapter, verse: ScriptureEntityRefs.verse, name: BiblePeople.name })
      .from(ScriptureEntityRefs)
      .innerJoin(BiblePeople, eq(ScriptureEntityRefs.entityId, BiblePeople.id))
      .where(and(eq(ScriptureEntityRefs.entityType, 'person'), or(...chunk.map((p) => and(eq(ScriptureEntityRefs.book, p.book), eq(ScriptureEntityRefs.chapter, p.chapter), eq(ScriptureEntityRefs.verse, p.verse))))));
    for (const r of peopleRows) { const e = entry(verseKey(r)); if (!e.people.includes(r.name)) e.people.push(r.name); }

    const placeRows = await db
      .select({ book: ScriptureEntityRefs.book, chapter: ScriptureEntityRefs.chapter, verse: ScriptureEntityRefs.verse, name: BiblePlaces.name })
      .from(ScriptureEntityRefs)
      .innerJoin(BiblePlaces, eq(ScriptureEntityRefs.entityId, BiblePlaces.id))
      .where(and(eq(ScriptureEntityRefs.entityType, 'place'), or(...chunk.map((p) => and(eq(ScriptureEntityRefs.book, p.book), eq(ScriptureEntityRefs.chapter, p.chapter), eq(ScriptureEntityRefs.verse, p.verse))))));
    for (const r of placeRows) {
      const e = entry(verseKey(r));
      const nm = normalizePlaceName(r.name);
      if (!e.places.includes(nm)) e.places.push(nm);
    }

    const themeRows = await db
      .select({ book: ScriptureTopicVerses.book, chapter: ScriptureTopicVerses.chapter, verse: ScriptureTopicVerses.verse, label: ScriptureTopics.label })
      .from(ScriptureTopicVerses)
      .innerJoin(ScriptureTopics, eq(ScriptureTopicVerses.topicId, ScriptureTopics.id))
      .where(or(...chunk.map((p) => and(eq(ScriptureTopicVerses.book, p.book), eq(ScriptureTopicVerses.chapter, p.chapter), eq(ScriptureTopicVerses.verse, p.verse)))))
      .orderBy(desc(ScriptureTopicVerses.relevance));
    for (const r of themeRows) {
      const e = entry(verseKey(r));
      if (e.themes.length < themesPerVerse) e.themes.push(r.label);
    }
  }

  return out;
}
