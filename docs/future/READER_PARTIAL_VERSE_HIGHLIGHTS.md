# Partial-Verse Highlights in the Reader — Options

**Status:** **Decided and built** (August 21, 2026) — Option B. The scoping held: one nullable
column, one `where` clause. The *actual* blocker was somewhere else entirely — see
[What the blocker turned out to be](#what-the-blocker-turned-out-to-be).
**Last Updated:** August 21, 2026
**Audience:** Whoever decides whether the chapter reader should highlight less than a whole verse.
**Covers:** improvement-list item #7.

---

## Executive summary

Before the Bible reader existed, a highlight could cover any span of text. The reader highlights
whole verses only, and that is a deliberate axiom, stated at the top of
`spa/src/pages/prototype/PrototypeBibleReaderPane.tsx`: *"Selection is per verse, not per character."*
Selection state is a pair of verse numbers; the stored reference is a string like `"John 3:16-18"`.

The interesting fact is that **sub-verse highlighting already exists and already ships** — in the
scripture dock and on native, via excerpt matching rather than offsets. So this is not "can we build
it"; it is "should the chapter behave like the dock, given the chapter is built on verses."

**Recommendation: Option B — allow a native text selection inside the chapter to create an
excerpt-based highlight, reusing the shipped path, and keep verse-tap selection exactly as it is.**
Two gestures, two granularities, one storage model. Tapping a verse stays the fast way to mark a
verse; dragging across words becomes the way to mark a phrase, which is what people do when a
sentence rather than a verse is the thing they mean.

This is the largest of the four design-track items and the only one that changes a data path. It
should be sequenced last.

---

## The alternatives

| Option | Verdict | Trade-off |
|---|---|---|
| A. Do nothing — sub-verse is already one tap away in the dock | Defensible | Two surfaces showing the same passage behave differently, and the reader is the one people use |
| **B. Excerpt-based sub-verse in the chapter, reusing the dock's path** | **Recommended** | Real work in the reader's measuring and a11y layers; no new storage model |
| C. Character-offset anchoring | Not now | Most precise, but invents a third model when two platforms already agree on excerpts |

---

## What already ships

### The dock and native both do this, the same way

`src/components/react/ScripturePillChromeWeb.tsx` captures a free text selection inside a passage and
posts a highlight whose anchor is **the selected text itself** — `scripturePassageExcerpt`, with the
reference left as the whole passage. Nothing stores where in the verse the span was.

Painting recovers the position by searching: `resolvePassagePaintRanges` in
`src/components/react/TiptapReferenceSuggestion.ts` finds each excerpt's first occurrence in the
flattened plain text, sorts, then walks a forward cursor so repeated substrings do not collide;
`wrapPassageRangeWithMark` splits text nodes and inserts a `<mark>`, which can span several nodes.

`native/Harvous/Views/ScripturePassageView.swift` implements the same two-phase algorithm over
`NSAttributedString` — first occurrence, sort, forward-cursor walk — and the web version's comment
names native as its source. The only divergence is a tiebreak: web adds save-order, native sorts on
position alone.

**So the excerpt model is not a proposal. It is the shipped cross-platform contract**, and Option B
adopts it rather than introducing anything.

### What the database holds

`StudyThreadEntries` (`server/db/schema.ts`) has two disjoint anchoring families:

- **Scripture:** `scriptureReference`, `scripturePassageTranslation`, `scripturePassageExcerpt`, plus
  `sourceSnippet`. **No offsets, no start/end.**
- **Note body:** `anchorQuote`, `anchorPrefixContext`, `anchorSuffixContext`, `anchorLocation`,
  `anchorLength`, `resolvedAnchorStart`, `resolvedAnchorEnd`, `anchorStatus`.

The note-body family is a full quote-plus-context selector model with resolved offsets — precisely
what Option C would want, already designed and already in the table. That it exists and is unused for
scripture is the strongest argument that Option C is *possible*; it is not an argument that it is
*needed*.

---

## Option B in detail

**Goal:** mark a phrase in the chapter, not just the verse containing it.

**Build:**
- A native text selection inside `.pds-reader__scroll` raises the existing action toolbar, positioned
  from the **Range** rect rather than the verse element's rect — the dock already does this.
- Highlighting posts a `scriptureLink` row shaped exactly like the dock's, with the selected text as
  the excerpt and the covering verse (or verse range) as the reference.
- Painting happens **imperatively against the rendered DOM**, not through the verse HTML memo. This
  is not a preference; see the constraint below.
- Verse-tap selection is untouched. A tap still selects a verse and still highlights the whole verse.

**Reuse:** `resolvePassagePaintRanges` and `wrapPassageRangeWithMark`
(`src/components/react/TiptapReferenceSuggestion.ts`) unchanged; the create path from
`ScripturePillChromeWeb.tsx`; the accent system as-is. Rendering follows
`HIGHLIGHT_REFERENCE_STYLING_SPEC.md` — a sub-verse mark is a highlight and should be solid 3px like
any other.

**Done when:** dragging across part of a verse in the chapter produces a highlight that survives
reload, appears in the dock for the same passage, and matches native.

### The constraint that shapes the implementation

`verseHtml` is memoised per verse with a stable `{__html}` object, and the comment above it records
why: a fresh object each render re-applies `innerHTML`, which **destroys any live text selection**.
Since the feature is *started by a text selection*, any paint that runs through that memo would
destroy the selection that invoked it.

The codebase already solved this once. Saved references are painted by reaching into the rendered DOM
and toggling attributes in an effect, deliberately, for exactly this reason — the CSS comment and the
effect both say so. **A sub-verse highlight must follow that same imperative pattern.** This is the
single most important implementation note in this doc.

---

## What breaks, honestly

Everything in the reader keys off whole-verse `[data-reader-verse]` elements. The cost of Option B is
mostly here, not in storage:

| Thing | Why sub-verse disturbs it |
|---|---|
| Margin bar measuring | Finds a verse by `querySelector('[data-reader-verse="N"]')` and measures its client rects. If a verse is split into sibling fragments to carve out a span, the query returns only the first fragment and bars mis-measure |
| Action toolbar positioning | Anchors to the end verse's last client rect; a sub-verse selection needs a Range rect |
| Focus scroll on arrival | Same element lookup; `focusVerse` / `v=` are integers throughout the route |
| Keyboard nav and a11y | Verses are `role="option"` inside a `role="listbox"` with roving tabindex. A sub-verse span has no place in that model |
| `highlights` map | `Map<verseNumber, ReaderVerseHighlight>` — one highlight per verse, last write wins. No room for two spans in one verse |
| `existingHighlight` lookup | Assumes every verse in the range shares one `studyThreadEntryId` |
| Reference grammar | `"Book C:V-V"` is parsed by string split in four places and is part of the server's upsert key |
| Focus fade | `dockEntryVerseRange` parses the same grammar to decide what the chapter fades to |

**The sharpest one is the server upsert.** `server/routes/study-threads.ts` upserts on
`(userId, parentNoteId IS NULL, entryKind, scriptureReference, translation)` — so re-highlighting the
same reference recolours the existing row rather than inserting. That key is verse-granular. Two
different phrases highlighted in the same verse would collide into one row today. **Option B requires
changing that key** (adding the excerpt) before it can store two spans in one verse, and that is the
one piece of work that cannot be deferred or faked.

---

## Scoping the blocker (August 21, 2026)

The doc above calls the server upsert "the one piece of work that cannot be deferred or faked".
That is still true, but the shape of the work is not what it sounds like. Scoped against the code:

### There is no migration, and no backfill

**The "upsert key" is not a database constraint.** `StudyThreadEntries` has no unique index on
those columns — its indexes are `parentNoteId`, `userId`, `noteVersionId`, `resolvedVersionId`,
`(spaceId, parentNoteId)` and `anchorStatus` (`server/db/schema.ts:519-524`). The key is purely the
`where` clause of a `SELECT … LIMIT 1` in `server/routes/study-threads.ts:970-987`, followed by an
`UPDATE` or an `INSERT`. Changing it is a code change to that clause. There is no constraint to
drop, no index to rebuild, and nothing that fails mid-migration.

**The excerpt already travels end to end.** `scripturePassageExcerpt` exists on the table, the
endpoint already accepts `body.excerpt` (`:1018`), the client mutation already takes an optional
`excerpt` (`usePrototypeChapterHighlights.ts`), and the reader already sends one — `selectedText`,
the selected verses' own text (`PrototypeBibleReaderPane.tsx:1071-1078`). Nothing needs plumbing.

### The trap: do not put the excerpt itself in the key

This is the thing worth knowing before anyone starts, because it looks like the obvious move and it
reintroduces the exact bug the current upsert exists to prevent.

Today's excerpt for a whole-verse highlight is **the rendered text of the verses**, joined from the
translation data. Put that in the key and the key becomes dependent on Bible text that can change:
a punctuation fix, a whitespace difference, any correction to a translation JSON, and the lookup
stops matching. Re-highlighting then *inserts* instead of recolouring — silently, which is
precisely the duplicate-row failure the comment at `:962-969` says it was written to stop.

The excerpt is a fine way to *paint* a highlight, which is why the dock and native use it. It is a
poor primary key.

### What to do instead

Add one nullable column — a stable span discriminator, computed client-side from the normalised
selected substring — and key on that:

| Case | Discriminator | Lookup |
|---|---|---|
| Whole-verse highlight | `NULL` | `… AND spanKey IS NULL` |
| Sub-verse highlight | short hash of the normalised span | `… AND spanKey = ?` |

Why this is the cheap version:

- **Every existing row is already correct.** They are all whole-verse, and `NULL` is exactly what
  they should have. No backfill, no data touched.
- **Whole-verse behaviour does not change at all.** Its lookup gains `IS NULL`, which every current
  row satisfies, so re-highlighting a verse recolours it exactly as it does today.
- **Only the new feature takes on text-matching fragility**, and only for spans the reader had no
  way to create until now. Nothing that exists today becomes less reliable.
- **`db:push` handles a nullable column** with no data migration; `db:check` reports schema drift
  and pushing stays an explicit act (`scripts/db-sync.js`). RLS does not enumerate columns, so
  `db:rls` needs no change.

### What happens to a highlight saved before the change

Nothing. It keeps its row, its colour and its reference; it gains a `NULL` span key, which is the
correct value for what it is; and re-highlighting those verses still finds and recolours it. There
is no version of this where an existing highlight is orphaned or duplicated — provided the key is
the discriminator and **not** the excerpt.

### The precedent already in the file

`POST /api/scripture/references` sits directly below the highlight route and has the *opposite*
write semantics, with the reasoning stated inline (`study-threads.ts:1036-1047`): "two different
words looked up in one verse are two references, not one recoloured — same table, opposite write
semantics." That is the same distinction sub-verse highlights need, already made once in this file
for the neighbouring case. Follow it rather than inventing a second pattern.

### One thing to check before building, that this scoping could not

Both `NULL` and `''` are written to `scripturePassageExcerpt` for the same logical state — the
highlight route writes `''` (`:1018`), while the general entry route (`:537`) and native sync
(`sync.ts:1245`) write `null`. That inconsistency is harmless while nothing keys on the column and
is a live hazard the moment something does. It does not affect the recommendation above, which keys
on a new column rather than this one — but if anyone is tempted back toward keying on the excerpt,
this is the second reason not to.

**Revised cost:** the server side is roughly one column, one `where` clause and one client-side
hash. The doc's framing of it as the immovable blocker overstated it. The real weight of Option B
is the reader work already listed under [What breaks, honestly](#what-breaks-honestly) — the
`Map<verse, highlight>` shape, the `"Book C:V-V"` grammar parsed in four places, the margin
measuring, and the keyboard/a11y model. That is where the estimate should sit.

---

## What the blocker turned out to be

The scoping pass was right that the server was cheap: one nullable `scriptureSpanKey`, one `where`
clause, no migration and no backfill. 111 existing rows, all `null`, all still correct.

**The thing that actually stopped this working was `user-select`.** Option B's whole premise is
"allow a native text selection inside the chapter", and the chapter forbade it: `global.css` sets
`* { user-select: none }` as an app-wide reset and the reader had no carve-out, so a drag across
words produced a range containing no text at all.

So the reader's whole-verse-only model was never a decision about granularity. It was an inherited
reset that nobody had reason to notice, because tapping verses was the only gesture anyone had
built.

The scripture dock already had the carve-out — added when sub-verse shipped there, with the reason
in the comment: *"drags must be able to start on them (native parity)"*. The reader now has the
matching rule, including the detail worth copying: **the verse number is excluded**. Without that,
a drag starting at the top of a verse swallows the numeral, the excerpt reads "5 The light
shines", and the span key computed from it can never match the passage it is meant to be part of.

Worth generalising from: two of this item's three hard parts were "something already does this,
one surface over". The excerpt model, the painter, and the selection carve-out were all shipped in
the dock. The reader was the holdout every time.

---

## Why not Option C

Character offsets are the precise answer, the note-body columns already exist, and it would survive
translation-independent re-rendering better than substring matching.

It is still the wrong move now:

- Two shipped platforms already agree on excerpt matching. A third model means the reader stores
  highlights the dock and native cannot paint, or a translation layer between them.
- Offsets are brittle against exactly the thing scripture does — the same verse rendered in seven
  translations, with different verse-number markup and different whitespace.
- The excerpt model's known weakness (a phrase appearing twice in one passage) is already handled by
  the forward-cursor walk, on both platforms.

Revisit if a requirement appears that excerpts genuinely cannot serve — highlighting a repeated
single word deterministically, or anchoring that must survive a text correction.

---

## Risks / watch-items

- **`VerseSpan` is memoised at module scope** with a long comment about why it must not be recreated
  per render: doing so once unmounted the whole verse subtree and made a dotted word need two taps.
  Sub-verse work must not reintroduce component-identity churn.
- **Mobile text selection in a scroller is its own problem.** The dock already deals with drag-vs-tap
  slop; the chapter is a longer scroll surface and iOS will offer its own callout.
- **Two gestures on one surface need to not fight.** A tap selects a verse; a drag selects text.
  The boundary between them is where this feels good or bad, and it is worth prototyping before
  committing.
- **The outside-click allow-list** governs what dismisses a selection; a sub-verse selection lives in
  the browser's selection model rather than React state, so dismissal needs deliberate handling.
- **This item is the reason to sequence D-4 first.** How a sub-verse mark should look is answered by
  `HIGHLIGHT_REFERENCE_STYLING_SPEC.md`; building this before that spec settles means guessing.

---

## Related docs

- `docs/future/HIGHLIGHT_REFERENCE_STYLING_SPEC.md` — how the resulting mark should render
- `docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md` — the passage/verse data model this sits on
- `docs/design-parity/HARVOUS_DESIGN_PARITY_SPEC.md` — §5, gesture differences are an allowed divergence

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| | | |
