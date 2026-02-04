# Execution Plan for Claude Sonnet

**Purpose:** This document is a step-by-step plan for an AI agent (Claude Sonnet) to execute. Follow the tasks in order. Use the repo’s `AGENTS.md` and codebase as the source of truth; ignore outdated roadmap docs in `docs/archive/` and `docs/future/` for scope.

**Project:** Harvous – Astro + React Islands + Turso. Key paths: `src/components/react/`, `src/utils/`, `src/styles/`, `src/pages/api/`.

---

## Task 1: Use safeFetch for Menu delete actions

**Goal:** Make thread/note/space delete flows in the app use the shared resilient client so they get retries, timeout, and consistent error handling.

**Steps:**

1. Open `src/components/react/Menu.tsx` and locate `performErase` (or equivalent). It currently uses raw `fetch()` for DELETE requests to `/api/threads/delete`, `/api/notes/delete`, `/api/spaces/delete`.
2. Open `src/utils/safe-fetch.ts`. Confirm the API: `safeFetch(url, options)` and `safeFetchJSON<T>(url, options)` with `RequestInit`-style options (method, headers, etc.).
3. In `Menu.tsx`, replace the delete `fetch()` calls with `safeFetch` or `safeFetchJSON`. Preserve existing behavior: same URL/query params, same credentials, same success/error handling and navigation/toast. Add the import from `@/utils/safe-fetch` (or the correct alias used in the project).
4. Run the app and test: delete a note, thread, and space (with network on). Then test with network throttling or offline to ensure errors are handled and no regressions.

**Acceptance criteria:**

- All delete requests in `Menu.tsx` go through `safeFetch` / `safeFetchJSON`.
- Success and error paths (toast, navigation, offline behavior) match previous behavior.
- No new console errors or TypeScript errors.

---

## Task 2: Menu accessibility (keyboard + focus + ARIA)

**Goal:** The “more” menu (three-dot menu that opens options) is keyboard-usable and has proper roles/labels so screen readers and keyboard users can use it.

**Steps:**

1. Open `src/components/react/Menu.tsx`. Find the root element that wraps the menu options (the list of actions like Edit, Erase, etc.).
2. Add appropriate ARIA and semantics:
   - Container: `role="menu"` (or `role="dialog"` if it’s a popover; choose based on existing pattern). Ensure `aria-label` or `aria-labelledby` describes the menu.
   - Each actionable option: `role="menuitem"` (or equivalent), and ensure it’s focusable (`tabIndex={0}` or use a `<button>`).
3. Implement keyboard behavior:
   - **Escape:** Close the menu and return focus to the trigger (the button that opened it). If there’s an `onClose` callback, call it.
   - **Arrow keys:** Optional but good: move focus between menuitems (ArrowUp/ArrowDown or ArrowLeft/ArrowRight).
4. Focus management: When the menu opens, move focus to the first menuitem (or the menu container if that’s the pattern). When it closes, restore focus to the trigger. Use a ref for the trigger if needed.
5. Ensure the confirm dialog (e.g. “Erase?”) is also keyboard-accessible (Escape to cancel, focus trap if it’s a modal). If it’s implemented in `EraseConfirmDialog` or similar, apply the same rules there.

**Acceptance criteria:**

- Menu can be opened via keyboard (Enter/Space on trigger), closed with Escape, and options are reachable with Tab or arrows.
- Screen reader announces the menu and each option.
- Focus returns to the trigger after close.
- No duplicate or missing focusable elements.

---

## Task 3: BottomSheet – replace setTimeout with lifecycle/callbacks

**Goal:** Remove arbitrary `setTimeout` delays used for “wait for panel to be ready” and use React/Radix lifecycle or callbacks instead.

**Steps:**

