# Prototype design-system primitives

Canonical web counterparts to `native/Harvous/DesignSystem/*`.

| Primitive | File | Native |
|---|---|---|
| Section header | `PrototypeSectionHeader.tsx` | `HarvousSectionHeader` |
| List row | `PrototypeListRow.tsx` | `HarvousListRow` |
| Search | `../components/PrototypeSearchInput.tsx` | `HarvousSearchField` |
| Empty states | `../PrototypeListEmptyState.tsx`, `../PrototypePaneEmptyState.tsx` | `HarvousEmptyStateView` |
| Floating toast | `../../components/PrototypeFeedbackToast.tsx` | — |
| Sheet vs popover | `useSheetPresentation.ts` | — (native is always a sheet) |

`useSheetPresentation()` is the only place that decides whether an adaptive overlay renders as
a bottom sheet or an anchored popover. Fifteen sheets each used to inline
`isMobileSidebar && matchMedia('(pointer: coarse)').matches`, read once at render and never
subscribed — so the answer was frozen at first render, and the rule could not be changed in
one edit. Ask the hook; do not re-derive it.

Ephemeral feedback → toasts. Persistent inline chrome → `PrototypeSharedNoteReadOnlyBanner`, inspector error rows, confirms. `PrototypeBanner` is deprecated.

Docs: `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md`
Gallery: `http://localhost:4322/__dev/design-system`
