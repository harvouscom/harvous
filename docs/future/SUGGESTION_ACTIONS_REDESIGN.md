# Suggestion Actions — Options

**Status:** Decision doc. Two contained fixes shipped alongside it (see [Already fixed](#already-fixed)).
**Last Updated:** August 21, 2026
**Audience:** Whoever decides what a reader can say to a suggestion, and whoever implements it.
**Covers:** improvement-list item #19 (suggestion action redesign), and the unresolved half of #2
(pointing at the suggested item as a general pattern).

---

## Executive summary

Home's Suggested shelf offers five controls that express three behaviours, spread across two
surfaces, with one of them lying about what it does.

**Recommendation: Option B — two answers, honestly labelled.** "Not now" (rests it, 21 days) and
"Not interested" (genuinely permanent). Today's "Ignore" already promises the second and delivers
the first; the fix is to build the thing users already believe exists rather than to soften the copy
down to what the code does.

The single most important finding is not a design question at all:

> **"Don't suggest this again" is a 21-day snooze.** The tooltip at
> `spa/src/pages/prototype/PrototypePaperStack.tsx:221` promises permanence. The handler
> (`spa/src/layouts/SimplifiedPrototypeLayout.tsx:535-546`) posts `action: 'snooze'` and calls
> `recordRecallSnoozed(...)` with no window, defaulting to `RECALL_COOLDOWN_DAYS = 21`. It is
> **byte-identical in effect** to the shelf's "Not now" ✕. No permanent suppression exists anywhere
> in the system.

The two controls differ only in wording and in where they leave you.

---

## The alternatives

| Option | Verdict | Trade-off |
|---|---|---|
| A. One answer — "Not now" everywhere, remove Ignore | Honest and simplest | Removes a promise users already rely on; nothing ever goes away for good |
| **B. Two answers — "Not now" (21d) + "Not interested" (permanent)** | **Recommended** | One new event action and a merge rule that never expires; matches what the tooltip already claims |
| C. Keep five controls, fix only the copy | Cheapest | Leaves five controls for three behaviours, and the shelf still has no way to say "never" |
| D. Three answers — add an explicit "Snooze" with a chosen duration | Not recommended | A duration picker is a lot of interface for a suggestion card, and the deck already rotates daily |

---

## What exists today

### Two surfaces, five controls

**The shelf row** (`spa/src/pages/prototype/PrototypeRecallCarousel.tsx`) — two actions:

| Control | Copy | Effect |
|---|---|---|
| Row body (tap) | accessible name is the row's own title + meta | posts `open`, then rests **7 days** |
| Trailing ✕ | `title="Not now"`, aria `Not now — remind me later about {title}` | posts `snooze`, rests **21 days** |

**The paper-stack peek edge** (`spa/src/pages/prototype/PrototypePaperStack.tsx:193-235`), shown only
while a sheet is up over a suggestion — three more:

| Control | Copy | Effect |
|---|---|---|
| The edge itself | `title="Nevermind"` | `restoreRecallOpportunity` — **un-suppresses**, per-device only |
| Eye-slash | `title="Don't suggest this again"` | posts `snooze`, rests **21 days** (see above) |
| ✕ | `title="Put the way back down"` | clears the stack. Records nothing |

### The windows

All in `spa/src/pages/prototype/proto-recall-cooldown.ts`:

| Constant | Value | Applies to |
|---|---|---|
| `RECALL_OPENED_COOLDOWN_DAYS` | 7 | open |
| `RECALL_COOLDOWN_DAYS` | 21 | snooze, ignore |
| `RECALL_COMPLETED_COOLDOWN_DAYS` | 30 | complete |

### Four problems worth naming

1. **Ignore is a 21-day snooze wearing permanent-sounding copy.** Covered above. Note the layout's
   own doc comment is accurate where the tooltip is not.
2. **Four kinds never get the edge actions at all.** `arc`, `subject`, `crossref` and `connectNotes`
   are in `SIDEBAR_LAYER_RECALL_KINDS` (`spa/src/pages/prototype/paper-stack-origins.ts`), so
   `buildRecallCardStackOrigin` returns `null` and no edge is built. For those, the only answers are
   the row tap and the row ✕. Nevermind and Ignore are unreachable.
3. **The edge dies on navigation, taking the only undo with it.** Per the verdict table in
   `spa/src/pages/prototype/paper-stack-teardown.ts`, a `homeCard` origin survives Home, the same
   note, and — since recently — a chapter opened by a passage card. Everything else clears it. Wander
   to a second note and the 7-day open-rest stands with no way to undo it: `restoreRecallOpportunity`
   has exactly one caller, on the edge that just disappeared.
4. **Nevermind is per-device.** It writes a local `recallRestored` mark and posts no event
   (`proto-recall-cooldown.ts`, documented in its own comment). Undoing on a laptop does not undo on
   a phone.

### What "open" costs

`open` is charged at the tap, before the handler runs
(`PrototypeRecallCarousel.tsx` — the event and `onOpened` both fire ahead of `op.onOpen()`). Tapping
a suggestion and immediately abandoning it still costs the suggestion 7 days, locally and on the
server. This is deliberate and documented, and it is close to Derek's instinct that "switching away
without writing anything should also count as not now" — the behaviour is already roughly that. The
open question is only whether an *abandoned* open should cost less than a followed-through one, which
is now answerable because `complete` exists to tell them apart.

---

## Option B in detail

**Goal:** two answers that mean what they say, available everywhere a suggestion is.

**Build:**
- Add `dismissed` to `RECALL_EVENT_ACTIONS` (`src/utils/recall-opportunity-kinds.ts`), validated
  server-side in `server/utils/record-recall-event.ts` and carried through
  `collapseRecallHistory` like `complete` already is.
- In `mergeServerRecallHistoryIntoCooldowns` (`proto-recall-cooldown.ts`), `dismissed` suppresses with
  **no expiry** — the one action whose window is infinite. Everything else keeps its current window.
- Relabel: the eye-slash becomes "Not interested" and actually is. The shelf ✕ stays "Not now".
- Put both answers on the **shelf row**, not only the edge, so the four sidebar-layer kinds can be
  answered at all and so the answer survives navigating away.
- `restoreRecallOpportunity` becomes the undo for both, and should post an event so it works
  cross-device — otherwise a permanent dismissal made on a phone cannot be undone on a laptop.

**Reuse:** the entire `complete` path added in commit `7c8ac4406` is the template — action constant,
server validation, history collapse, merge window, cooldown test. `dismissed` is the same shape with
an infinite window.

**Done when:** every suggestion kind can be answered from the shelf; "Not interested" never returns;
"Not now" returns after 21 days; both are undoable; and no control's copy overstates its effect.

### The row-shape constraint

`PrototypeHomeRow` (`spa/src/pages/prototype/PrototypeHomeRow.tsx`) splits into a `__row-main`
button plus a sibling `__row-trailing` span when `trailing` is present, because buttons cannot nest.
Two trailing controls on a shelf row therefore means either two siblings in that span — crowding a
260px row that already carries a title, an eyebrow and a meta line — or an overflow affordance.
**Suggested resolution:** keep one visible ✕ ("Not now") and put "Not interested" behind a long-press
or a small overflow, so the common answer stays one tap and the rare, permanent one takes deliberate
effort. That asymmetry is appropriate: permanence should be slightly harder to reach than deferral.

---

## The #2 generalization: pointing at what a suggestion meant

The specific case shipped in commit `1c8e7179a`: a cross-reference suggestion now marks the row it
meant in the source card's related-passages list (`highlightCrossRef` on the scripture dock session;
`isMarkedCrossRef` in `src/components/react/PassageContextStrip.tsx`). Marked, not flashed — you may
read the passage first and come back, and a cue that has faded by then was never for you.

Generalizing it means answering one question per kind: **what did this suggestion point at, and where
does that thing appear once you arrive?**

| Kind | Points at | Already marked? |
|---|---|---|
| `crossref`, `crossrefGap` | a specific related passage | Yes — shipped |
| `passage`, `continueBook` | a verse or chapter | Effectively — the reader's focus fade dims everything else |
| `revisitNote` | the note itself | Not applicable — the note is the whole destination |
| `highlight`, `annotateHighlight` | one highlight inside a note | **No** — the note opens with nothing indicating which highlight |
| `referenceWord` | a looked-up word | **No** |
| `connectNotes` | two notes to join | Partly — they arrive pre-selected in the sheet |
| `studyPerson`, `reflection`, `subject`, `arc` | nothing specific; they generate | Not applicable |

Only two kinds have a real gap: `highlight`/`annotateHighlight` and `referenceWord`. Both point at
something *inside* a note, and the note body already has a dim mechanism
(`[data-dim-highlights]` in `spa/src/styles/prototype-editor.css`, driven from `TiptapEditor.tsx`)
built for exactly this. **Recommendation: reuse the existing note-body spotlight for those two kinds
rather than invent a third emphasis pattern.** See `HIGHLIGHT_REFERENCE_STYLING_SPEC.md`, which
covers the three incompatible spotlight mechanisms currently in the codebase.

---

## Already fixed

Two objective defects were repaired alongside this doc, because they are bugs rather than choices:

1. **The server returned a window too short to cover its own longest cooldown.**
   `RECALL_HISTORY_WINDOW_DAYS` in `server/routes/recall.ts` was 21, with a comment claiming it
   "matches the longest client-side cooldown window" — true when written, false once
   `RECALL_COMPLETED_COOLDOWN_DAYS` became 30. A completion between 21 and 30 days old was never
   returned to the client, so it suppressed only on the device that made it. Now 31, with the comment
   corrected and a test pinning it against the client constants.

2. **The Ignore tooltip no longer promises permanence it does not deliver.** Pending the decision in
   this doc, the copy states what the control does. If Option B lands, this becomes a real permanent
   action and the copy changes back — deliberately, and with the behaviour behind it.

---

## Risks / watch-items

- **`RecallEvents` has no `spaceId`** while the local cooldown store is space-scoped
  (`server/routes/recall.ts`). Cross-device suppression is therefore account-wide while local
  suppression is per-space. A permanent action makes that mismatch matter more.
- **Copy is inline JSX at three sites** — `PrototypeRecallCarousel.tsx`, `PrototypePaperStack.tsx`,
  `SimplifiedPrototypeLayout.tsx` — with nothing centralized. Any relabelling should centralize first,
  or the next drift is guaranteed. This is how the tooltip and behaviour separated.
- **Aria labels use the eyebrow, not the title**, so they read oddly: "Stop suggesting A passage you
  keep returning to". Worth fixing with the copy pass.
- **Tests pin the current strings.** `spa/src/pages/prototype/__tests__/paper-stack-edge.test.tsx`
  asserts exact aria labels; any copy change breaks it, which is correct and intended.
- **No test covers the shelf ✕ or `handleSuggestionIgnore`'s window.** That gap is precisely how the
  tooltip and the behaviour drifted apart. A redesign should close it.
- **`complete` currently fires for exactly one kind** (`connectNotes`, via the create-thread sheet's
  `onCreated`), though it is declared for all. Widening it is a separate piece of work and would make
  the abandoned-vs-followed-through distinction usable.

---

## Related docs

- `docs/future/HIGHLIGHT_REFERENCE_STYLING_SPEC.md` — the spotlight mechanisms referenced above
- `docs/RECALL_USAGE_METRICS_PHASE2.md` — what the events feed
- `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md` — §5 accessibility baseline for icon-only controls

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| | | |
