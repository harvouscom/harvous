# Reader Margin Indicators — Options

**Status:** **Decided and built** (August 21, 2026) — the spoken signal and the merge fix both
shipped. Nothing outstanding.
**Last Updated:** August 21, 2026
**Audience:** Whoever decides how the reader says "you have written about this", and whoever
implements it.
**Covers:** improvement-list item #8 (the "In your note" margin indicator redesign) — design-track
item D-5.

---

## Executive summary

The margin already works, and the parts of it that look arbitrary turn out to be load-bearing.
The two things actually wrong with it are not the shape.

**Recommendation: Option B — keep the bar exactly as drawn, and give the signal a second,
non-visual route.** The bar's length carries information no point marker can (a one-verse note is
a tick, a five-verse note is a rule, two notes over the same verses are two bars side by side),
and that is the whole reason dots were abandoned. What it lacks is any equivalent for someone not
looking at it, and one honest defect in how it merges past three lanes.

Two objective findings, both checkable, neither a matter of taste:

> **1. The presence signal has no non-visual equivalent.** The margin layer is `aria-hidden`
> and every bar is `tabIndex={-1}` (`PrototypeBibleReaderPane.tsx:1447-1462`). The reasoning in
> that comment is sound — a screen reader walking a chapter should hear Scripture, not a list of
> marks interleaved between verses. But nothing else *volunteers* the fact. The verse's own
> action set is Highlight / Annotate / Passages / Note; none of them says a note already cites
> this verse. The information is reachable (select the verse → Passages → the dock's related
> notes, `PassageContextStrip.tsx:222-266`) but only by someone who already suspects.

> **2. A merged bar's length stops being its span.** Past `MAX_LANES = 3`, a fourth concurrent
> note folds into the innermost overlapping bar and that bar is *stretched to the union*:
> `host.endVerse = Math.max(host.endVerse, span.endVerse)`
> (`usePrototypeChapterNotes.ts:198-204`). The bar then spans verses neither note necessarily
> cites, and the note card — which is sized from the bar — holds a passage wider than anything
> you wrote about. Length is the property the entire design rests on, and this is the one case
> where it lies.

---

## The alternatives

| Option | Verdict | Trade-off |
|---|---|---|
| A. Leave it entirely | Honest, and closer to right than it looks | Keeps both defects; the second one quietly undermines the design's own premise |
| **B. Keep the bar, add a non-visual route, fix the merge** | **Recommended** | Two contained changes and no visual redesign — but it declines the redesign #8 asked for |
| C. Point markers (dots) | Not recommended | Already tried and abandoned; cannot express span or overlap, which is most of what the margin knows |
| D. Inline glyph in the text | Not recommended | Competes with verse numbers, and puts editorial marks inside Scripture |
| E. Move to the right-hand margin | Not recommended | Real cost, no benefit identified; the card mechanism assumes the gutter side |

---

## What exists today

### The geometry

| Piece | Value | Where |
|---|---|---|
| Gutter width | 28px, 20px on a narrow pane | `prototype-tokens.css:596`, `prototype-components.css:18074` |
| Lane pitch | 9px, three lanes | `prototype-tokens.css:599`, `MAX_LANES` in `usePrototypeChapterNotes.ts:121` |
| Drawn rule | 2px wide, 1px radius, 3px on hover | `prototype-components.css:18651-18676` |
| Colour | grey (`--pds-text-tertiary`), never the highlight palette | `prototype-components.css:18639-18650` |
| Weight ramp | discrete, `data-heat` 1–4 by merged count | `prototype-components.css:18663-18670` |

The gutter is **reserved even when empty**, so text never reflows when the first margin note
lands. Worth knowing before anything proposes reclaiming it.

At the narrow width the three lanes still fit, but only just: lane 2's drawn rule lands exactly
on the gutter's inner edge (18–20px of a 20px layer). Its *hit area* is 9px wide and so overhangs
into the paper padding by 7px. Harmless today — a slightly generous target — but it means the
gutter has no room for a fourth lane at any width, which is worth stating rather than
rediscovering.

### Why bars rather than dots

Recorded at `usePrototypeChapterNotes.ts:124-133` and worth preserving, because it is the
argument any redesign has to beat:

