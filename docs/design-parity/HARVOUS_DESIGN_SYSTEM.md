# Harvous Design System

**Read this before designing or implementing any new UI surface.**

This handbook is the actionable style foundation for Harvous. Policy lives in [`HARVOUS_DESIGN_PARITY_SPEC.md`](./HARVOUS_DESIGN_PARITY_SPEC.md). Concrete tokens and file ownership live in [`HARVOUS_BUILD_CONVENTIONS.md`](./HARVOUS_BUILD_CONVENTIONS.md). Live previews live at `http://localhost:4322/__dev/design-system` (dev only).

> Native is the visual source of truth. Web mirrors tokens and component intent, then adapts interaction to the browser.

---

## 1. Style direction

Harvous should feel **quiet, warm, and content-first** — a study desk, not a dashboard.

| Principle | What it means |
|---|---|
| Content first | Notes, Scripture, and study structure lead. Chrome stays secondary. |
| Warm paper | Soft off-white canvases, restrained borders, gentle elevation. Avoid cold pure-white slabs. |
| Restrained glass | Frosted shell chrome is allowed; menus/popovers stay opaque. Never stack competing blurs. |
| Rounded display, neutral body | Titles use Google Sans Flex with rounded terminals (`ROND` 100). Body/list copy stays non-rounded (`ROND` 0). |
| Blue as action | Primary actions, focus rings, and selection use Harvous accent blue. Space/scripture themes tint context, not every control. |
| Tactile, not decorative | Springs and short fades support orientation. Motion never delays a core action. |
| One system | Reuse tokens and primitives. Do not invent a parallel palette, type scale, or overlay pattern. |

### Do

- Prefer existing `--pds-*` / `Harvous*` tokens and `.pds-*` type roles.
- Keep destructive actions rare, labeled, and confirmed when irreversible.
- Support light, dark, wallpaper, reduced motion, and reduced transparency.
- Match information hierarchy across platforms even when gestures differ.

### Don't

- Introduce inline `fontSize`, raw hex/rgb for UI chrome, or ad-hoc z-index values.
- Grow new design tokens under the legacy `proto-*` CSS prefix.
- Hand-roll popover dismiss, confirm dialogs, or empty states when primitives exist.
- Force identical interaction mechanics when platform norms differ (Tier B/C).

---

## 2. Foundations map

| Layer | Native | Web |
|---|---|---|
| Color / semantic status | `DesignSystem/HarvousColors.swift` | `spa/src/styles/prototype-tokens.css` |
| Typography | `HarvousTypography.swift`, `HarvousFonts.swift` | `.pds-*` classes in `prototype-tokens.css` |
| Spacing / radius / motion | `HarvousShape.swift` | `--pds-space-*`, `--pds-radius-*`, `--pds-duration-*`, `proto-motion.ts` |
| Elevation | `CardShadow` | `--pds-shadow-*` |
| Layering (web) | n/a | `--pds-z-*` |
| Icons | `HarvousFAGlyph` (`Harvous.*` assets) | `@/components/react/Icon` |
| Live gallery | production views | `/__dev/design-system` |

---

## 3. Component inventory

### Core primitives (use these)

| Role | Native | Web | Status |
|---|---|---|---|
| Section header | `HarvousSectionHeader` | `PrototypeSectionHeader` | Canonical |
| List row | `HarvousListRow` | `PrototypeListRow` | Canonical |
| Search field | `HarvousSearchField` | `PrototypeSearchInput` | Canonical |
| Empty state | `HarvousEmptyStateView` | `PrototypeListEmptyState`, `PrototypePaneEmptyState` | Canonical |
| Popover / menu shell | `HarvousPopoverMenu` | `ProtoPopoverShell` + `usePopoverDismiss` | Canonical |
| Destructive confirm | system alert / sheet | `ProtoConfirmDialog` | Canonical |
| Floating toast | platform / TBD | `.proto-update-toast` / `PrototypeFeedbackToast` (prototype); Sonner outside | Canonical for ephemeral feedback |

### Cataloged patterns (reuse existing; no new generic wrapper yet)

| Role | Where today | Notes |
|---|---|---|
| Action button | `.proto-settings-btn*`; segmented `.proto-appearance-segmented`; inspector `.proto-inspector-connect-btn` / delete / side-panel icon; outline/text secondaries | Gallery `ds-10-buttons` |
| Text input | Plain: `.proto-create-folder-sheet__name-input` (= `.proto-settings-field__input`); inspector: `.proto-inspector-input`; search field | Gallery `ds-11-inputs` — settings/church reuse create-sheet chrome |
| Inline contextual chrome | `PrototypeSharedNoteReadOnlyBanner`, inspector muted/error + Retry | Persistent in-context — **not** floating toasts |
| Appearance color / imagery | `BG_PRESETS`, `IMAGE_PRESETS_*`, `AppearancePreviewTile` | Gallery color scene |
| Card | `NoteCardView`, `.proto-home-card`, `.proto-collection-card` | Prefer `HarvousRadius.card` + `CardShadow` / `--pds-shadow-card` |
| Pill / chip | Scripture attachments, folder chips, `.proto-chip` | Domain-specific; coordinate before adding types |
| Toolbar | `NoteToolbar`, `NativeToolbar` | Platform chrome; keep orb metrics aligned |
| Sheet / modal | SwiftUI `.sheet`, Vaul drawer, VOTD sheet | Presentation differs by platform; outcome must match |
| Settings nav | native settings lists / `SETTINGS_CATEGORIES` | Extend the data model, don't fork nav chrome |
| Reading canvas | `HarvousReaderLayout` + `HarvousTypography.readerBody` | `.pds-reader*` — gallery `ds-14-reader`. The one user-scalable type role (`--pds-reader-font-size`) |
| Margin notifier | (native TBD) | `.pds-reader__marker*` — dot = one note, stacked-dot capsule = several |
| Paper stack | platform sheet | `.pds-reader-stack*` — gallery `ds-15-paper-stack`; both sheets stay mounted |

