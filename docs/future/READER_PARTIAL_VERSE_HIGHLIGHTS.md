# Partial-Verse Highlights in the Reader — Options

**Status:** Decision doc. Not started.
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
