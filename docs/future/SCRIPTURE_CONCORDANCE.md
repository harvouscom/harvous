# Scripture Concordance

Word-level search over Scripture — "every verse containing *redeem*, *redeemed*, or
*redemption*, across every translation" — as a query-time capability on `BibleVerses`, not a
new authored dataset. Sits alongside the [Scripture Knowledge
Layer](./SCRIPTURE_KNOWLEDGE_LAYER.md) as an enrichment source, not a fifth canonical table.

**Status:** Scoped, not built. This doc is the plan. (Revision 2 — the original draft proposed a
hand-built stem/entries schema + a new npm stemmer; that's unnecessary. See "What changed" below.)

---

## The core insight: this is already a solved problem in this codebase

`server/routes/search.ts` already does exactly this — Postgres full-text search over `Notes`/
`Threads` via `to_tsvector('english', …)` / `plainto_tsquery('english', …)` / `ts_rank`, backed
by GIN indices (`scripts/add-fts-indices.sql`). Postgres's `'english'` text search configuration
already stems on the fly — `redeem`/`redeemed`/`redemption`/`redeemer` all match a query for
"redeem" today, for any column indexed that way, with **zero new code, tables, or dependencies.**

`BibleVerses` (`server/db/schema.ts`) already holds the full text of all 7 complete translations.
So "word-level search across all Scripture and all translations" is: add one GIN index, run the
same `to_tsvector`/`plainto_tsquery`/`ts_rank` query already proven in `search.ts`, against
`BibleVerses` instead of `Notes`. No batch-built concordance index, no per-translation seed
script, no new dependency.

## What changed from the first draft

The original plan proposed `ScriptureConcordanceStems`/`ScriptureConcordanceEntries` tables, a
new Porter/Snowball npm stemmer, and a `build-concordance.ts` batch pipeline per translation.
Dropped, because:

- Postgres's built-in English stemmer **is** a Snowball stemmer — that dependency already exists,
  inside Postgres, and this codebase already leans on it.
- A batch-built entries table only pays off if lookups need to be faster than an index scan can
  give you, or if you need structure FTS doesn't give you (e.g., a clean "these are the surface
  forms that matched" list for display) — worth revisiting only if real usage shows GIN-index
  query latency or ranking quality isn't good enough. Not worth building speculatively.
- Cross-translation search becomes trivial as a side effect: a plain `WHERE` clause (or no
  translation filter at all) instead of choosing which per-translation table to build first.

The one piece of the original plan that **doesn't** go away: Postgres's `'english'` FTS
dictionary doesn't know KJV's archaic verb suffixes (`loveth`, `believeth`, `knoweth`) — those
aren't real modern-English words, so the built-in stemmer won't fold them into `love`/`believe`/
`know`. That's now a narrow, isolated problem instead of the shape of the whole feature (see
below), and it's fine to ship without it and add later if it turns out to matter.

---

## Design

### Indexing

```sql
-- mirrors scripts/add-fts-indices.sql exactly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bibleverses_fts
  ON "BibleVerses"
  USING GIN (to_tsvector('english', text));
```

One index, all translations, all books — `translationId` stays a plain `WHERE` filter (or is
omitted entirely for a true cross-translation query), using the existing
`BibleVerses_lookup` index for the narrowing case and the new GIN index for the text match.

### Query

Same shape as `search.ts`'s existing note search:

```ts
const tsQuery = sql`plainto_tsquery('english', ${query})`;
const verseTsVector = sql`to_tsvector('english', ${BibleVerses.text})`;

db.select(...)
  .from(BibleVerses)
  .where(and(
    eq(BibleVerses.translationId, translationId), // omit to search across all translations
    sql`${verseTsVector} @@ ${tsQuery}`,
  ))
  .orderBy(sql`ts_rank(${verseTsVector}, ${tsQuery}) DESC`)
  .limit(limit);
```