> The reader's old dots asked "what is on verse 12?" and so fanned each anchor across every verse
> it touched — which threw away the very thing a margin should show. A bar keeps the anchor
> whole: its length IS the span, and two bars side by side ARE the overlap.

There is a second rejection on record too: `prototype-components.css:18585-18587` still carries
the dot-era description ("A dot means one note on this verse; a capsule of stacked dots means
several"), left as a comment above the rule that replaced it. **That comment is now wrong and
should be deleted** whichever option wins — it describes a design that has not existed for some
time, directly above the one that did replace it.

### Why the bars are measured rather than laid out

`PrototypeBibleReaderPane.tsx:692-770`. A gutter cell in each block's grid only works in `lines`
layout, where a block *is* a verse. In `prose` the chapter is one paragraph, so there is no
per-verse box to sit beside. The bars therefore take their extent from client rects — the start
verse's **first** rect to the end verse's **last**, not the bounding box, because a verse that
wraps across four lines has four rects and a range beginning mid-paragraph would otherwise start
at the wrong line.

This is the real cost of the current design and the reason positional changes are not cheap:
a `ResizeObserver` on the column plus a rAF pass, re-run on layout mode, text size, typeface and
column width. Any option that changes *where* bars sit pays this again. Any option that changes
only how they *look* is CSS.

### The card

`.pds-reader__note-card` sits **behind** the verses (`prototype-components.css:18330-18355`),
sized to the bar plus `CARD_BLEED`, with its chrome floating above and flipping below when there
is not enough clearance. The chrome names the notes — "In your note" for one, "In N of your
notes" for several — and each row opens that note at its own reference, not the bar's.

Note the merged case *is* handled correctly here: `host.notes.push(...span.notes)`, so every note
folded past the lane cap appears in the card's list. The count is not tooltip-only. Only the
bar's **length** is wrong for that case, not its contents.

---

## Option B in detail

**Goal:** the margin keeps saying what it says, to everyone, and never draws a span nobody wrote.

**Build — the non-visual route:**
- Leave `aria-hidden` on `.pds-reader__margin`. It is correct: the bars are a visual index of
  something the verses already contain, and interleaving them would make the chapter unreadable
  aloud.
- Put the fact on the **verse** instead, which is already a `role="option"` in the chapter's
  listbox and already has an accessible name. A verse covered by a note gains a visually-hidden
  suffix, so it announces as "…Verse 12, in one of your notes" rather than requiring the reader
  to go asking.
- Derive it from `anchorLanes`, which already knows the covered ranges — no second query, and no
  dependency on the measured `bars`, which exist only once layout has settled.

**Build — the merge (decided):**
- Stop stretching the host bar. **The host keeps its own span**, and the extra note rides in the
  card's list, which already shows every merged note correctly. Every drawn length stays truthful
  and the bar stops promising a span it does not have.
- The rejected alternative was drawing the merged note at its own extent, overlapping inside
  lane 3 — honest in a different way, since there genuinely is more there than three lanes can
  show. It lost on legibility: a 9px lane holding two 2px rules is muddy, and the gutter has no
  room for a fourth lane at any width.
- **Name the cost, because it is real:** the fourth note gets no mark of its own. It is findable
  only by opening the bar it hid behind. That is the price of every drawn length being true, and
  it was accepted deliberately rather than overlooked.

**Build — the opt-out:**
- The spoken cue follows `showMarginNotes` (`spa/src/lib/proto-reading-prefs.ts:49`). Off means
  off for everyone. The setting reads as "do not tell me about my notes while I am reading", and
  that reason applies just as much when the telling is spoken — one switch, one meaning. The
  alternative, treating the preference as being about gutter clutter specifically and keeping the
  announcement, would make one setting mean two things depending on how it is read.

**Reuse:** `assignAnchorLanes` is pure and already unit-tested — the merge branch is four lines
and the test can pin the invariant directly ("no bar's span exceeds the union of the spans it
draws for").

**Done when:** a screen reader hears which verses you have written about without hunting; no
drawn bar covers a verse that no note it stands for cites; and the stale dot comment is gone.

---

## The options not taken

**C. Point markers.** A dot can say "something is here" and nothing else. The margin's three most
useful facts — how long the passage is, that two notes overlap, that one note swallows another —
are all length or adjacency. This was the previous design and was replaced for exactly this
reason; re-proposing it would be re-losing the argument. Included in the gallery scene so the
comparison can be seen rather than taken on trust.

**D. Inline glyph.** Putting a marker in the text competes with verse numbers, which the reader
has just spent effort keeping clean (the highlight-underline fix moved decoration off the number
precisely so the number stays a number). It also makes an editorial mark part of Scripture's
line, which the reader's whole visual argument avoids.

**E. Right-hand margin.** The gutter would have to be reserved on the other side, the card's
`left`/`right` insets (`prototype-components.css:18345-18346`) inverted, and the measuring pass
re-verified in both layouts — for no benefit anyone has named. Listed because it is the obvious
"move it" idea, and rejecting it explicitly is cheaper than answering it twice.

---

## Native parity

**There is no native chapter reader yet.** `native/Harvous/Views/` has the scripture hub, the
passage view and the dock, but nothing that renders a chapter with a margin — so this decision
carries no immediate Swift obligation, unlike the toolbar shape.

It does carry a future one. Per `docs/design-parity/`, native is the visual source of truth, and
the Bible reader is on the roadmap as a main-pane document type. Whatever is decided here becomes
the thing the native reader has to match, so the *reasoning* matters more than usual: a margin
whose justification is "length is the span" survives being rebuilt in SwiftUI, whereas one
justified by CSS positioning does not.

---

## Risks / watch-items

- **The gutter is reserved even when empty.** Any option that narrows or removes it makes text
  reflow the moment a first note lands, which is the exact jitter the reservation prevents.
- **The measured layer is re-run on four different triggers.** A change to `top`/`height`
  semantics needs checking in both layouts, at several widths, and after a typeface change —
  unit tests cannot cover it.
- **`showMarginNotes` already exists** (`spa/src/lib/proto-reading-prefs.ts:49`), so the margin is
  opt-out today. A redesign should not quietly become non-optional.
- **The gallery clone is hand-maintained** (`DesignSystemScenePreview.tsx:625-649`, `:725`). It
  restates the bar markup rather than rendering the pane, so a change to the real bars can pass
  `design:check` while the scene drifts. Same class of problem as the paper-stack fixture.
- **The stale dot comment** at `prototype-components.css:18585-18587` describes a design that no
  longer exists, directly above the one that replaced it. Delete it with whatever lands.
- **Collision with the dock carousel.** The reader can now hold several study docks in a band at
  the bottom (`StudyDockCarouselWeb`). A pinned note card low in the chapter has not been checked
  against that band — the same collision `HIGHLIGHT_REFERENCE_STYLING_SPEC.md` flags for the
  selection toolbar.

---

## Related docs

- `docs/future/HIGHLIGHT_REFERENCE_STYLING_SPEC.md` — D-4, the mark styling this sits beside
- `docs/future/READER_PARTIAL_VERSE_HIGHLIGHTS.md` — D-1; sub-verse anchors would change what a
  bar's length means
- `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md` — §5 accessibility baseline

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-21 | **The bar stays.** No visual redesign. | Derek's call against the rendered `ds-22-margin-indicators` scene. A bar's length is the note's span and two side by side are the overlap — most of what the margin knows, and neither survives a point marker. This declines the redesign #8 asked for, so it was put as an explicit question rather than assumed. |
| 2026-08-21 | **The verse carries the non-visual signal.** A verse covered by a note gains a visually-hidden suffix; the margin layer stays `aria-hidden`. | Adds no pixels and keeps the chapter readable aloud. Making the bars focusable was the direct alternative and was rejected: it interleaves a list of marks into Scripture — the exact thing the existing comment refuses — and adds tab stops to a reading surface. |
| 2026-08-21 | **A merged bar keeps the host's own span.** The extra note rides in the card's list rather than the bar claiming its verses. | Every drawn length stays true. Rejected: drawing both at their own extents inside lane 3, which is muddy at a 9px pitch. Accepted cost: the fourth note has no mark of its own and is findable only through the bar it hid behind. |
| 2026-08-21 | **The spoken cue follows `showMarginNotes`.** | One switch, one meaning. The preference reads as "do not tell me about my notes while I am reading", which applies equally to a spoken cue. |
