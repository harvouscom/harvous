# Prototype design-system primitives

Canonical web counterparts to `native/Harvous/DesignSystem/*`.

| Primitive | File | Native |
|---|---|---|
| Section header | `PrototypeSectionHeader.tsx` | `HarvousSectionHeader` |
| List row | `PrototypeListRow.tsx` | `HarvousListRow` |
| Search | `../components/PrototypeSearchInput.tsx` | `HarvousSearchField` |
| Empty states | `../PrototypeListEmptyState.tsx`, `../PrototypePaneEmptyState.tsx` | `HarvousEmptyStateView` |
| Floating toast | `../../components/PrototypeFeedbackToast.tsx` | — |

Ephemeral feedback → toasts. Persistent inline chrome → `PrototypeSharedNoteReadOnlyBanner`, inspector error rows, confirms. `PrototypeBanner` is deprecated.

Docs: `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md`  
Gallery: `http://localhost:4322/__dev/design-system`
