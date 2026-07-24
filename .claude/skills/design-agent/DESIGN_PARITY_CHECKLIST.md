# Design Parity Checklist

Use on every design-agent task. Mark items that apply.

## Before coding

- [ ] Read `HARVOUS_DESIGN_SYSTEM.md` style direction
- [ ] Classified Tier A / B / C (`HARVOUS_DESIGN_PARITY_SPEC.md`)
- [ ] Searched for an existing token, `.pds-*` role, or core primitive
- [ ] Identified native + web touch points (or documented Tier C / web-deferred)

## Tokens & foundations

- [ ] New colors define light + dark (and wallpaper if chrome)
- [ ] Spacing / radius / shadow / duration use shared scales
- [ ] Web z-index uses `--pds-z-*`
- [ ] Motion constants stay in lockstep with CSS (`proto-motion.ts`)

## Components & patterns

- [ ] Used core primitive or cataloged pattern (not a one-off chrome fork)
- [ ] Popovers use `usePopoverDismiss` / `useDismissOnOutside` + `ProtoPopoverShell`
- [ ] Destructive confirms use `ProtoConfirmDialog` (web) or system confirm (native)
- [ ] Empty / error / status: empty-state for voids; floating toasts for ephemeral feedback; sticky inspector failures use muted copy + Retry (not `PrototypeBanner`)
- [ ] Actions use `.proto-settings-btn` / inspector / outline / text patterns; inputs reuse settings / sheet / inspector field chrome
- [ ] State via `data-*` attributes, not ad-hoc state classes

## Accessibility & platforms

- [ ] Icon-only controls have accessible names
- [ ] Focus-visible rings preserved
- [ ] `role="status"` / `alert` on banners and empty/error where appropriate
- [ ] Reduced motion / reduced transparency considered
- [ ] Keyboard path verified for interactive chrome

## Gallery & checks

- [ ] New visual pattern has `/__dev/design-system` scene (+ `editFiles`)
- [ ] `npm run design:check` passes
- [ ] Targeted Vitest / gallery Playwright run when primitives or baselines change

## Handoff

- [ ] Cross-domain flags noted (editor / sharing / content / data / scripture)
- [ ] Contribution checklist in `HARVOUS_DESIGN_SYSTEM.md` §7 satisfied
