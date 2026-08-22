# Highlights, References and the Selected Verse — Styling Spec

**Status:** **Decided; mostly built** (August 21, 2026). The weights, the offset distinction and
the dock's variable route shipped. **Outstanding: the single spotlight mechanism** and a
device measurement of native's underline weight — see [Outstanding](#outstanding).
**Last Updated:** August 21, 2026
**Audience:** Whoever settles what a mark means visually, across reader, note body, dock and native.
**Covers:** improvement-list items #5 (the selected/highlighted verse experience) and the second half
of #3 (saved references competing with highlights).

---

## Executive summary

Harvous draws four different marks on text — a dictionary suggestion, a saved reference, a highlight,
and an annotated highlight — across four surfaces: the Bible reader, a note body, the scripture dock,
and native. **No two surfaces agree on what those marks look like**, and in one surface two of them
are indistinguishable.

**Recommendation: adopt one cross-surface spec — dotted 1.5px for a suggestion, solid 2px for a saved
reference, solid 3px for a highlight — and route every surface through the `--mark-accent` /
`--reference-accent` variable so a shared spotlight becomes possible.** The 3px comes from native,
which already draws highlights with `NSUnderlineStyle.thick`; per
`docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` §0 native is the source of truth, so the web is the
side that is currently wrong.

The clearest single symptom: **the same highlight renders at 2px in the chapter and 3px in a dock
card of that same passage.** Open a verse's dock beside the chapter and the mark changes weight.

---

## Current state

### The four marks, by surface

| Mark | Reader | Note body | Scripture dock | Native |
|---|---|---|---|---|
| Dictionary suggestion (unsaved) | dotted 1.5px, offset 3, tertiary | — | dotted 1.5px, offset 3, tertiary | painter-drawn |
| Saved reference | solid 2px, `--reference-accent` | **same as a highlight** | solid 2px, offset 3 | — |
| Highlight | solid 2px, offset 3, `--mark-accent` | solid 2px, offset 3, `--mark-accent` | **solid 3px, offset 2** | `NSUnderlineStyle.thick` |
| Annotated highlight | same as highlight (dot on the toolbar button only) | same as highlight | same as highlight | same |

Sources: `spa/src/styles/prototype-components.css` (reader), `spa/src/styles/prototype-editor.css`
(note body), `src/styles/scripture-pill-chrome.css` (dock),
`native/Harvous/Views/ScripturePassageView.swift` (native).

### Four disagreements worth fixing

1. **Highlight and saved reference are indistinguishable — and not only in a note body.**

   *Corrected August 21, 2026, by measuring the rendered marks in `ds-23-mark-styling` rather than
   reading the rules.* This originally said the note body lost a distinction the reader
   "deliberately separates". The reader does not draw one either. Holding colour constant and
   reading computed styles off the live specimens:

   | Surface | Saved reference | Highlight | Same? |
   |---|---|---|---|
   | Reader | solid 2px, offset 3 | solid 2px, offset 3 | **yes** |
   | Note body | solid 2px, offset 3 | solid 2px, offset 3 | **yes** |
   | Scripture dock | solid 2px, offset 3 | solid 3px, offset 2 | no |

   `--reference-accent` and `--mark-accent` are real and do real work, but what they buy is colour
   **isolation** — a reference inside a highlighted verse keeps its own accent instead of
   inheriting the verse's. That is a correctness property, not a visual distinction. Give the two
   marks the same colour and only the dock can tell them apart.

   This strengthens the case for the spec rather than weakening it: the proposed weights are not
   tidying an inconsistency between two surfaces, they are introducing a distinction that does not
   currently exist on any surface but one.

2. **A scripture highlight has two weights.** 2px in the reader, 3px in the dock. The dock's 3px is
   correct — its rule is explicitly there to mirror native's `.thick`. The reader is the outlier.

3. **Accent plumbing works three different ways**, and one of them blocks a feature:
   - reader and note body: attribute selector sets `--mark-accent`, one rule consumes it
   - dock: `text-decoration-color` written directly per `data-color`, no variable
   - dock chrome and swatches: a `var(...)` string built in JS (`studyDockAccentCssVar`,
     `src/utils/study-highlight-accents.ts`)

   The direct-declaration route is why the dock cannot participate in a dim/spotlight pass: there is
   no variable to override.

4. **Spotlight exists three incompatible times.** The note body dims every mark and restores the
   active one via an injected rule (`[data-dim-highlights]`, driven from `TiptapEditor.tsx`); native
   greyscales non-focused threads (`StudyHighlightUnderlineGrayscale`); the reader has no per-mark dim
   at all — its focus mechanism is whole-verse opacity, a different channel entirely. Three
   mechanisms, one idea.

### Where they already agree

Worth preserving: the unsaved dictionary suggestion is pixel-identical in reader and dock; every
accent resolves to the same `--pds-highlight-*` tokens (aliased from `--study-dock-accent-*` in
`spa/src/styles/prototype-tokens.css`, whose hex values live in one file,
`src/styles/study-highlight-accent-colors.css`); and every surface uses an underline rather than a
background wash, which is the house idiom and should stay.