`ts_headline('english', text, tsQuery)` gets you the matched word bolded in context for free too
— useful for a concordance-style result list ("...for **God** so loved the world...").

### The KJV archaic-suffix gap

Scoped down to: a query for "love" against KJV won't match "loveth." Two options, deferred to
whenever it's actually raised as a problem rather than built speculatively:

- **Ingest-time normalization** — a narrow regex pass in `seed-bible-verses.ts` (or a generated
  column) that folds known archaic verb suffixes before the tsvector is computed, KJV-only. Small
  (a couple dozen rules, same scale as `bible-study-concept-overlaps.ts`), and it only touches
  the search-index expression, not the stored/displayed verse text.
- **Postgres synonym dictionary** — layer a custom text search configuration with a synonym file
  (`loveth love`, `believeth believe`, …) ahead of the English stemmer, scoped to KJV rows. More
  "correct" Postgres-native approach, more setup than the regex option.

Either is a same-day addition once/if it's worth doing — not a blocker for shipping the rest.

---

## Integration points

### 1. Search (`GET /api/search`)

Add a verse-result branch alongside the existing note/thread FTS branches in
`server/routes/search.ts` — same `tsQuery`/`ts_rank` pattern, new source table. Gate behind the
existing `MIN_SEARCH_QUERY_LENGTH`. Scope to the user's default translation by default; a
"search all translations" toggle is a natural, cheap extension since there's no per-translation
index to build first.

**Where the knowledge layer actually helps:** not as matching infrastructure (FTS handles
matching on its own), but as **enrichment/ranking** on top of raw hits — once a query returns
verse matches, join against `ScriptureTopicVerses`/`ScriptureCrossReferences` to (a) show "also
tagged: Redemption" under a hit, or (b) break ties / rank hits that also carry a topic the user
has engaged with before over ones that don't. That's the concordance and the knowledge layer
actually composing, rather than the concordance duplicating what the knowledge layer already
does.

### 2. Suggested-reference pills in the editor

Unchanged from the original plan — still no existing analog in the editor, still recommended as
an explicit, selection-triggered action rather than automatic-as-you-type (noisy for common
words), still editor-agent's surface for the trigger UI and pill insertion
(`TiptapScripturePill.ts`). The lookup itself is now just the same FTS query as search, not a
separate concordance-table read.

---

## Guardrails

- **No theological review needed** — raw textual matching, not interpretation, same reasoning as
  cross-references.
- **No new dependency, no new licensing surface** — the entire feature is an index + a query
  pattern already proven in this codebase.
- **Native parity** — server-derived endpoint, native gets it for free through the same API
  surface.

---

## Phased roadmap

- **Phase 0 — Index + query.** GIN index on `BibleVerses.text`, verse-search query function
  (mirrors the note-search branch in `search.ts`). *Acceptance:* querying "redeem" against KJV
  returns verses containing "redeemed," "redemption," and "redeemer"; querying with no
  translation filter returns hits across all 7.
- **Phase 1 — Search integration.** New verse-result branch in `/api/search`, translation-scoped
  by default, capped + `ts_rank`-ordered, `ts_headline` for in-context display.
- **Phase 2 — Knowledge-layer enrichment.** Join topic/cross-reference data onto verse-search
  results for ranking/display, not matching.
- **Phase 3 — Suggested-reference pills.** Selection-triggered lookup action in the editor,
  reusing the Phase 0 query; coordinate trigger UI + pill insertion with editor-agent.
- **Phase 4 (stretch, defer) — KJV archaic-suffix normalization.** Only if real usage shows it's
  worth the narrow fix described above.

---

## Related Docs

- [SCRIPTURE_KNOWLEDGE_LAYER.md](./SCRIPTURE_KNOWLEDGE_LAYER.md) — the cross-reference/topic/entity
  layer this composes with for ranking/enrichment (Phase 2).
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — core data model (`BibleVerses`, `ScriptureMetadata`).
