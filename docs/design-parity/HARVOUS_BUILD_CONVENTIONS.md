# Harvous Build Conventions (Web Prototype + Native)

**Read this before you create a new component, token, color, or interaction pattern.**

[`HARVOUS_DESIGN_SYSTEM.md`](./HARVOUS_DESIGN_SYSTEM.md) is the *style handbook* (direction, inventory, contribution checklist). [`HARVOUS_DESIGN_PARITY_SPEC.md`](./HARVOUS_DESIGN_PARITY_SPEC.md) is the *policy* (native-first, web-secondary, feature tiers). This doc is the *concrete reference*: the actual tokens, the files that own them, the component seams, and the naming rules. The goal is that future work — human or agent — **extends what exists** instead of inventing a parallel system.

> Rule of thumb: **reuse first.** If nothing fits, add the new thing in the place this doc names, and add it to *both* platforms so web and native stay aligned.

---

## 0. Where things live

| Concern | Web (`/prototype`) | Native (`native/Harvous/`) |
|---|---|---|
| Color / surface tokens | `spa/src/styles/prototype-tokens.css` | `DesignSystem/HarvousColors.swift` |
| Type scale | `prototype-tokens.css` (`.pds-*` classes) | `DesignSystem/HarvousTypography.swift` (+ `HarvousFonts.swift`) |
| Radius / shape / motion | `prototype-tokens.css` (`--pds-radius-*`) + `proto-motion.ts` | `DesignSystem/HarvousShape.swift` |
| Shadow / elevation | `prototype-tokens.css` (`--pds-shadow-*`) | `HarvousShape.swift` (`CardShadow`) |
| Layout / shell CSS | `prototype-shell.css` | SwiftUI views in `Views/` |
| Component CSS | `prototype-components.css` | `DesignSystem/*` reusable views |
| Editor CSS | `prototype-editor.css` | `Editor/*` |

The web token file header says it directly: *"Prototype Design System — tokens derived directly from native Swift values. HarvousColors → `--pds-color-*`, HarvousShape → `--pds-radius-*`, HarvousTypography/HarvousFonts → `--pds-font-*`."* **Native is the source of truth; web mirrors it.**

---

## 1. Typeface

Both platforms use **Google Sans Flex** (variable font). Axes:

- `wght` — weight, 1–1000 (most UI sits 400–620).
- `ROND` — rounded-terminal axis. **`0` = body/text faces; `100` = display/title faces.** This is the single most distinctive Harvous type choice — titles and headers use the rounded terminals; body copy does not.
- `opsz` — optical size, tracks the point size.

| | Web | Native |
|---|---|---|
| Body face | `--pds-font-body` + `--pds-font-body-variation: "ROND" 0` | `HarvousFonts.font(…, design: .default)` |
| Display face | `--pds-font-display` + `--pds-font-display-variation: "ROND" 100` | `HarvousFonts.font(…, design: .rounded)` |

Web also remaps app-wide `--font-sans`/`--font-mono` to the `--pds-*` stacks under `/prototype` so embedded React surfaces never fall back to the Classic font (Reddit Sans).

---

## 2. Type scale (kept in lockstep)

Native `HarvousTypography` → web `.pds-*` class. Sizes/weights match by intent (web uses the macOS sidebar scale where native is platform-conditional).

| Role | Native (`HarvousTypography`) | Web class | Size / weight / face |
|---|---|---|---|
| Page header / empty state | `largeTitle` | `.pds-title-xl` | 34pt · 620 · rounded |
| Section header | `title` | `.pds-title` | 20pt · 580 · rounded |
| Compose title field | `composeTitleFieldFont()` | `.pds-compose-title` | 22pt · 600 · rounded |
| Card title | `noteCardTitle` | `.pds-note-card-title` | 16pt · 600 · body |
| Body | `body` | `.pds-body` | 16pt · 400 · body |
| List row title | `noteListTitle` | `.pds-list-title` | 15pt mac / 17pt iOS · 500 |
| List preview | `noteListPreview` | `.pds-list-preview` | 12pt mac / 14pt iOS · 400 |
| List timestamp | `noteListTimestamp` | `.pds-list-timestamp` | 12pt mac / 14pt iOS · 500 |
| List trailing timestamp | `noteListTrailingTimestamp` | (native only) | 11pt · 500 |
| Caption / metadata | `caption` | `.pds-caption` | 13pt · 500 |
| Footnote | `footnote` | `.pds-footnote` | 11pt · 400 |
| Inspector body / compact | `inspectorBody` / `inspectorCompact(Medium)` | (inline) | 12pt · 400 / 11pt · 400–500 |
| Inspector section label | `inspectorSectionLabel` | (used via section header) | 10pt · 600, uppercased, tracked |

