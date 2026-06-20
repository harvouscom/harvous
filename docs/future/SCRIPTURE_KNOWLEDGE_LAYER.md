# Scripture Knowledge & Memory Layer

A shared, canonical knowledge layer over Scripture — themes, people, places, and
cross-references — that lets Harvous make stronger connections between a user's notes
**without AI at runtime**, and that serves as the grounding substrate for future AI
features.

**Status:** Phase 0 data layer complete — all CC-BY, imported, normalized, and seeded into
Supabase: cross-references (TSK, 341k), topics (OpenBible, 6.7k topics / 629k verse edges),
places (OpenBible geocoding, 1.3k places / 8.7k verse edges), and people (STEPBible TIPNR, 3.1k
people / 11.4k verse edges). The connection layer (Phase 1) landed —
`server/utils/scripture-knowledge.ts` (`getKnowledgeForReference`, `getRelatedNotesForNote`).
Phase 2 passage-aware auto-tagging landed too — `server/utils/passage-aware-tags.ts` corroborates
prose tags with passage themes and adds referenced people/places, wired into the
scripture-processing tag path, plus a server-side auto-folder gap-fill (files an empty primary
collection under the dominant cited book). Phase 3 Remember resurfacing is partially landed:
shared-theme (`deriveSubjectConnections` on prototype Home) and cross-reference
(`deriveCrossRefConnections` via `GET /api/spaces/:id/scripture-connections`) cards ship on
prototype Home; passage resurfacing remains. Phases 4–5 are next. See the roadmap at the end.

---

## Why this exists

Harvous already turns notes into a small graph (see "What already exists" below), but the
**passages those notes cite are inert** — Harvous knows a note references Romans 8:28, but
knows nothing *about* Romans 8:28. There is no shared data saying that passage is about
providence, suffering, and hope, or that it cross-references Genesis 50:20.

This doc proposes a **shared canonical knowledge layer** — authored once from open datasets,
shipped to every user — that attaches meaning to passages. Notes already link to passages via
`ScriptureMetadata`, so the moment passages carry themes/entities/cross-references, every note
inherits a second, structured signal it doesn't have today.

It maps directly onto the [North Star](./HARVOUS_NORTH_STAR.md) pillars:

- **Remember** ("surface what matters — no AI required"): deterministic resurfacing by shared
  theme / passage / cross-reference.
- **Learn** (AI challenges from your content) and the
  [Give Me More Context](./GIVE_ME_MORE_CONTEXT.md) panel: the layer is the *grounding data* so
  the AI reads facts (real cross-references, real connections to your notes) instead of
  inventing them — cheaper and more accurate.

The design principle: **AI is optional polish on top of a deterministic core**, never the core
itself.

---

## What already exists

Harvous is well past "keyword + confidence only." The current primitives:

| Primitive | What it is | Where |
|---|---|---|
| `NoteConnections` | note ↔ note graph (backbone of study threads) | `server/db/schema.ts` |
| `ScriptureMetadata` | note → passage edges (book/chapter/verse, indexed by noteId) | `server/db/schema.ts` |
| `NoteTags` + `Tags` | note → concept edges with `confidence` + category | `server/db/schema.ts` |
| Keyword corpus | 400+ biblical keywords (book/character/place/spiritual/biblical/theme) | `src/utils/bible-study-keywords.ts`, `src/utils/keyword-trie.ts` |
| Concept overlaps | 43 hand-curated theme↔theme pairs (a tiny theme graph) | `src/utils/bible-study-concept-overlaps.ts` |
| Thread suggestion | keyword + Jaccard-similarity endpoint | `server/routes/notes.ts` (`/api/notes/suggest-threads`) |
| Auto-tag / auto-folder | suggesters that score **note prose only** | `server/utils/auto-tag-generator.ts`, `src/utils/bible-study-tag-web.ts`, `src/utils/bible-study-collection-web.ts` |
| Recall surfaces | top books/passages/tags/threads, revisit picker | `src/utils/prototype-home-trends.ts` |
| Dictionary | Easton's Bible Dictionary (encyclopedia entries) | `server/data/dictionaries/eastons.json` (+ slug index) |

