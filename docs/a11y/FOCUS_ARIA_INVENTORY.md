# Focus and ARIA inventory (living)

Harvous uses shared tokens on `:root` (see [`src/styles/colors.css`](../../src/styles/colors.css)):

- `--focus-ring-color` (maps to `--color-bold-blue`)
- `--focus-ring-width` (2px)
- `--focus-ring-offset` (2px)

## Implemented (this pass)

| Area | File(s) | Change |
|------|-----------|--------|
| Tokens | `colors.css` | `--focus-ring-*` |
| Nav + tabs | `navigation.css` | `.nav-link`, profile/search back, space switcher summary + dropdown items + close, tab buttons `:focus-visible` |
| Cards / carousel | `cards.css` | Action strip uses tokens |
| Main strip | `action-strip.css` | `.action-strip__item:focus-visible` |
| Spotlight | `spotlight.css` | `[cmdk-item]:focus-visible` ring (keyboard) |
| Search field | `forms.css` | `.search-input__field:focus-visible` |
| Admin textarea | `panels.css` | `.edit-space-panel__admin-description:focus-visible` |
| Nav TSX | `NavigationColumn.tsx`, `PersistentNavigation.tsx` | `aria-controls`, `aria-modal`, `aria-current`, `aria-expanded`, region for “Add Existing Space” |
| Portal dropdown | `SpaceSwitcherDropdown.tsx` | `aria-modal="false"`, `aria-current` |

## High-priority follow-ups (grep / triage)

1. **`outline: none` in [`src/styles/global.css`](../../src/styles/global.css)** — `input` / `textarea` / `select` (intentional for custom chrome). Ensure each control has an alternate `:focus-visible` cue (border/box-shadow) per component.
2. **[`src/styles/utilities.css`](../../src/styles/utilities.css)** — `.focus\:outline-none` / `.focus-visible\:outline-none` utilities: use only where paired with another visible focus pattern.
3. **Icon-only buttons** — Ripgrep `type="button"` / `<button` without adjacent text in `src/components/react/` and `spa/src/`; add `aria-label` where missing.
4. **Clerk / third-party** — Limited control; document exceptions rather than overriding Shadow DOM.
5. **Panel list rows** — `panel__list-item` and similar: add `:focus-visible` if interactive nodes strip default outline.

## Verification checklist (manual)

- Desktop: Tab through nav, space menu, profile, search, thread list, tab row, action strip, spotlight results.
- Mobile: Bottom sheet opens; title/description (`BottomSheet` sr-only) still present.
- Screen reader: Space switcher `aria-controls` / `aria-expanded` on “Add Existing Space”; `aria-current="page"` on active nav targets.

Optional later: axe-core on CI for `/`, `/thread/*`, `/note/*`.