**Don't introduce a new font size inline.** Pick the closest role above; if a genuinely new role is needed, add it to `HarvousTypography` *and* a `.pds-*` class.

---

## 3. Color & surfaces

### Brand accent
`Color(red: 0.22, green: 0.41, blue: 0.90)` — `Color.harvousAccent` (native, a `Color` extension — **not** `HarvousColors.harvousAccent`) / `--pds-accent` (web). Set as `.tint` app-wide on native.

### Space scripture themes
7 variants in `HarvousColors.ThemeVariant`: `blue` (default), `purple`, `teal`, `green`, `orange`, `rose`, `indigo`. Each derives from a base sRGB triple with fixed opacity layers — accent `1.0`, active bg `0.12`, toolbar/pressed bg `0.18`, chip bg `0.075`, chip gradient `0.10`→`0.065`, border `0.2`. A space's theme is stored on `Space.scriptureThemeRaw` and injected via `@Environment(\.harvousScriptureTheme)`. Web default scripture chip mirrors the blue theme (`--pds-scripture-*`).

To add a theme: extend `ThemeVariant` + `themeBaseRGB(_:)` (native), and add the matching `--pds-lch-thread-*` / scripture vars (web).

### Thread / highlight palette
OKLCH pastels: `threadBlue/Yellow/Green/Pink/Orange/Purple` (native `Color` extension) ↔ `--pds-thread-*` (web). Each pastel has a saturated `threadGlyph(_:)` foreground for legible icons on the fill.

### Surfaces & glass
Web layers (all OKLCH, see `prototype-tokens.css`): `--pds-bg-page`, `--pds-bg-toolbar`/`--pds-bg-sidebar` (frosted, 0.78α), `--pds-bg-popover` (0.98α), `--pds-bg-popover-solid` (opaque menus), `--pds-bg-glass-*` (0.45–0.9α), `--pds-glass-shell` (color-mix tint from canvas). Translucent chrome uses **tiered `backdrop-filter`** via `--pds-glass-blur` (shell frame / panels), `--pds-glass-blur-elevated` (floating cards), and `--pds-glass-blur-control` (toolbar orbs). Shared recipe: `.proto-glass-surface` in `prototype-components.css`. Popovers/menus stay `--pds-bg-popover-solid`. `prefers-reduced-transparency` sets blur tokens to `none`.