---

## The proposed spec

One table, four surfaces, no exceptions:

| State | Style | Thickness | Offset | Colour source |
|---|---|---|---|---|
| Dictionary suggestion, unsaved | dotted | 1.5px | 3px | `--pds-text-tertiary` |
| Saved reference | solid | 2px | **3px** | `--reference-accent` |
| Highlight | solid | 2px | **2px** | `--mark-accent` |
| Highlight, dimmed by spotlight | solid | 2px | 2px | `--pds-text-tertiary` |

**Decided August 21, 2026, and it is not the table this doc originally proposed.** Everything
levels on **2px**, not on the dock's 3. The distinction between a saved reference and a highlight
is carried by **offset** instead of thickness: 3px holds the line away from the word so it reads
as annotating it, 2px sits it close so it reads as attached to it.

That inverts which platform moves, and it is the better trade. The original table asked the reader
and the note body to go 2px → 3px — a thickness change to the most-looked-at text in the product,
and the top risk in this doc's own watch-list. Levelling down instead means **the chapter's
thickness never changes at all**; only its offset moves by a pixel. What moves instead is the
dock (3px → 2px) and native's `NSUnderlineStyle.thick`, which comes down to meet web rather than
web going up to meet it.

**Reading of the table:** weight carries meaning. A dotted hairline is an offer; 2px solid is
something you kept; 3px solid is something you marked. That ordering is already latent in the dock,
which is the only surface that currently distinguishes a reference from a highlight by weight — the
proposal is to make the rest of the app agree with it.

**Goal:** a mark means the same thing wherever it appears.

**Build:**
- Reader highlight moves 2px → 3px, offset 3 → 2, matching dock and native.
- Note body gains a `mark[data-reference]` rule at 2px so a saved reference stops impersonating a
  highlight.
- Dock stops writing `text-decoration-color` directly and adopts the `--mark-accent` variable route,
  so all three web surfaces can be dimmed by one mechanism.
- Consolidate the two web spotlights onto that variable — **and native with them.** The parity spec
  §5 would permit native keeping its greyscale as a platform difference, and that was the
  recommendation; the call went the other way. One dim model across all four surfaces, so "one
  mechanism dims marks everywhere" is true without a footnote.

**Reuse:** `--mark-accent` and `--reference-accent` already exist and already work in two surfaces.
The accent tokens, their dark overrides, and the JS helpers in `src/utils/study-highlight-accents.ts`
all stay as they are. No new token is required.

**Done when:** a highlight on the same verse looks identical in the chapter, in a dock card and in a
note; a saved reference is distinguishable from a highlight on every surface; and one CSS variable
dims marks everywhere on web.

---

## The selected-verse half (#5)

The floating action toolbar (`spa/src/pages/prototype/PrototypeBibleReaderPane.tsx`) offers four
actions — Highlight, Annotate, Passages, Note — positioned from the last client rect of the
selection's end verse and portalled to `document.body`.

**What is working and should not be redesigned away:**

- **Selection is grey, never a palette colour.** The CSS comment explains why: selecting is something
  you are doing now, highlighting is something you kept. If selection borrowed an accent, a blue
  selection and a blue highlight would be the same mark, and you could not see what a highlight is
  about to become while choosing its colour.
- **Highlight commits immediately, then opens the palette.** You get a mark first and can recolour
  second, rather than being asked to choose before anything happens.
- **Annotate shows a dot when one already exists**, so the button says whether it will create or
  reopen.

**The one real defect: the toolbar does not know about the dock carousel.** Since the reader gained a
multi-card dock, two portals share the screen — the toolbar goes to `document.body`, the carousel to
the shell's dock layer — and nothing collision-detects them. A selection low in the viewport puts the
action capsule over the dock band. Two mitigations exist but neither is collision handling: Annotate
and Passages both clear the selection right after opening a card (so the toolbar leaves of its own
accord), and the dock layer is in the outside-click allow-list (so touching a card does not dismiss a
selection). A verse selected near the bottom of a chapter with a card already open still overlaps.

**Suggested fix, when this is implemented:** flip the toolbar above the selection when its projected
bottom would enter the dock band, reusing the same flip logic
`src/components/react/LinkPreviewCard.tsx` already has for viewport edges.

---


## Outstanding

Two pieces of this spec are decided but not built. Everything else shipped August 21, 2026.

### 1. One spotlight mechanism across all four surfaces

The decision was a single dim model everywhere, native included — the parity spec §5 would have
permitted native keeping its greyscale, and that was the recommendation; the call went the other
way, so that "one mechanism dims marks everywhere" is true without an exception to remember.

**The blocker is gone.** The dock used to write `text-decoration-color` directly per `data-color`,
so there was no variable to override; it now routes through `--mark-accent` like the reader and
note body (`src/styles/scripture-pill-chrome.css`). All three web surfaces can therefore be dimmed
by one rule for the first time.

