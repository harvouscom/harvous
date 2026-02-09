# ThreadCombobox: Color picker not opening on PWA (mobile)

**Status:** Open. Works in Chrome DevTools device emulator; does **not** open when tapping the thread color bar in the installed PWA (e.g. Add to Home Screen on iOS/Android).

**Location:** Create Thread row in `ThreadCombobox` — the left accent bar (44px strip with layer icon) that should open the color swatch dropdown.

**Relevant file:** [src/components/react/ThreadCombobox.tsx](../src/components/react/ThreadCombobox.tsx) (Create row ~lines 598–720, color button ref callback ~616–654, scroll-container effect ~108–123).

---

## What we’ve already tried

### 1. Touch handling on the color button

- **Inline `onTouchEnd` with `preventDefault()`**  
  Result: Console error *"Unable to preventDefault inside passive event listener"* — React’s synthetic touch handlers are passive by default, so `preventDefault()` is ignored and the tap wasn’t handled correctly on mobile.

- **Non-passive touch listeners via `useEffect` + ref**  
  Switched to `addEventListener('touchstart' | 'touchend', handler, { passive: false })` on the button ref so we can call `preventDefault()`.  
  Result: Fixed the passive-listener error in emulator; color picker still does not open on PWA.

### 2. When listeners are attached (timing / portal)

- **Effect with empty deps `[]`**  
  Listeners were attached once on mount. The Create row (and color button) only mount when the dropdown is **open**. If the user opens the dropdown after the component has mounted (typical in PWA), the button didn’t exist when the effect ran, so listeners were never attached.

- **Effect with `[open]` deps**  
  Effect re-runs when `open` becomes true so we attach when the dropdown (and button) are in the DOM.  
  Result: Still no color picker on PWA; possible ref timing when content is portaled.

- **Callback ref on the color button**  
  Replaced `ref={createThreadAccentBarRef}` with a callback ref that attaches/detaches touch and pointer listeners when the button mounts/unmounts. No dependency on effect timing.  
  Result: Listeners should attach as soon as the button exists; color picker still does not open on PWA.

### 3. Scroll container claiming the touch (PWA standalone)

- **Hypothesis:** In PWA standalone, the scroll container (`overflow-y-auto`, `touch-action: pan-y`) might win the hit-test and consume the touch for scrolling before the button receives it.

- **Scroll container capture-phase `touchstart`**  
  Added a non-passive, capture-phase `touchstart` on `scrollContainerRef`. If `event.target` is inside the color button (`createThreadAccentBarRef.current?.contains(target)`), we call `preventDefault()` so the browser doesn’t use the touch for scroll and the event can reach the button.  
  Result: No change in PWA behavior.

### 4. Pointer events in addition to touch

- **`pointerdown` / `pointerup` on the color button**  
  For `pointerType === 'touch'`, we call `preventDefault()` and toggle the dropdown, in case PWA delivers pointer events when touch is unreliable.  
  Result: No improvement on PWA.

### 5. Visible fallback control (reverted)

- **Separate “Color” button** (swatch + “Color” label) between the thread name input and the Add button, using only `onClick`.  
  Result: Gave a second way to open the picker but was removed per product preference — we should fix the bar itself, not add extra UI.

---

## Current implementation (as of this doc)

- **Color button:** Callback ref that on mount adds:
  - `touchstart` / `touchend` with `{ passive: false, capture: true }` (preventDefault + toggle).
  - `pointerdown` / `pointerup` (capture) for `pointerType === 'touch'` (preventDefault + toggle).
- **Scroll container:** When dropdown is open, a capture-phase non-passive `touchstart` on the scroll container that calls `preventDefault()` when the target is inside the color button.
- **Desktop:** `onClick` on the button still toggles the dropdown.
- **Layout:** Create row has the left accent bar (button, z-20), then content (input + Add). No extra “Color” control.

---

## What still needs to be fixed

1. **Why the bar tap doesn’t open the picker in PWA**  
   On a real device in standalone/installed PWA:
   - Confirm whether touch/pointer events reach the button at all (e.g. log in handlers or use remote debugging).
   - Check if another node is on top (z-index, stacking context, overlay from BottomSheet/card-stack) or capturing touches (e.g. Radix Sheet, card-stack__content, or another wrapper).
   - Check whether the dropdown is portaled into `cardStackContentRef` and if that portal or its container affects hit-testing or event delivery in standalone.

2. **Device/browser specifics**  
   Note whether the failure is:
   - iOS only, Android only, or both.
   - Standalone (Add to Home Screen) only, or also in-browser mobile.
   - Any difference when the New Note panel is in a BottomSheet vs another layout.

3. **Alternatives if the bar stays unreliable in PWA**  
   - Consider a minimal, non-intrusive fallback (e.g. a single “Color” text link or small swatch) that uses only `onClick` and is styled to match the row, if product allows.
   - Or move color selection to a different step (e.g. after thread name, or in a follow-up screen) so it doesn’t depend on the bar tap in that exact scroll/portal context.

---

## Quick reference: key code spots

| What | Where in ThreadCombobox.tsx |
|------|-----------------------------|
| Scroll container preventDefault when target is color button | Effect ~108–123, `scrollContainerRef` |
| Color button ref callback (touch + pointer listeners) | Button `ref` callback ~616–654 |
| Color button (accent bar) | Create row, `shouldShowCreateFromSearch`, ~598–668 |
| Dropdown portaled into card content (NewNotePanel) | `dropdownPortalTargetRef={cardStackContentRef}` from parent |
| Create row / dropdown visibility | Rendered only when `open` is true; Create row when `shouldShowCreateFromSearch` |