The work here **extends** these, it does not replace them. Keyword + confidence stays — it gets
**demoted from the only signal to one signal among several.**

The key gap: none of the auto-tag/folder/suggestion code reads `ScriptureMetadata`. The
passages a note cites are a known, structured signal that is currently discarded.

---

## The four-layer model

1. **Source** (exists): `Notes`, `ScriptureMetadata`, the Bible JSON in `server/data/bibles/`,
   user `Tags`.
2. **Canonical scripture-knowledge** (NEW, shared, shipped to all users): passages, themes,
   people, places, cross-references, and the edges between them.
3. **Connection** (mostly exists, extend): note→passage (`ScriptureMetadata`), note→concept
   (`NoteTags`), note→note (`NoteConnections`); ADD passage-mediated note↔note (two notes that
   cite passages sharing a theme or cross-reference are related, even with zero shared words).
4. **Retrieval / scoring** (partial, in `prototype-home-trends.ts`): recency, frequency, passage
   overlap, theme overlap, thread membership, explicit user actions.

The join that makes it all work is trivial: **`(book, chapter, verse)`** from a user's
`ScriptureMetadata` against the canonical layer keyed on the same tuple. No embeddings, no AI —
just indexed joins.

---

## Canonical tables (new, shared)

Shared reference data with **no `userId`** — identical for every user, like the existing
`BibleVerses` / `BibleTranslations` tables. Shapes below are illustrative and follow the naming
conventions in `server/db/schema.ts` (text ids, `ts()` timestamps, explicit indexes).

```ts
// Cross-references (from Treasury of Scripture Knowledge)
ScriptureCrossReferences = pgTable('ScriptureCrossReferences', {
  id, fromBook, fromChapter, fromVerse,
  toBook, toChapterStart, toChapterEnd, toVerseStart, toVerseEnd,
  votes,           // TSK confidence/popularity weight
  source,          // 'TSK'
}, idx on (fromBook, fromChapter, fromVerse));

// Canonical theme/topic registry — reconciled with the existing keyword corpus
ScriptureTopics = pgTable('ScriptureTopics', {
  id, slug, label, category,   // category mirrors keyword categories where possible
});

// Passage ↔ theme edges
ScriptureTopicVerses = pgTable('ScriptureTopicVerses', {
  id, topicId, book, chapter, verse,
  relevance,       // from OpenBible topical vote weight; used as a threshold
}, idx on (book, chapter, verse), idx on (topicId));

// Canonical people / places registries
BiblePeople  = pgTable('BiblePeople',  { id, slug, name, aliases });
BiblePlaces  = pgTable('BiblePlaces',  { id, slug, name, aliases, lat, lng });

// Passage ↔ entity edges
ScriptureEntityRefs = pgTable('ScriptureEntityRefs', {
  id, entityType,  // 'person' | 'place'
  entityId, book, chapter, verse,
}, idx on (book, chapter, verse));

// Optional: promote the 43 concept-overlap pairs into queryable theme↔theme edges
TopicRelations = pgTable('TopicRelations', { id, fromTopicId, toTopicId, kind });
```

---

## Storage & seeding

Mirror the **proven** pattern already used for Bible text
(`server/data/bibles/*.json` → `server/scripts/seed-bible-verses.ts` → `BibleVerses` table):

1. **Author/ship as static JSON** under a new `server/data/scripture-knowledge/` directory
   (git-tracked, diff-reviewable — the "source of truth lives in plain files" principle). Use a
   slug index file for fast lookups, the same shape as `eastons-slug-index.json`.
2. **Seed into Supabase** with an importer script per dataset and book-name normalization, so
   runtime is plain SQL joins. The canonical tables are shared reference data; like
   `BibleVerses`, they are RLS-exempt and read with the service-role key.

This keeps authoring transparent and reviewable while giving runtime fast, indexed joins with
no per-user duplication.

---

## Open-data sources & licensing