1. Open `src/components/react/BottomSheet.tsx`. Search for `setTimeout(`.
2. For each `setTimeout`:
   - If it’s used to “wait for panel to mount” before calling `window.initThreadCreation` or `window.setupCreateNoteButton`: replace with a `useEffect` that runs when `drawerType` and `isVisible` are set (e.g. when the sheet content is visible), and call those functions in that effect. If the child panel needs to signal “ready,” add an optional callback prop or use a ref + effect inside the panel instead of a delay.
   - If it’s for animation (e.g. “wait 250ms then close”): prefer Radix’s `onCloseAutoFocus` / `onOpenChange` or transition end events; only keep a timeout if the API has no alternative and document why.
3. After changes, verify: open New Note, New Thread, and New Resource panels on mobile (or narrow viewport). Confirm create-note and create-thread flows still work and no new focus/scroll bugs.

**Acceptance criteria:**

- No `setTimeout` used purely to “wait for DOM/panel ready” for thread or note creation.
- Panel open/close and focus behavior unchanged.
- Any remaining timeouts are for animation/UX and documented in a short comment.

---

## Task 4: TiptapEditor – reduce toolbar/cursor setTimeout usage

**Goal:** Make toolbar positioning and cursor visibility more reliable by using events or refs instead of ad-hoc timeouts where possible.

**Steps:**

1. Open `src/components/react/TiptapEditor.tsx`. Search for `setTimeout(` and group usages:
   - Toolbar position updates (e.g. “wait 30ms then update position”).
   - Cursor scroll / “keep cursor above toolbar” logic.
   - Pill creation or selection-related delays.
2. For toolbar position:
   - If there’s a debounced “update toolbar position” that uses setTimeout(..., 30): keep a single debounce if needed, but trigger it from selection change or focus events (or Tiptap’s transaction/update) instead of unrelated timeouts. Ensure the debounce is cleared on unmount.
   - Prefer `requestAnimationFrame` or a single “after update” callback from the editor if the API supports it, instead of multiple staggered timeouts.
3. For “scroll cursor into view” / “keep cursor above toolbar”:
   - Prefer running after the editor’s update or selection change (e.g. in an `onUpdate` or selection listener) with at most one rAF or short debounce, instead of several timeouts (e.g. 50ms + 30ms).
4. Leave timeouts that are clearly for “wait for animation/transition” (e.g. 250ms for a modal) but add a one-line comment. Remove or consolidate redundant timeouts that exist only to “wait for layout.”
5. Run the app: type in the editor, select text, open the bubble menu, resize or open virtual keyboard on mobile. Confirm toolbar stays aligned and cursor remains visible; fix any regressions.

**Acceptance criteria:**

- Fewer `setTimeout` calls in TiptapEditor, especially for toolbar position and cursor visibility.
- Toolbar and cursor behavior unchanged or improved; no new overlap or jumpiness.
- Remaining timeouts are justified in comments.

---

## Task 5: InfiniteScrollList – observer-driven initial load, no jitter

**Goal:** Avoid duplicate or flickery loads by making the initial “load more” and sentinel-driven load logic observer- and state-driven, not timer-driven.

**Steps:**

1. Open `src/components/react/InfiniteScrollList.tsx`. Find all `setTimeout(` and `useEffect` hooks that trigger `handleLoadMore`.
2. Initial load: If “load more” is triggered after a timeout (e.g. 100ms) to “wait for mount,” replace with an effect that runs when the container is visible (e.g. using the same visibility check or IntersectionObserver you already have) and `hasMore && items.length < expectedCount`. Use one observer or one effect to trigger the first load when the sentinel (or container) becomes visible, instead of a timeout.
3. Cooldown: Keep a short cooldown (e.g. 400ms) between load requests if needed to prevent double-firing, but base it on “last load finished at X” rather than arbitrary “wait 100ms after mount.”
4. Tab visibility: The existing “tab becomes visible” logic should still trigger a load when needed; ensure it doesn’t double-fire with the initial load. Use refs (e.g. `initialLoadAttemptedRef`) consistently so only one path runs the first load.
5. Test: Open a page with an infinite list (e.g. notes or threads). Scroll to bottom, switch tabs and back, resize. Confirm no duplicate requests, no error flicker, and list fills as expected.