### Destructive / warning / success / info
- **Web:** `--pds-destructive`, `--pds-warning`, `--pds-success`, `--pds-info` (+ matching `-bg` / `-border` roles).
- **Native:** `Color.harvousDestructive`, `Color.harvousWarning`, `Color.harvousSuccess`, `Color.harvousInfo` — system-dynamic so they stay light/dark + a11y aware. **Use these instead of raw `.red`/`.orange`/`.green`/`.blue`** at semantic status sites. (Several older views still use raw `.red`; migrate opportunistically — don't blind-sweep, since some `.orange` usages are intentional accents.)

### Spacing / icons / layers / motion (web + native)
- **Spacing:** `HarvousSpacing.space1…12` ↔ `--pds-space-1…12` (4pt base). Prefer these over ad-hoc paddings in new UI.
- **Icons:** `HarvousIconSize` ↔ `--pds-icon-xs|sm|md|lg|xl`.
- **Layers (web):** `--pds-z-sticky` (80), `--pds-z-dropdown` (100), `--pds-z-popover` (6000), `--pds-z-modal` (9800), `--pds-z-toast` (10000). Do not invent new z-index literals.
- **Motion (web):** `--pds-duration-press|popover|sheet|panel` must stay in lockstep with `spa/src/layouts/proto-motion.ts`.

### Light / dark / wallpaper
Web supports light, dark (`[data-color-scheme="dark"]` + `prefers-color-scheme`), and image-wallpaper (`html.harvous-proto-wallpaper-image`) modes — every token has overrides. Native uses `HarvousAppearanceStore` (canvas presets: Sky, Lilac, Peach, Mint, Pink, Cream + light/dark defaults). Any new color must define its dark value too.

---

## 4. Radius, shadow, motion

### Radius — `HarvousShape.HarvousRadius` ↔ `--pds-radius-*`

| Token | Value | Use |
|---|---|---|
| `card` | 20 | note cards, inspector sections, banners |
| `button` | 12 | toolbar buttons; `--pds-radius-menu` also 12 |
| `input` / `row` | 10 | text fields, list-row selection |
| `format` | 8 | format-toolbar button press |
| `menu-item` | 6 | popover menu rows (web) |
| `scripturePill` | 14 mac / 11 iOS · web `--pds-radius-scripture` 7 | scripture pills |
| `pill` | 999 | full pills/accents |

### Shadow
Web composes multi-layer shadows: `--pds-shadow-card` (`0 2px 8px @6% , 0 1px 2px @3%`), `--pds-shadow-popover` (deep bloom + `0 0 0 0.5px` hairline ring), `--pds-shadow-drawer`, `--pds-shadow-fab`, etc. Native: `CardShadow` (6pt/2pt depth + 3pt/1pt softness) in `HarvousShape.swift`.

### Motion
Native `HarvousAnimation`: `spring` (response 0.32 / damping 0.72), `snappy` (0.42 / 0.60), `press` (0.22 / 0.55). Web shell panel exit timing is centralized in **`spa/src/layouts/proto-motion.ts`** (`PROTO_PANEL_EXIT_MS`, currently 260) — **this constant must match the exit animations in `prototype-shell.css` and `--pds-duration-panel`.** Do not hard-code panel-close timeouts; import the constant.

---

## 5. Component patterns to reuse

Full inventory and variant matrix: [`HARVOUS_DESIGN_SYSTEM.md`](./HARVOUS_DESIGN_SYSTEM.md) §3.

### Core primitives (prefer these)

| Role | Native | Web |
|---|---|---|
| Section header | `HarvousSectionHeader` | `PrototypeSectionHeader` (`.pds-section-header`) |
| List row | `HarvousListRow` | `PrototypeListRow` (`.proto-note-row` chrome) |
| Search field | `HarvousSearchField` | `PrototypeSearchInput` |
| Empty state | `HarvousEmptyStateView` | `PrototypeListEmptyState` / `PrototypePaneEmptyState` |
| Floating toast | — | `.proto-update-toast` / `PrototypeFeedbackToast` (prototype); Sonner outside |
| Popover shell | `HarvousPopoverMenu` | `ProtoPopoverShell` + `usePopoverDismiss` |
| Confirm | system alert/sheet | `ProtoConfirmDialog` |

### Web (`spa/src/pages/prototype/`)
- **Popovers/menus:** wrap content in the visual-only `ProtoPopoverShell`, and drive open/close with the **`usePopoverDismiss`** hook (`spa/src/hooks/usePopoverDismiss.ts`) — it owns the `open` state, `rootRef`, outside-click, and Escape. (See `ListViewMenu`, `PrototypeNoteMoreMenu`, `AccountMenu`.) Do **not** re-hand-roll the `mousedown`/`keydown` effect.
- **Destructive confirm:** `ProtoConfirmDialog` — anchored floater (scripture-pill delete parity); callers must pass `anchorRect` from the delete trigger’s `getBoundingClientRect()`.
- **Editor bottom chrome:** portal into the shell-provided hosts (`formatToolbarHostEl`, `studyDockCarouselHostEl`, `referenceChromeHostEl`) from `proto-shell-context`; add a new mode to `PrototypeEditorChromeMode` rather than a new bar.
- **Settings categories:** add to the `SETTINGS_CATEGORIES` array — the nav renders from it. This is the model extension pattern to imitate for list-driven UI.
- **Lists:** use `PrototypeListRow` (or the `proto-note-row` / list-row classes) with `pds-list-title` / `pds-list-preview` type.
- **Section labels:** use `PrototypeSectionHeader` / `.pds-section-header` (aliases keep `.pds-inspector-label` and `.proto-inspector-section-title` working).
- **Ephemeral feedback:** floating toasts (`showPrototypeFeedbackToast` / `.proto-update-toast`). Sticky in-context chrome: `PrototypeSharedNoteReadOnlyBanner`, inspector muted/error + Retry — **not** `PrototypeBanner` (deprecated).

### Native (`native/Harvous/DesignSystem/`)
- **Menus:** `HarvousPopoverMenu`.
- **Empty states:** `HarvousEmptyStateView`.
- **Section headers / list rows / search:** `HarvousSectionHeader`, `HarvousListRow`, `HarvousSearchField`.
- **Sticky inspector failures:** quiet inline copy + Retry (see `NoteInspectorView`) — not `HarvousBanner` (deprecated).
- **Icons:** `HarvousFAGlyph(assetName: "Harvous.*", edgePt:)` — renders catalog vectors as tinted template images (inherits `.foregroundStyle`). Asset names are `Harvous.<Pascal>` in `Assets.xcassets`. Prefer these over ad-hoc SF Symbols for parity with FA-styled chrome.
- **Keycaps / shortcuts:** `HarvousShortcutKeycap`.
- **Study dock geometry:** `StudyDockLayoutMetrics` / `StudyDockShellBorderOverlay`.
- **Cards:** `CardShadow` modifier + `HarvousRadius.card`.

---

## 6. Naming conventions

- **Web components:** `Prototype{Domain}{Component}` (e.g. `PrototypeInspectorPane`). Toolbar/sidebar menus are `{Thing}Menu`.
- **Web CSS:** `pds-*` for new design-system classes; `proto-*` is the legacy/structural prefix — keep it working, don't grow new design tokens under it. Use `data-*` attributes for state (`data-active`, `data-mode`) rather than state classes.
- **Web hooks:** `use{Thing}` in `spa/src/hooks/` (`usePrototype*` for prototype-specific queries).
- **Native:** `Harvous*` prefix for design-system types and shared services; asset glyphs `Harvous.<Pascal>`.
- **Release notes:** plain text only — **no emoji** in titles, headers, or body (`release-notes/README.md`).

---

## 7. "I need to add something new" checklist

| You're adding… | Do this |
|---|---|
| A color / surface | Add `--pds-*` (with dark + wallpaper overrides) **and** the matching `HarvousColors` member. |
| A spacing / z-index / duration | Add `--pds-space-*` / `--pds-z-*` / `--pds-duration-*` **and** the matching `HarvousSpacing` / motion constant when native needs it. |
| A radius / shadow / spring | Add to `HarvousShape` **and** `--pds-radius-*` / `--pds-shadow-*`. |
| A font size | Use an existing role in §2 first; if truly new, add to `HarvousTypography` + a `.pds-*` class. |
| A popover/menu (web) | `usePopoverDismiss` + `ProtoPopoverShell`. |
| A list row / section / search | Use the core primitives in §5; add a gallery scene. |
| Ephemeral feedback | Floating toast (prototype: `showPrototypeFeedbackToast`; else Sonner). Sticky context: dedicated inline chrome — not `PrototypeBanner`. |
| A sidebar list mode (web) | Extend `SidebarListMode`, `VALID_MODES`, the `ListViewMenu` order tuple, and add a renderer (see audit — this seam is currently a large single file). |
| An editor bottom-chrome mode (web) | Extend `PrototypeEditorChromeMode` + portal host. |
| A settings page (web) | Add to `SETTINGS_CATEGORIES` + a route + page component. |
| A note attachment / pill type (native) | See the audit — pill handling is currently hardcoded; coordinate before adding. |
| A panel close animation (web) | Reuse `PROTO_PANEL_EXIT_MS`; match the CSS duration. |
| A new visual pattern | Add a scene under `/__dev/design-system` and run `npm run design:check`. |

When a change spans both platforms, fill out the feature template in [`HARVOUS_DESIGN_PARITY_SPEC.md`](./HARVOUS_DESIGN_PARITY_SPEC.md) §6.

Full contribution checklist: [`HARVOUS_DESIGN_SYSTEM.md`](./HARVOUS_DESIGN_SYSTEM.md) §7.

---

*Companion: [`ARCHITECTURE_READINESS_AUDIT.md`](./ARCHITECTURE_READINESS_AUDIT.md) — known seams/debt and where the roadmap will press on them.*