All data is verse-addressed and **translation-agnostic** (it points at "John 3:16", not at any
one translation's wording), so there is no KJV-vs-ESV doctrinal skew at the data layer.

| Layer | Source | License / note |
|---|---|---|
| Cross-references | Treasury of Scripture Knowledge, via OpenBible.info `cross_references.txt` | TSK is public domain; **verify OpenBible's distribution terms and ship attribution** |
| Themes / topics | OpenBible.info Topical Bible (topic → verses, with vote weights) | CC-BY — **must ship attribution** |
| People | Open "people of the Bible" datasets (e.g. Viz.Bible) | CC-BY — **must ship attribution** |
| Places | OpenBible.info Bible Geocoding (place + lat/lng) | CC-BY — **must ship attribution** |
| Definitions | Easton's Bible Dictionary | Public domain; **already shipped** in `server/data/dictionaries/` |

Action item before any import: confirm each dataset's exact license and add an
`ATTRIBUTION.md` alongside the data files.

---

## Normalization & reuse (don't reinvent)

The one genuinely fiddly part is mapping each dataset's reference format (OSIS abbreviations
like `Gen`, `1Cor`) onto Harvous's full book names (`Genesis`, `1 Corinthians`). Reuse:

- `normalizeScriptureReference()` / `parseScriptureReference()` in
  `src/utils/scripture-detector.ts` — canonical parsing already used throughout the app.
- `src/data/bible-chapters.json` — full book-name canon + valid `(chapter, startVerse,
  endVerse)` ranges for validation. Shape: `{ book, bookOrder, testament, chapter, startVerse,
  endVerse }`.
- Book synonyms/abbreviations already encoded in `src/utils/bible-study-keywords.ts` — reuse for
  OSIS → full-name mapping rather than building a new alias table.
- The slug-indexed JSON pattern from `server/data/dictionaries/eastons-slug-index.json`.

Build the OSIS→Harvous mapping once, validate every imported reference against
`bible-chapters.json`, and reject/log anything that doesn't resolve.

---

## What this unlocks

### Auto-folder & auto-tag (flagship near-term win)

Today `generateAutoTags(noteTitle, noteContent, …)` and
`suggestPrimaryCollectionFromNote(title, bodyHtml)` score **note prose only** against the
keyword corpus and ignore the note's own `ScriptureMetadata`. Feeding referenced-passage
themes/entities in as a **second, independent signal** transforms the suggesters:

- **Corroboration** — a candidate matched by *both* the prose and a referenced passage's
  canonical theme gets a confidence boost. This is what finally makes "confidence" mean
  something: independent evidence vs. a single lexical hit.
- **Net-new** — themes a passage carries but the prose never names. A note on Romans 8:28 that
  never writes "providence" still gets it, surfaced as a gated, dismissible suggestion (reuse
  `Notes.dismissedAutoTags`).
- **Entity disambiguation** — `ScriptureEntityRefs` confirm the *biblical* David vs. a friend
  named David (the note cites a Davidic Psalm), sharpening the existing
  `src/utils/person-name-context.ts` false-positive gate.

Crucially, this **reuses the existing gates**: `conceptOverlaps()` dedup so passage-themes don't
double up with prose-themes, and `src/utils/folder-keyword-context.ts` gating so a
passage-derived theme still can't auto-promote to a *primary folder* without the title/3+ rule.

### Remember (deterministic resurfacing)

"This note touches *grace* and *Romans 8* — here are 3 earlier notes that share them." Pure
joins over the connection layer, no AI. Extends the surfaces in `prototype-home-trends.ts`.

### Suggested study threads

Upgrade `/api/notes/suggest-threads` from string-level Jaccard similarity to *concept / passage
/ cross-reference* overlap — notes get grouped by what they're actually about, not by shared
words.

### Ground AI features

[Give Me More Context](./GIVE_ME_MORE_CONTEXT.md)'s "Checking cross-references…" and "How does
this connect to my notes?" steps read real data from this layer instead of asking the model to
recall it — lower cost, higher accuracy, less hallucination. The Learn/Challenges quiz
generator gets real connection targets ("which passage connects to Romans 8:28?") and
study-guide scaffolding.

