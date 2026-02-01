# App Layout Appearance Customization - Design Document

## Overview

This document describes a future feature for customizing the app layout appearance: **customizable background** and an **appearance mode** (default paper vs glass) where paper surfaces can be fully see-through with tinted colors.

**Date:** February 2025  
**Status:** Design Phase - Ready for implementation when prioritized

---

## User Request (Summary)

- **Custom background**: Allow users to change the “desk” background behind the app.
- **Appearance mode**:
  - **Default paper**: Current behavior — solid paper tones.
  - **Glass**: Paper surfaces fully see-through (transparent), with colors applied as tints so the custom background shows through.

---

## Current State

### Where the Background Is Set

- **Root**: `html` and `body` use `var(--color-light-paper)` in:
  - `src/layouts/Layout.astro` (lines ~791–819) — base + iOS Safari overrides
  - `src/styles/global.css` (lines ~315–385) — view transitions and root
- **Layout container**: `.app-layout` in `src/layouts/Layout.astro` gets safe-area padding; background is inherited from body.
- **Other surfaces**: Navigation, cards, panels, mobile nav slot, view-transition containers all reference `--color-light-paper`, `--color-paper`, `--color-soft-paper`, etc. (see `src/styles/colors.css`, `layout.css`, `navigation.css`, `cards.css`, `panels.css`, `global.css`).

### Color System

- **Paper/background tones**: Defined in `src/styles/colors.css` via OKLCH:
  - `--lch-light-paper`, `--lch-paper`, `--lch-soft-paper`, `--lch-aged-paper`
  - Semantic: `--color-light-paper`, `--color-paper`, etc.
- **Thread/accent colors**: Same file — `--lch-thread-*` and `--color-blue`, `--color-yellow`, etc. Used for thread/space UI; can be reused as tints in glass mode.

### User Preferences Today

- `db/config.ts`: `UserMetadata` has `userColor` (profile/avatar only). No theme or appearance preference exists yet.

---

## Proposed Design

### 1. Customizable Background

**Behavior**

- User can choose a “desk” background: presets (e.g. default, warm, cool) and optionally a custom color (e.g. hex).
- That value drives the root background so the whole app sits on the chosen color.

**Storage**

- Add to user preferences (e.g. `UserMetadata` or a small settings table):
  - `backgroundPreset`: e.g. `'default' | 'warm' | 'cool'`
  - Optional: `backgroundCustom` (e.g. hex string) when user picks a custom color.

**CSS**

- Introduce a single variable for the root background, e.g. `--app-background`.
- Replace all `background-color: var(--color-light-paper)` on `html`/`body` (and view-transition rules that mirror the root) with `background-color: var(--app-background)`.
- Presets map to existing or new OKLCH values; custom maps to the user’s hex (or stored CSS value).

**UI**

- Settings (e.g. profile/settings): control for “Background” with presets + optional color picker. On save, persist preference and set `--app-background` (and optionally other variables) on the root.

### 2. Appearance Mode: Default Paper vs Glass

**Behavior**

- **Default paper**: Current behavior — solid paper surfaces, no transparency.
- **Glass**: Surfaces (nav, cards, panels, main content areas) become see-through with tinted colors so the custom background shows through.

**Storage**

- Add to user preferences:
  - `appearanceMode`: `'paper' | 'glass'`.

**Semantics**

- **Paper mode**: Keep current variables; surfaces stay solid.
- **Glass mode**:
  - **Transparent paper**: Use transparent/translucent variants of paper, e.g. `oklch(var(--lch-light-paper) / 0.4)` (or similar alpha) for nav, cards, panels.
  - **Tinted colors**: Reuse existing `--lch-*` thread/accent values with alpha, e.g. `oklch(var(--lch-thread-blue) / 0.25)` so colors tint the glass.
  - **Backdrop**: Add `backdrop-filter: blur(...)` (and optional `background-color` with low alpha) so content behind the glass is softly blurred and tinted.

**Implementation approach**

- Use a root-level switch: class or data attribute on `html` or `body`, e.g. `data-appearance="glass"` or `data-appearance="paper"`.
- In CSS:
  - When `[data-appearance="glass"]`: override `--surface-primary`, `--color-paper`, `--color-light-paper`, etc., with transparent/tinted variants and apply `backdrop-filter` (and blur) where needed.
  - When `[data-appearance="paper"]` (or unset): keep current solid variables.