**What is left:** three mechanisms to collapse into one.

| Today | Where |
|---|---|
| Note body dims marks via an injected `[data-dim-highlights]` rule | driven from `TiptapEditor.tsx`, styles in `prototype-editor.css` |
| Reader fades whole verses by opacity | `data-focus` on `.pds-reader__verses` — a different channel entirely, not per-mark |
| Native greyscales non-focused threads | `StudyHighlightUnderlineGrayscale` |

The reader's is the awkward one: whole-verse opacity is not a per-mark dim and does not become one
by renaming it. Deciding whether the reader gains a per-mark dim *in addition to* its focus fade,
or whether the fade is considered its implementation of the same idea, is the first question.

### 2. Native's underline weight needs measuring, not assuming

The decision reads "everything levels on 2px and native's `NSUnderlineStyle.thick` comes down with
it". That instruction cannot be followed literally, and following it approximately would be a
regression.

`.thick` is not a pixel value. AppKit sizes underlines from the font's own metrics, and `.thick` at
body size is already roughly 2px — which means **the dock's CSS 3px was never really mirroring
it**. That 3 was an approximation, and lowering the dock to 2 has probably moved web *toward*
native rather than away from it.

The only other option in that enum is `.single`, which is roughly 1px: thinner than web, and a
regression wearing parity's clothes. So nothing was changed.

**What is left:** put the new 2px web mark beside a native one on a device and compare. If they
match, record that and close this. If they do not, the fix is a custom underline thickness in
`HarvousLayoutManager`'s `drawUnderline`, which already special-cases `.thick` to add a 2pt gap and
is therefore the place that could set a width too.

---
## Risks / watch-items

- **Changing the reader's thickness touches the most-looked-at text in the product.** It should be
  looked at in prose and lines layouts, light, dark, and wallpaper, before it is called done.
- **`box-decoration-break: clone`** is load-bearing in reader and note body — a highlight spanning a
  line break must not lose its underline on the second line.
- **The reader's underline sits on an inner text span** (`.pds-reader__verse-text`), added so the
  verse number is not underlined. Any thickness change goes there, not on the verse element.
- **`HighlightDockWeb` renders its excerpt as plain text** with no accent painting at all — only the
  header swatch carries colour. Whether the excerpt inside the card should show the mark is an open
  question this spec does not answer.
- **Native divergence is allowed but should be deliberate.** Native's non-focused greyscale has no
  web equivalent; if the web spotlight is consolidated, it is worth deciding whether web should adopt
  greyscale or keep dimming to tertiary.
- **No gallery scene covers the mark states.** `ds-14-reader` shows the reader canvas but not the
  four-mark matrix. A scene showing all four states across surfaces would make this spec checkable
  rather than aspirational.

---

## Related docs

- `docs/future/READER_PARTIAL_VERSE_HIGHLIGHTS.md` — how a sub-verse mark would render under this spec
- `docs/future/SUGGESTION_ACTIONS_REDESIGN.md` — reuses the note-body spotlight for two suggestion kinds
- `docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` — §0 native-first, §3 colour and surfaces
- `docs/design-parity/HARVOUS_DESIGN_PARITY_SPEC.md` — §5 allowed cross-platform differences

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-21 | **Everything levels on 2px, not 3.** The dock drops 3px → 2px and native's `.thick` comes with it; the reader and note body keep their thickness. | Derek's call, against my recommendation to level up. It avoids the top risk in this doc's own watch-list — a thickness change to the most-looked-at text in the product — by moving the two surfaces nobody stares at instead. Web stops chasing native here; native comes to meet web. |
| 2026-08-21 | **A saved reference and a highlight are told apart by offset, not weight.** Reference at 3px, highlight at 2px. | Follows from levelling on 2px: the thickness difference that was going to carry the distinction is gone, so something had to. Offset reads as meaning — held away from the word is annotating it, sat close is attached to it — and it was already a per-state value in the spec table. Rejected: accepting they look identical, and relying on colour (which breaks the moment someone highlights in amber). |
| 2026-08-21 | **One spotlight mechanism across all four surfaces**, native included. | Derek's call, against my recommendation. The parity spec §5 would have permitted native keeping its greyscale, but a single model makes "one mechanism dims marks everywhere" true without an exception to remember. Requires the dock to stop writing `text-decoration-color` directly and adopt the variable route. |
| 2026-08-21 | **The toolbar/dock-band collision is fixed as part of this**, by flipping the toolbar above the selection when its projected bottom would enter the band. | The one real defect in the selected-verse half, in a file this work already touches. Reuses the flip logic `LinkPreviewCard.tsx` has for viewport edges. |
| 2026-08-21 | **`HighlightDockWeb`'s excerpt stays plain** — no mark painted. | A mark distinguishes marked text from unmarked text, and that card has no unmarked text: the excerpt *is* the highlight. Different from the scripture dock, where a mark sits inside a fuller passage and genuinely separates part from whole. |