---

## Guardrails (faith product)

- **Attribution:** ship CC-BY attribution for every sourced dataset (`ATTRIBUTION.md`).
- **Theological review:** route topic associations and any future passage summaries through
  `/theologian-agent`.
- **Defer summaries:** book/chapter/passage *summaries* are higher doctrinal risk — leave them
  out of the first build. Themes and cross-references are low-risk, textual data.
- **Precision:** OpenBible topical data is broad (a chapter maps to many topics). Threshold on
  vote/relevance and keep passage-derived tags as **low-confidence suggestions, never
  auto-applied.** Otherwise the auto-tagger gets noisy.
- **Native parity:** the tag/collection suggester has a Swift twin (`BibleStudyTagSuggester` —
  see [../BIBLE_STUDY_TAG_SUGGESTER_TUNING.md](../BIBLE_STUDY_TAG_SUGGESTER_TUNING.md) and the
  "keep in sync with native" note in `src/utils/bible-study-concept-overlaps.ts`). The passage
  signal ships web/server-first, or needs a mirrored native implementation.

---

## Phased roadmap

- **Phase 0 — Schema + data pipeline (first build).** Canonical tables + static JSON under
  `server/data/scripture-knowledge/` + importers (TSK, OpenBible) with book-name normalization +
  a seed script mirroring `seed-bible-verses.ts`. *Acceptance:* querying "themes + cross-refs for
  John 3:16" returns sensible rows.
- **Phase 1 — Connection layer (done).** Pure, unit-tested server utils
  (`getKnowledgeForReference(book, ch, v)`, `getRelatedNotesForNote(noteId)`) joining
  `ScriptureMetadata` ↔ canonical edges ↔ the user's other notes. Implemented in
  `server/utils/scripture-knowledge.ts`; ranking logic isolated in the pure `rankRelatedNotes`.
- **Phase 2 — Passage-aware auto-tag + auto-folder (done).** Tags: `enrichAutoTagsWithPassages`
  + the pure, tested `mergePassageTags` in `server/utils/passage-aware-tags.ts` — passage
  themes/entities corroborate prose tags; people/places are added net-new (themes never auto-add —
  too broad), reusing `conceptOverlaps` dedup and existing folder/dismissed exclusions. Folder:
  `enrichCollectionWithPassages` gap-fills an *empty* primary collection with the note's dominant
  cited book (server-side, since the client folder logic can't reach the knowledge layer; only
  fills, never overrides pinned/user choices). Both wired into `process-scripture-references.ts`.
  Remaining: surfacing passage themes/entities inside the client/native folder pickers
  (`BibleStudyTagSuggester` parity).
- **Phase 3 — Remember surfaces (partial).** Extend `prototype-home-trends.ts` to resurface by shared
  theme / passage / cross-reference. **Done:** shared-theme card (`deriveSubjectConnections` +
  `chapter-subjects.json`) and cross-reference card (`deriveCrossRefConnections` +
  `build-space-scripture-connections.ts` + `/api/spaces/:id/scripture-connections`). **Remaining:**
  passage resurfacing.
- **Phase 4 — Suggested study threads.** Concept-overlap upgrade to `/api/notes/suggest-threads`.
- **Phase 5 — Ground AI features.** Feed the layer into Give-Me-More-Context and Learn/Challenges
  as retrieval context.

---

## Related Docs

- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — the Remember and Learn pillars this layer
  serves.
- [GIVE_ME_MORE_CONTEXT.md](./GIVE_ME_MORE_CONTEXT.md) — AI context panel that this layer grounds.
- [HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md) — learning features
  (challenges, recall/quizzes) that consume this layer.
- [SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md](./SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md) — related
  scripture-note enhancements (overlapping passages, collected-verses view).
- [../BIBLE_STUDY_TAG_SUGGESTER_TUNING.md](../BIBLE_STUDY_TAG_SUGGESTER_TUNING.md) — current
  auto-tag/folder scoring + native parity (Phase 2 touches this).
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — core data model (`ScriptureMetadata`,
  `NoteConnections`, note types).
