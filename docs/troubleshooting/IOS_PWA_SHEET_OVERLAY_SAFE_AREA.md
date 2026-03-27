# iOS PWA: Sheet / modal backdrop and the status bar (safe area)

**Update:** The **1.205.x safe-area experiment** (`--safe-area-top`, `src/utils/safe-area.ts`, `public/scripts/safe-area-top.js`, `SheetOverlay` state, `black-translucent` meta, layout/nav/panels tweaks) was **rolled back** in favor of the **pre-1.205.0 overlay stack** (aligned with commit `d5174ef7` for overlay-related files). That stack uses plain `SheetOverlay`, `.sheet-overlay { top: env(safe-area-inset-top, 0px) !important; }`, and modal `clip-path` — the main remaining quirk is **`env()` often resolving to `0` on iOS PWA**, so the dimmer can still sit **behind** the status bar, but without the worse misalignment (e.g. nav not dimmed) from the later attempts.

**Status:** Unresolved. The dimmed overlay behind bottom sheets and dialogs can still interact badly with the iOS status bar and/or the mobile top navigation in standalone (Add to Home Screen) mode.

**Symptoms observed:**

- Dark semi-transparent backdrop appears **behind** the system status bar (time, signal, battery), or
- Backdrop starts **too low** (e.g. below the full 64px mobile nav), so the nav row stays fully bright while content below is dimmed, or
- After attempted fixes, behavior **improves** but alignment still feels wrong on a real device.

**Environment:** iPhone, **installed PWA** (`display-mode: standalone` or `minimal-ui`), `viewport-fit=cover` in `spa/index.html`. In-app thread/space switcher uses **Radix `Sheet`** (`src/components/ui/sheet.tsx` → `SheetOverlay` with class `sheet-overlay`).

**Related files (as of current `main` — verify after merges):**

| Area | Path |
|------|------|
| Sheet overlay CSS | `src/styles/global.css` (`.sheet-overlay`) |
| Modal enter animation / clip | `src/styles/animations.css` (`.modal-overlay-enter`) |
| Modal / drawer overlays | `src/styles/panels.css` (`.modal-overlay`, `.drawer-overlay`, `.drawer-slide`) |
| Mobile nav overlay (if used) | `src/styles/navigation.css` (`.mobile-nav__overlay`) |
| Sheet shell | `src/components/ui/sheet.tsx` |
| Radix overlay | `@radix-ui/react-dialog` merges `style={{ pointerEvents: 'auto', ... }}` on the overlay node |
| Layout / PWA padding | `src/styles/layout.css` (`.app-layout` standalone rules) |
| SPA entry | `spa/index.html` (`viewport-fit`, `apple-mobile-web-app-status-bar-style`) |
| Thread switcher sheet | `src/components/react/navigation/MobileNavigation.tsx` (uses `Sheet` / `SheetContent`) |

---

## Root causes (why this is hard)