> **Deprecated:** `PrototypeBanner` / `HarvousBanner` are not the product feedback pattern. Do not use in new UI.

### Variant matrix

| Component | Variants | When to use |
|---|---|---|
| Section header | `inspector`, `search`, `list` | Inspector labels; search result groups; denser list sections |
| List row | `sidebarCompact`, `conversation` | Sidebar feeds vs denser conversation/list panes |
| Toast | update pill; feedback success/error (+ action) | Ephemeral feedback — gallery `ds-12-toasts` |
| Empty state | `prominent`, `compact` | Main pane vs sidebar/list columns |
| Search | default clearable field | Sidebar, sheets, pickers — same field everywhere |
| Button | settings filled; segmented; inspector; outline; text/link | See `ds-10-buttons` |

---

## 4. Interaction patterns

| Pattern | Rule |
|---|---|
| Navigation | Spaces → threads/lists → notes. Preserve hierarchy and labels across platforms. |
| Create / edit / save | Optimistic where the user stays on-screen; never invent skeleton loaders. |
| Empty / loading / error | Empty states for voids; floating toasts for ephemeral feedback; sticky inspector failures use muted copy + Retry. Prefer real loading states over placeholders. |
| Destructive | Confirm with `ProtoConfirmDialog` (web) or system confirm (native). Use destructive tokens only. |
| Overlays | Web: `usePopoverDismiss` / `useDismissOnOutside` + Escape + outside click. Native: platform menu/sheet norms. |
| Keyboard | Focus-visible rings, list keyboard focus (`data-keyboard-focus`), labeled icon buttons. |
| Motion | Import `PROTO_*_MS` constants; honor `prefers-reduced-motion`. |

---

## 5. Accessibility baseline

- Every icon-only control needs an accessible name.
- Menus use `role="menu"` / `menuitem*` (or native equivalents) with checked/expanded state.
- Status banners and empty states expose `role="status"` or `role="alert"` as appropriate. Floating toasts do the same.
- Focus rings use accent tokens; never remove focus outlines without a visible replacement.
- Support `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Do not put `user-select: none` on editable note content or scripture pill text.

---

## 6. Reuse-before-inventing decision tree

```
Need a new UI element?
├─ Does an existing token/role cover it? → Use it.
├─ Does a core primitive cover it? → Use/extend the variant.
├─ Is it a cataloged pattern (Card/Pill/Toolbar/Sheet)? → Copy the nearest existing surface; don't invent a third style.
├─ Truly new role?
│  ├─ Add native token/component first
│  ├─ Mirror to web `--pds-*` / Prototype*
│  ├─ Document in BUILD_CONVENTIONS + this handbook
│  └─ Add a gallery scene under /__dev/design-system
└─ Cross-platform feature? → Fill HARVOUS_DESIGN_PARITY_SPEC §6 template.
```

---

## 7. Contribution checklist

Before merging UI work:

- [ ] Read this handbook + [`HARVOUS_BUILD_CONVENTIONS.md`](./HARVOUS_BUILD_CONVENTIONS.md)
- [ ] Classified parity tier (A / B / C)
- [ ] Reused existing tokens and primitives (or extended both platforms)
- [ ] No new inline font sizes / raw chrome colors / ad-hoc z-index
- [ ] Light + dark (and wallpaper if chrome/surfaces changed)
- [ ] Reduced motion / transparency considered
- [ ] Keyboard + accessible names verified
- [ ] New visual pattern has a `/__dev/design-system` scene
- [ ] `npm run design:check` passes
- [ ] Cross-domain flags sent if editor / sharing / content surfaces changed

---

## 8. Design agent

Use `/design-agent` for tokens, prototype CSS, native DesignSystem work, gallery scenes, visual QA, and cohesion reviews. It owns keeping Harvous visually consistent; it does not own TipTap marks (`/editor-agent`), share tokens (`/sharing-agent`), or study-card content (`/content-agent`).

---

*Companion docs: [`ARCHITECTURE_READINESS_AUDIT.md`](./ARCHITECTURE_READINESS_AUDIT.md), [`PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md`](./PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md).*
