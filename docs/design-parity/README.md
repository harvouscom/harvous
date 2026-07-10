# Design Parity Docs

This folder defines how Harvous keeps the web app visually familiar with the native Apple experience while allowing platform-appropriate behavior differences.

## Documents

- `HARVOUS_DESIGN_SYSTEM.md` - **Start here.** Style direction, component inventory, interaction rules, accessibility baseline, and contribution checklist.
- `HARVOUS_DESIGN_PARITY_SPEC.md` - Primary policy and feature template for native-first, web-secondary parity decisions.
- `HARVOUS_BUILD_CONVENTIONS.md` - Concrete "read before you build" reference: the actual web + native design tokens, component seams, and naming rules. Extend what exists instead of inventing a parallel system.
- `ARCHITECTURE_READINESS_AUDIT.md` - Prioritized seams/debt across the web prototype and native apps, mapped to the roadmap (with the quick wins already fixed).
- `PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md` - Menu and surface parity checklist between the prototype shell and native.

## Live gallery

While `npm run dev` is running, open:

- `http://localhost:4322/__dev/design-system` — foundations + core primitives
- `http://localhost:4322/__dev/shared-spaces-design` — Shared Spaces fixture scenes (compat route)

## Agent

`/design-agent` owns cohesion for tokens, DesignSystem views, prototype CSS, and gallery scenes.