1. **`env(safe-area-inset-top)` is unreliable in PWAs**  
   WebKit has had issues where safe-area values resolve to `0` or otherwise don’t match what you see on screen. See [WebKit bug 274773](https://bugs.webkit.org/show_bug.cgi?id=274773) (env safe-area can be wrong / zero).

2. **CSS `!important` on `top` vs Radix inline styles**  
   If `.sheet-overlay` uses `top: … !important`, it can **override** normal inline `style={{ top: '…' }}` from React. Only inline `top` with `!important` (or removing `!important` from the stylesheet) allows JS to win.

3. **Probe measurement mistakes**  
   Measuring `getBoundingClientRect().top` on a `position: fixed` element with `top: env(safe-area-inset-top)` can return **wrong large values** (e.g. ~76px) when WebKit mis-resolves env — looks like “offset to main content” (status bar + nav + gap) rather than the status bar inset only. Values **≥ 64px** are suspicious because the mobile nav slot is **64px** tall; true status-bar insets are typically **~20–59px** on phones.

4. **Multiple `.sheet-overlay` nodes**  
   `document.querySelector('.sheet-overlay')` returns the **first** match. Code that adjusts overlay opacity (e.g. drag-to-dismiss) may not target the visible sheet’s overlay if more than one sheet exists in the DOM.

5. **Z-index / stacking**  
   Less common, but if any chrome paints above the portaled overlay, the dimming won’t appear to cover the nav even when `top` is correct.

---

## Approaches already tried (chronological summary)

### A. CSS-only: `env(safe-area-inset-top)` and `clip-path`

- Set **`top: env(safe-area-inset-top, 0px)`** on `.sheet-overlay`, `.modal-overlay`, `.drawer-overlay`, etc.
- **`.modal-overlay-enter`:** `clip-path: inset(env(safe-area-inset-top, 0px) 0 0 0)` so the darkened backdrop from `modalOverlayFadeIn` doesn’t paint behind the status bar.
- **Result:** Still wrong on device when `env()` resolves to `0` or inconsistent; `clip-path` did not fully fix perceived issues.

### B. `apple-mobile-web-app-status-bar-style`

- Switched meta between **`default`** and **`black-translucent`** to influence how iOS exposes safe area and what draws behind the status bar.
- **Result:** Inconsistent; not a complete fix by itself.

### C. Document class `.ios-pwa`

- `spa/src/App.tsx`: `IosPwaClass` added **`ios-pwa`** on `<html>` when standalone + iOS (intended for overlay/nav tweaks).
- **Result:** Class was added; **dedicated CSS** using `.ios-pwa` for overlay positioning was not fully wired through, so limited effect.

### D. JavaScript `--safe-area-top` CSS variable

- Measured safe area with a **probe** (`top: env(safe-area-inset-top)` + `getBoundingClientRect().top`).
- If `env()` failed (`<= 0`) or **value ≥ 64px** (bogus “content offset”), fell back to **screen-height heuristic** (e.g. 59 / 47 / 20px).
- Set `document.documentElement.style.setProperty('--safe-area-top', …)`.
- **Result:** Better than raw `env()` in some cases; still not reliably matching desired visual (nav vs status bar).

### E. Stronger measurement: `getComputedStyle` padding probe

- Create a hidden element with **`padding-top: env(safe-area-inset-top, 0px)`**, read **`getComputedStyle(el).paddingTop`** (pixels).
- **Rationale:** Same env() as CSS, but read as **computed padding** — often more reliable than `getBoundingClientRect` on `top`.

### F. Early script + `main.tsx` sync

- **`public/scripts/safe-area-top.js`:** run before React to set `--safe-area-top` early.
- **`spa/src/main.tsx`:** `syncSafeAreaTopCssVar()` + `subscribeSafeAreaTopCssVar()` on resize / `visualViewport`.

### G. `SheetOverlay` React `style={{ top: … }}`

- **`src/components/ui/sheet.tsx`:** state `topPx` from `getSafeAreaTopPx()`, merged into overlay `style`.
- **Critical fix:** Removed **`!important` from `top`** on `.sheet-overlay` so inline `top` from React can override `var()` / `env()` in the stylesheet (Radix does not set `top` with `!important`).

### H. Git revert

- A **full revert** of the 1.205.x overlay/safe-area experiment chain was done locally (reset to **`d5174ef7`** — `feat: enhance navigation and thread context handling`), removing commits that added `safe-area.ts`, `safe-area-top.js`, and `SheetOverlay` state, etc.
- **Note:** Older history may still include **`af58ecbb`** (“modal and drawer overlays for safe area insets”). Current tree may still have `.sheet-overlay { top: env(safe-area-inset-top) !important; }` and `.modal-overlay-enter` clip-path — **re-verify** after any merge.

---

## What a “correct” solution might require

1. **Don’t rely on a single global `--safe-area-top` for every overlay** unless you re-measure on orientation change, `visualViewport` resize, and after opening sheets.

2. **Prefer `getComputedStyle` padding probe** (or Apple’s recommended patterns) over `getBoundingClientRect` on `top: env()` for reading the inset.

3. **Never use `!important` on `top` for the sheet overlay** if React/Radix must set `top` inline — or set `top` only via **`setProperty(..., 'important')`** in `useLayoutEffect` if you must beat other rules.

4. **Product decision:** Should the scrim **start below the status bar** (dim nav + content) or **cover the nav but not the status bar**? Misalignment often comes from mixing **status bar inset** with **nav height (64px)** or **layout gap (12px)**. Be explicit which edge is the target.

5. **Optional structural approach:** Avoid full-viewport fixed `top` hacks — e.g. render a **dedicated backdrop** inside `AppLayout` **below** `.mobile-nav-slot` (DOM order) so the dimming layer cannot physically extend into the status bar without JS. That’s a larger refactor (portals, sheet host).

6. **Verify on device:** Simulator and Safari desktop often don’t match standalone PWA. Test **installed** PWA after a hard refresh / cache-clear; **PWA cache** can keep old `index.html` and scripts.

---

## Quick checklist for the next attempt

- [ ] On device, log `getComputedStyle` padding probe vs `env()` in `console` in standalone PWA.
- [ ] Confirm **only one** `.sheet-overlay` when the thread sheet is open, or scope selectors to the active portal.
- [ ] Inspect computed **`top`** on `.sheet-overlay` in Web Inspector (is `0`, `47px`, `59px`, `76px`?).
- [ ] Confirm **no** `!important` on `top` blocking inline `style` if using React-driven `top`.
- [ ] After deploy, **bump SW cache** or verify users get new `index.html` and `/scripts/*`.

---

## References

- WebKit `env(safe-area-inset-*)` issues: [bugs.webkit.org #274773](https://bugs.webkit.org/show_bug.cgi?id=274773)
- iOS Safari / PWA `position: fixed` discussions (e.g. iOS 17+): Apple Developer Forums, Stack Overflow (search “iOS PWA safe area inset fixed overlay”).
- In-repo: `docs/MOBILE_KEYBOARD_NOTE_SHEET.md`, `docs/MAIN_COLUMN_LAYOUT.md` (layout constraints; not the same bug but related mobile layout).