- Ensure every place that uses “app background” or “surface” either uses these switchable variables or is covered by the same overrides (e.g. view-transition, layout, nav, cards, panels).

---

## Implementation Outline

### Phase 1: Background customization

1. **Schema / API**
   - Add `backgroundPreset` (and optionally `backgroundCustom`) to user preferences (e.g. `UserMetadata` or settings table).
   - Add or extend API to read/write these fields (and include in profile/settings payloads).

2. **CSS**
   - In `colors.css` or a small theme file: define `--app-background` (default: `var(--color-light-paper)`).
   - In `Layout.astro` and `global.css`: replace `var(--color-light-paper)` on `html`, `body`, and view-transition rules with `var(--app-background)`.
   - Define preset values (e.g. warm, cool) as named variables or a small map in CSS/JS.

3. **Apply on load**
   - After auth, read user’s background preference and set `document.documentElement.style.setProperty('--app-background', ...)` (and optionally preset-specific variables). Do this early (e.g. in layout or a small inline script) to avoid flash of default.

4. **Settings UI**
   - Add “Background” control (presets + optional custom color picker). On save, persist and re-apply `--app-background`.

5. **PWA / iOS**
   - Use the same `--app-background` in Layout.astro’s `-webkit-background-color` and safe-area blocks so custom background works on mobile and standalone.

### Phase 2: Glass mode

1. **Schema / API**
   - Add `appearanceMode: 'paper' | 'glass'` to user preferences.
   - Expose in same profile/settings read/write and payloads.

2. **CSS**
   - Add rules for `[data-appearance="glass"]` that:
     - Override paper/surface variables with transparent/tinted variants (reusing `--lch-*` with alpha).
     - Add `backdrop-filter` and optional blur/background on layout columns, nav, cards, panels.
   - Ensure view-transition and layout backgrounds use the same variables so they don’t flash wrong in glass mode.

3. **Apply on load**
   - Set `document.documentElement.setAttribute('data-appearance', userPreference)` early so first paint matches user choice.

4. **Settings UI**
   - Add “Appearance” or “Style” control: “Paper” vs “Glass”. On save, persist and set `data-appearance`.

5. **Audit**
   - Grep for `--color-light-paper`, `--color-paper`, `--color-soft-paper`, and any hardcoded paper backgrounds; ensure they either use the new variables or are overridden under `[data-appearance="glass"]`.

---

## Key Files to Touch

| Area              | Files |
|-------------------|--------|
| Layout / root     | `src/layouts/Layout.astro`, `src/styles/global.css`, `src/styles/layout.css` |
| Colors / theme    | `src/styles/colors.css` (+ optional theme or appearance CSS file) |
| View transitions  | `src/styles/global.css` (::view-transition* rules) |
| Nav / panels      | `src/styles/navigation.css`, `src/styles/panels.css`, `src/styles/cards.css` |
| Empty layout      | `src/layouts/EmptyLayout.astro` (if it should respect same background) |
| Schema / API      | `db/config.ts`, profile/settings API and types |
| Settings UI       | Profile/settings page or component (e.g. new “Appearance” or “Background” section) |
| Apply on load     | Layout.astro (inline script or island that runs after auth), or shared client entry |

---

## Technical Notes

- **OKLCH**: Existing `--lch-*` variables make tinted glass easy: same hue/chroma, add alpha, e.g. `oklch(var(--lch-light-paper) / 0.4)`.
- **Backdrop blur**: There is existing use of `backdrop-filter: blur(50px)` in `src/components/Welcome.astro`; reuse similar pattern for glass surfaces.
- **View transitions**: All `::view-transition*` rules that currently use `var(--color-light-paper)` should use `var(--app-background)` (or the same variable that reflects the current mode) so transitions don’t flash the wrong background when using custom background or glass.
- **Fallback**: If preference isn’t loaded yet, keep current defaults (`--color-light-paper`, paper mode) so the app always has a valid appearance.

---

## Summary

- **Custom background**: One stored preference, one root variable (`--app-background`), swap it in everywhere the “desk” color is set (html, body, view-transition), plus a settings UI to choose/customize it.
- **Glass mode**: A second preference (`paper` vs `glass`), a `data-appearance` (or class) on the root, and CSS that in “glass” mode redefines paper/surface variables to transparent/tinted values and adds `backdrop-filter` so the custom background shows through with tinted glass; “default paper” remains current solid behavior.

This design is ready to implement when the feature is prioritized; no blocking dependencies on other future docs.
