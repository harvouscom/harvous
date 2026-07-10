/**
 * Prototype design-system primitives — prefer these over one-off chrome.
 * See docs/design-parity/HARVOUS_DESIGN_SYSTEM.md.
 *
 * Ephemeral feedback: floating toasts (`showPrototypeFeedbackToast`), not banners.
 * Persistent inline chrome: `PrototypeSharedNoteReadOnlyBanner`, empty states, confirms.
 */
export { default as PrototypeSectionHeader } from './PrototypeSectionHeader';
export type { PrototypeSectionHeaderVariant } from './PrototypeSectionHeader';

export { default as PrototypeListRow } from './PrototypeListRow';
export type { PrototypeListRowVariant } from './PrototypeListRow';

/** @deprecated Prefer toasts or dedicated inline chrome — not exported as canonical. */
export { default as PrototypeBanner } from './PrototypeBanner';
/** @deprecated */
export type { PrototypeBannerTone } from './PrototypeBanner';

export { default as PrototypeSearchInput } from '../components/PrototypeSearchInput';
export { default as PrototypeListEmptyState, PrototypeListNoMatchEmptyState } from '../PrototypeListEmptyState';
export { default as PrototypePaneEmptyState } from '../PrototypePaneEmptyState';