**Acceptance criteria:**

- No setTimeout used for “wait for mount” before first load; first load is driven by visibility/observer or a single effect.
- Cooldown prevents duplicate loads without delaying legitimate ones.
- No new infinite loops or missing loads.

---

## Task 6: Semantic CSS for Menu (and optionally BottomSheet)

**Goal:** Replace utility/Tailwind-like class names in the touched components with semantic classes and move styles into the project’s semantic CSS files.

**Steps:**

1. Open `src/components/react/Menu.tsx`. List all class names that look like utilities (e.g. `flex`, `gap-*`, `p-*`, `fill-[var(--color-deep-grey)]`). Check how other components in the project do semantic classes (e.g. `src/components/react/SearchInput.tsx` or `src/styles/forms.css`).
2. Add a small section in an existing semantic file (e.g. `src/styles/panels.css` or `src/styles/forms.css`) or create `src/styles/menu.css` for menu-specific styles. Define classes such as `.menu`, `.menu__list`, `.menu__item`, `.menu__icon`, and map current spacing/color/layout to these classes using existing design tokens (e.g. `var(--color-deep-grey)`, spacing from `spacing.css`).
3. In `Menu.tsx`, replace utility-style classes with the new semantic classes. Remove any inline `className` that uses Tailwind-like tokens; use the semantic classes and CSS variables in the stylesheet instead.
4. If you touch `BottomSheet.tsx` in this sprint, apply the same idea: one or two semantic classes for the parts you change, and move layout/color into `panels.css` or a shared file. Don’t refactor the whole file; only what’s necessary for the changes in Task 3.
5. Confirm no visual regressions: menu and panels look and behave the same.

**Acceptance criteria:**

- Menu (and any updated panel parts) use semantic class names and shared CSS files; no Tailwind-like utility classes in JSX for those components.
- Styles use project tokens (variables, spacing) and match existing design.
- `AGENTS.md` / project preference is “semantic CSS, no Tailwind”; this task aligns with that.

---

## Task 7: Quick accessibility spot check

**Goal:** Catch obvious a11y issues in the components you changed.

**Steps:**

1. For `Menu.tsx` and the confirm dialog: Tab through the flow, use Escape, and ensure focus order and visible focus indicators make sense. If the project uses `:focus-visible`, ensure buttons/links have a visible focus ring.
2. For `BottomSheet.tsx`: When the sheet opens, focus should move into the sheet (e.g. first focusable element or title). When it closes, focus should return to the trigger. Check that Radix Sheet’s `onCloseAutoFocus` / `onOpenAutoFocus` are used if available.
3. For `TiptapEditor.tsx`: Ensure the editor has a visible focus state and an `aria-label` or `aria-labelledby` if it’s the main content. Toolbar buttons should be focusable and have accessible names (e.g. “Bold”, “Italic”).
4. Fix any clear violations: missing labels, no focus indicator, or focus trap issues. Don’t do a full audit; only address what’s quick and relevant to the changed components.

**Acceptance criteria:**

- No obvious keyboard or screen-reader blockers in Menu, BottomSheet, and TiptapEditor.
- Focus and ARIA improvements from Task 2 are still in place and consistent with this spot check.

---

## Execution order and handoff

Execute in order: **Task 1 → 2 → 3 → 4 → 5 → 6 → 7**.  
After each task, run the app and confirm the acceptance criteria before moving on. If the codebase structure differs (e.g. different file paths or no `safeFetch`), adapt the steps to match the repo; this plan is the intended behavior, not a strict file map.

**References:**

- Project rules and patterns: `AGENTS.md` at repo root (no arbitrary delays; event-driven; fallback refresh when navigating).
- API client: `src/utils/safe-fetch.ts`.
- Components: `src/components/react/Menu.tsx`, `BottomSheet.tsx`, `TiptapEditor.tsx`, `InfiniteScrollList.tsx`.
- Styles: `src/styles/` (e.g. `panels.css`, `forms.css`, `tiptap-editor.css`).
