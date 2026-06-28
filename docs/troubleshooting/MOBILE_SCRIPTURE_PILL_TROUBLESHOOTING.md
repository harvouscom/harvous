# Mobile Scripture Pill — Troubleshooting & Known Limitations

Scope: the inline scripture-draft flow in the **prototypeNative** editor on **iOS Safari**
(`editorChromeMode === 'prototypeNative'`). Desktop uses a different (simpler) path and is mostly
unaffected by these issues.

This doc records the bugs we hit, the fixes we shipped, and the iOS limitations that remain, so
future work doesn't re-derive the same ground. Pairs with the `ios-scripture-draft-lessons` agent
memory and `docs/SCRIPTURE_PILL_IMPLEMENTATION.md` / `docs/SCRIPTURE_FLOW.md`.

## How the draft flow works (mental model)

Typing a reference goes through a transient **draft** before becoming a committed pill:

1. **Detect** — on mobile, a debounced (`250ms`) `onUpdate` timer in `TiptapEditor.tsx` runs
   `runScriptureDraftDetectionAtCursor`, which wraps a detected reference in the **`scriptureDraft`**
   mark (dashed pill). The mark is `inclusive: false` so typed chars at the right edge stay plain.
2. **Grow** — as the user extends a range (`-17`), the tail lands as plain text and is folded into
   the draft. **Desktop**: `makeScriptureDraftGrowPlugin` (an `appendTransaction`) does this live,
   per keystroke. **Mobile**: that plugin is disabled (see Round 3 #1); the same logic runs on the
   debounced idle timer via `unifyScriptureDraftAtCursor` instead.
3. **Confirm** — `confirmScriptureDraftView` replaces the draft text with a committed `scripturePill`
   mark + a trailing spacer, applies the translation, and places the caret after the pill. Triggered
   by the floating ✓ button, a real blur/tap-away, or (desktop) a non-continuation keystroke.

Key files:
- `src/components/react/TiptapScriptureDraft.ts` — the draft mark, grow plugin,
  `computeScriptureDraftGrowth`, `unifyScriptureDraftAtCursor`, `confirmScriptureDraftView`,
  `editScripturePillAsDraft`.
- `src/components/react/TiptapEditor.tsx` — mobile `onUpdate` detection/idle timer, the floating ✓
  positioning effect (`updatePos`), `resolveDetachedDraft`/`resolveOnBlur`, pill tap handlers, the
  delete-confirm floater (`ScripturePillDeleteConfirm`).
- `src/utils/scripture-pill-position.ts`, `src/utils/scripture-pill-spacing.ts` — detection +
  spacing helpers.
- `src/utils/pwa-prompt.ts` — `isMobileDevice()` (the mobile/desktop branch gate).
- `src/styles/study-dock-carousel.css`, `spa/src/styles/prototype-shell.css` — study-dock layout.

Tests: `src/utils/__tests__/scripture-draft.test.ts` (desktop mark path), `src/utils/__tests__/scripture-draft-mobile.test.ts` (mobile decoration path).

---

## The root iOS problem (read this first)

**iOS Safari does not keep a `contenteditable` in sync when you mutate the document
programmatically mid-typing.** ProseMirror's model stays correct, but the *rendered* caret and the
*rendered* text drift: a just-typed character can paint detached, the caret can stick at the line
end, and an inclusive mark can split into two pill fragments. Almost every bug below is a flavor of
this. The two defensive strategies that work:

- **Don't mutate the doc on every keystroke on mobile** — debounce to an idle pass instead.
- **After an unavoidable programmatic mutation, force the native caret back on the next frame.**
  Critically, **re-dispatching a ProseMirror selection is a no-op here**: PM recorded that it already
  synced the DOM selection (iOS moved the *painted* caret without firing a `selectionchange` PM
  acted on), so its desired-vs-current comparison matches and it skips the DOM update. You must set
  the browser `Selection` directly (via `view.domAtPos`) — that's what `resyncMobileCaret` does, and
  it's effectively what typing a real character would do.

---

## Issues & fixes by round

### Round 1–2

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Floating ✓ rendered ~a line too high | `position: fixed` button positioned from `getBoundingClientRect()` (visual viewport) while the keyboard is up (`visualViewport.offsetTop > 0`) | Add `visualViewport.offsetTop/offsetLeft` in `updatePos` |
| 2 | Range dash committed early (`John 3:16-17` → only `John 3:16`) | iOS split the draft into two fragments; `findDetachedScriptureDraft` saw the earlier one as detached and committed it | Single-draft invariant in `computeScriptureDraftGrowth` (merge fragments, anchor at FIRST fragment); gate `resolveOnBlur` behind a deferred focus re-check |
| 3 | Bold stuck on after a pill committed | `ensureScripturePillSpacing` inserted the trailing space before stored marks were cleared, so the space inherited the active bold mark | `tr.setStoredMarks([])` BEFORE `ensureScripturePillSpacing(tr)` |
| 4 | Editing a committed pill | Intended model: **tap a committed pill → opens the scripture dock**, edit the reference there via `ScriptureReferencePickerStrip` → `onApply`. Do NOT hijack the tap for inline draft editing. |

### Round 3

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Typing the 2nd digit of a range hid it under the ✓ / pill looked split; caret jumped far right | The grow plugin mutated the draft mark on **every keystroke** → iOS contenteditable desync | **Debounce grow on mobile**: `makeScriptureDraftGrowPlugin` early-returns when `isMobileDevice()`; new `unifyScriptureDraftAtCursor` runs on the existing 250ms idle timer. Dropped per-keystroke `removeMark` (now `addMark`-only over the merged span). |
| 2 | (same as above — caret) | (same) | Covered by debounce + ✓-hide |
| 3 | Floating ✓ overlapped the char being typed | ✓ sits at the draft's right edge = where the next char lands | Hide ✓ on editor `update`; re-show ~260ms after the last input (`selectionUpdate` only shows immediately when NOT within 260ms of a keystroke). Relies on TipTap emitting `update` before `selectionUpdate`. |
| 4 | Docks pushed right / squeezed with no sidebar | Sidebar-clearance offset is `padding-left: var(--proto-sidebar-w-clamped)` on `.study-dock-carousel__track`, but the reset rules targeted the `__slot` (already 0) and the only track reset was gated to `@media (min-width: 900px)` | Add track `padding-left: 0` resets under `.proto-shell--no-sidebar`, `.proto-shell--sidebar-collapsed`, and `@media (max-width: 899px)` (drawer offset stays on the slot). Add `min-width: min(100%, 320px)` floor to the single-dock card. **The offset is on the TRACK, not the slot.** |

### Round 4 (current)

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | After committing a pill, the caret still jumps to the far right instead of right after the pill | iOS leaves the *visible* caret painted at the line end after the commit mutation (the ProseMirror selection is correct — desktop renders fine) | First attempt: `tr.scrollIntoView()` + a rAF re-dispatch of the same PM selection. **This did not fully work** — re-dispatching the same selection is a no-op (see Round 5). |
| 2 | The "Edit" (pencil) in the pill's floating delete menu tried to edit inline, which doesn't work on mobile | Inline `editScripturePillAsDraft` is unreliable on iOS | The delete-confirm `onEdit` (prototypeNative) now opens the **scripture dock** for the pill (builds a `ScripturePillDockSession` from the pill mark at the boundaries) instead of converting to an inline draft. |

### Round 5

The caret desync wasn't just a commit problem — it happens on **every** programmatic draft mutation
(draft creation, range-grow/unify, and commit), and the Round-4 rAF re-dispatch didn't fix it
because **re-dispatching the same ProseMirror selection is a no-op** (PM thinks the DOM is already
synced; see "The root iOS problem"). The user could see it: caret stuck far right while still in
edit mode; typing a space fixed it; pressing Return made the caret *vanish* (the Enter→confirm path
didn't pass `focus: true`, so the field was left unfocused).

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Caret stuck far right while still in draft/edit mode (and "-N" range tail sometimes rendered as a second dashed fragment) | The draft mark's `addMark` (creation + grow) restructures the contenteditable; iOS strands the painted caret. Round-4's re-dispatch of the same PM selection was a no-op. | New `resyncMobileCaret(view)` sets the native `Selection` directly via `view.domAtPos` on the next frame (mobile only). Called from `enterScriptureDraftView`, `unifyScriptureDraftAtCursor`, and `confirmScriptureDraftView`. |
| 2 | Pressing Return/Enter made the caret disappear | The Enter→confirm handler called `confirmScriptureDraftView(view)` without `{ focus: true }`, so after the commit the field was left blurred and the caret vanished | Pass `{ focus: true }`; `resyncMobileCaret` re-focuses + re-places the caret. |

**Round 5 was insufficient on device** — single-rAF + bare `domAtPos` still left the painted caret at the line end.

### Round 6

Two-pronged fix: harden caret resync for the mark path (post-commit and any legacy mark mutations), and **switch the mobile in-progress draft to ProseMirror inline `Decoration`s** so create/grow/unify no longer restructure the document while typing.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Caret still at line end after Round 5 | Single rAF ran before PM's DOM patch finished; `domAtPos` inside `inline-flex` pill spans mispaints on iOS | **`applyNativeCaret`**: double-rAF + 16ms retry; DOM-first placement via last text node inside `.scripture-pill-draft` / committed pill (same anchor as ✓); focus on first rAF, selection on second |
| 2 | Caret drifts after debounced unify pauses | ✓ re-show did not re-assert native selection | Call `resyncMobileCaret` when the floating ✓ reappears (~260ms idle) in the `updatePos` effect |
| 3 | Caret drifts during draft create/grow on mobile | Any `addMark` mid-type restructures contenteditable (root iOS problem) | **Mobile decoration draft**: `makeScriptureDraftDecorationPlugin()` tracks `{ from, to, attrs }` in plugin state and renders `Decoration.inline` with `scripture-pill-draft` styling — **no mark mutation** on enter/unify. Confirm still `replaceWith` a committed pill. Desktop keeps the mark + grow plugin. |
| 4 | Enter-confirm focus fight | Sync `view.focus()` before rAF resync reset selection | Focus moved into first rAF inside `resyncMobileCaret`; removed sync focus from `confirmScriptureDraftView` |

Key additions:
- `makeScriptureDraftDecorationPlugin`, `scriptureDraftDecorationKey` in `TiptapScriptureDraft.ts`
- Mobile branches in `enterScriptureDraftView`, `unifyScriptureDraftAtCursor`, `findDraftRange`, `getScriptureDraftAnchorPos`, `findDetachedScriptureDraft`, `confirmScriptureDraftView`, `cancelScriptureDraftView`
- Tests: `src/utils/__tests__/scripture-draft-mobile.test.ts` (mocks `isMobileDevice()` → true)

### Round 7

Cannot finish verse ranges like `Number 5:5-10` — draft stuck or commits at `Number 5:5` only.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `-10` never folds into draft; unify never runs mid-range | `detectScriptureReferenceEndingAtCursor` returns null when tail after match is `-` (not empty/whitespace), so `shouldScheduleDraftDetection` is false and the mobile 250ms timer is **cancelled** | **`hasActiveDraft` gate** on `needsScripturePass` — keep the debounced timer armed while any draft exists so `unifyScriptureDraftAtCursor` runs during range entry |
| 2 | Draft commits at `Number 5:5` when reaching `-` on iOS keyboard | `resolveOnBlur` confirms after 120ms even with no continuation tail typed; keyboard-layer switch blurs the field | **`hasDraftContinuationTailInDoc`** + two-phase blur defer (120ms focus check, then +350ms if no tail yet on mobile) |
| 3 | Decoration end swallowed `-` on insert | Plugin mapped `to` with default bias, expanding decoration on every char at boundary | Non-inclusive `to` mapping with bias `-1` (Round 6 follow-up) |

Helpers: `hasActiveScriptureDraft`, `hasDraftContinuationTailInDoc` in `TiptapScriptureDraft.ts`.

### Round 8

Round 6's **mobile decoration draft** regressed range typing on device — the mark-based path (debounced unify) had been working; only caret painting was wrong.

| # | Change | Why |
|---|--------|-----|
| 1 | **Reverted decoration draft** — mobile uses `scriptureDraft` mark again (same as pre-Round-6) | Decoration layer broke `Number 5:5-10` style entry despite passing jsdom tests |
| 2 | **Kept Round 5–6 caret hardening** — `applyNativeCaret`, double-rAF + 16ms retry, resync on ✓ re-show | Fixes painted caret at line end after mark mutations (later reverted in Round 10) |
| 3 | **`applyNativeCaret` respects range tail** | Prevents ✓ re-show resync from stealing the caret mid-range (later simplified in Round 10) |
| 4 | **Kept Round 7 timer + blur defer** | Still needed on the mark path |

### Round 9

Range dash still broken on device after Round 8 revert.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Draft commits or vanishes when reaching `-` | iOS keyboard-layer switch fires `blur`; deferred blur-confirm commits `Numbers 5:5` before the tail is typed | **Disable blur-confirm on mobile while any draft is active** — confirm via ✓ / Enter / selection-leave only |
| 2 | Draft styling stripped after typing `-` alone | `confirmScriptureDraftView` on invalid ref (`Numbers 5:5-`) called `removeMark` | **Keep draft open** when continuation tail chars exist but `draftTextToReference` is not yet valid |
| 3 | Caret jumps while typing tail | ✓ re-show called `resyncMobileCaret` even when caret is past the draft mark | Skip resync when `hasDraftContinuationTailInDoc` and caret is past draft end (later removed entirely in Round 10) |

### Round 10 (current)

Session caret hardening regressed range dash typing; bold stuck after incomplete drafts.

| # | Change | Why |
|---|--------|-----|
| 1 | **Reverted `applyNativeCaret`** — `resyncMobileCaret` back to single-rAF `domAtPos` only | DOM-first placement inside `.scripture-pill-draft` stole the caret at the non-inclusive mark boundary where `-` must land |
| 2 | **Removed `resyncMobileCaret` from unify and ✓ re-show** | Idle resync fought mid-range typing and caused toolbar flicker |
| 3 | **Resync only on user confirm** (`{ focus: true }`) | Matches pre-session behavior that typed correctly; enter resync removed in Round 11 |
| 4 | **Bold fix** — `setStoredMarks([])` on enter/grow; `excludes: 'bold italic'` on draft mark; strip bold on cancel/failed confirm; `BoldCustom` guards draft + pill | Bold stuck/flickered after incomplete drafts |
| 5 | **Kept Round 7–9 guards** — `hasActiveDraft` timer, mobile blur skip, `midRangeEntry` confirm, `isCaretAttached` detached logic | Still needed on mark path |

### Round 11

Dash appears but caret vanishes before typing `-10` digits.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Caret gone right after `-` | `resyncMobileCaret` on draft enter repositioned native selection at the mark boundary; iOS keyboard-layer blur for `-` dropped focus without refocus | **Remove enter resync**; **`scheduleMobileDraftTailCaretSync`** after tail chars; **blur refocus** while draft active (no confirm) |
| 2 | Caret lost after idle unify | `addMark` over tail without focus/selection restore | **unify**: re-set selection to tail end + `view.focus()` on mobile |

### Round 12

Range typing works (Round 11); caret still paints at line end beside the ✓ and after confirm.

| # | Change | Why |
|---|--------|-----|
| 1 | **`canSafelyResyncMobileDraftIdleCaret`** — guard: no plain continuation tail, caret at anchor | Prevents ✓ re-show resync from stealing the caret mid-range (same lesson as Round 9–10) |
| 2 | **Idle resync beside ✓** — 260ms idle timer in `TiptapEditor.tsx` calls `resyncMobileCaret({ pos: anchor, draftIdle: true })` after `updatePos` | Aligns painted caret with pill right edge when user pauses (not while typing `-10`) |
| 3 | **Post-commit resync** — `confirmScriptureDraftView` passes `committedPillFrom` + `caretPos`; DOM fallback finds trailing spacer after `.scripture-pill:not(.scripture-pill-draft)` | `domAtPos` alone often mis-paints after pill commit on iOS |
| 4 | **Still avoided** — enter resync, unify resync, resync during plain tail (`scheduleMobileDraftTailCaretSync` owns that), last-text-node-inside-draft during tail, double-rAF globally | These regressed range dash typing in Rounds 5–10 |

---

## iOS limitations & gotchas (durable)

- **No per-keystroke doc mutation on mobile.** The grow plugin is desktop-only. On mobile the draft uses the **`scriptureDraft` mark** with debounced `unifyScriptureDraftAtCursor` (~250ms idle) to fold range tails in one `addMark`.
- **The ✓ confirm must be a portal OUTSIDE the editor.** iOS refuses to type next to an inline
  `contentEditable=false` widget. It's `position: fixed` and needs the `visualViewport` offset
  correction whenever the keyboard is up.
- **`position: fixed` ≠ `getBoundingClientRect()` coords when the keyboard is up.** Always add
  `visualViewport.offsetTop/offsetLeft`.
- **Programmatic `view.focus()` / selection after a mutation can leave the caret mispainted.**
  Re-assert selection on the next frame.
- **Editing a committed pill happens in the dock, not inline** — mobile has no reliable inline
  reference-edit affordance. Tap the pill (or the floating Edit pencil) → scripture dock →
  `ScriptureReferencePickerStrip`.
- **The study-dock sidebar offset lives on `.study-dock-carousel__track`** — when changing dock
  layout, reset/inherit padding on the *track*, and re-check `--no-sidebar` / `--sidebar-collapsed` /
  `@media (max-width: 899px)` / `--drawer-open` states.
- **`isMobileDevice()`** (`src/utils/pwa-prompt.ts`) returns false in jsdom, so the default unit tests exercise the desktop (mark) path. Mobile draft behavior is covered by `src/utils/__tests__/scripture-draft-mobile.test.ts` (mocked mobile). Caret paint still needs device verification.

## Open issues / needs device verification

- **Round 12 caret paint** — verify on iPhone: draft idle caret beside ✓; post-commit caret after pill + spacer; `Numbers 5:5-10` range typing still works.
- **Round 10 bold** — after abandoning an incomplete draft, bold should not stick on subsequent plain typing.
- **Dock sizing (Round 3 #4)** — verify the dock fills the column and animates correctly at the
  430px / 620px breakpoints and with the sidebar collapsed (desktop ⌘\) vs absent (mobile).

## How to verify

- Unit: `npx vitest run src/utils/__tests__/scripture-draft.test.ts src/utils/__tests__/scripture-draft-mobile.test.ts` (+ the pill/format suites).
- Types: `npx tsc -p tsconfig.json --noEmit` (pre-existing errors elsewhere are unrelated).
- Device (the only way to confirm the iOS-specific items): in `prototypeNative`, type
  `John 3:16-18` then `Hebrews 11:2-7`, confirm each (✓ / tap-away), and check: the range stays one
  pill, the caret lands right after the committed pill, bold isn't stuck on, and the Edit pencil
  opens the dock.
