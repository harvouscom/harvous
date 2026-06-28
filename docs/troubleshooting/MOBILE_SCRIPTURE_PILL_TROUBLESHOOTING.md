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

Tests: `src/utils/__tests__/scripture-draft.test.ts`.

---

## The root iOS problem (read this first)

**iOS Safari does not keep a `contenteditable` in sync when you mutate the document
programmatically mid-typing.** ProseMirror's model stays correct, but the *rendered* caret and the
*rendered* text drift: a just-typed character can paint detached, the caret can stick at the line
end, and an inclusive mark can split into two pill fragments. Almost every bug below is a flavor of
this. The two defensive strategies that work:

- **Don't mutate the doc on every keystroke on mobile** — debounce to an idle pass instead.
- **After an unavoidable programmatic mutation (commit), re-assert the selection on the next frame**
  so the contenteditable repaints.

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
| 1 | After committing a pill, the caret still jumps to the far right instead of right after the pill | iOS leaves the *visible* caret painted at the line end after the commit mutation (the ProseMirror selection is correct — desktop renders fine) | In `confirmScriptureDraftView`: add `tr.scrollIntoView()`, and on mobile re-assert the selection in a `requestAnimationFrame` after dispatch so the contenteditable repaints the caret. **Best-effort — needs on-device confirmation (see Open Issues).** |
| 2 | The "Edit" (pencil) in the pill's floating delete menu tried to edit inline, which doesn't work on mobile | Inline `editScripturePillAsDraft` is unreliable on iOS | The delete-confirm `onEdit` (prototypeNative) now opens the **scripture dock** for the pill (builds a `ScripturePillDockSession` from the pill mark at the boundaries) instead of converting to an inline draft. |

---

## iOS limitations & gotchas (durable)

- **No per-keystroke doc mutation on mobile.** The grow plugin is desktop-only. Anything that needs
  to reshape the draft while typing must run on the debounced idle timer, not synchronously.
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
- **`isMobileDevice()`** (`src/utils/pwa-prompt.ts`) returns false in jsdom, so unit tests exercise
  the desktop (synchronous) path. Mobile-only behavior (debounce, caret resync) can't be covered by
  the current unit tests and needs device/preview verification.

## Open issues / needs device verification

- **Post-commit caret resync (Round 4 #1)** is a best-effort fix. If the caret still lands far
  right on device, candidates to try next: explicitly setting the native `Selection` via
  `view.domAtPos` after dispatch; a brief blur/refocus; or deferring the whole commit's
  `setSelection` to a second transaction. Verify on a real iPhone — a desktop browser preview can't
  reproduce it (gated behind `isMobileDevice()`).
- **Dock sizing (Round 3 #4)** — verify the dock fills the column and animates correctly at the
  430px / 620px breakpoints and with the sidebar collapsed (desktop ⌘\) vs absent (mobile).

## How to verify

- Unit: `npx vitest run src/utils/__tests__/scripture-draft.test.ts` (+ the pill/format suites).
- Types: `npx tsc -p tsconfig.json --noEmit` (pre-existing errors elsewhere are unrelated).
- Device (the only way to confirm the iOS-specific items): in `prototypeNative`, type
  `John 3:16-18` then `Hebrews 11:2-7`, confirm each (✓ / tap-away), and check: the range stays one
  pill, the caret lands right after the committed pill, bold isn't stuck on, and the Edit pencil
  opens the dock.
