/** Last space used in prototype (mobile search shortcut). */
export const PROTO_LAST_SPACE_KEY = 'harvous-prototype-last-space-id';

/** Client flag: prototype Classic→2.0 backfill API has run for this browser. */
export const PROTO_MIGRATION_DONE_KEY = 'harvous-prototype-migration-v1-done';

/** Client flag: user dismissed the founder letter pill on Home. */
export const PROTO_FOUNDER_LETTER_DISMISSED_KEY = 'harvous-prototype-founder-letter-dismissed';

/** Dev-only: force the founder letter pill for UI testing (`import.meta.env.DEV` only). */
export const PROTO_FOUNDER_LETTER_PREVIEW_KEY = 'harvous-prototype-founder-letter-preview';

/** The release whose notes the reader has put away. Not a boolean — see `useDismissibleRelease`. */
export const PROTO_WHATS_NEW_DISMISSED_KEY = 'harvous-prototype-whats-new-dismissed';

/** Dev-only: force the what's-new row for UI testing (`import.meta.env.DEV` only). */
export const PROTO_WHATS_NEW_PREVIEW_KEY = 'harvous-prototype-whats-new-preview';

/** Client flag: user dismissed the install web app card on prototype home. */
export const PROTO_INSTALL_WEB_APP_DISMISSED_KEY = 'harvous-prototype-install-web-app-dismissed';

/** Dev-only: force the install web app card for UI testing (`import.meta.env.DEV` only). */
export const PROTO_INSTALL_WEB_APP_PREVIEW_KEY = 'harvous-prototype-install-web-app-preview';

/** This device's cache of the onboarding checklist — first paint, before the account answers. */
export const PROTO_ONBOARDING_KEY = 'harvous-proto-onboarding';

/** A local checklist edit awaiting push to the account (survives reload and offline). */
export const PROTO_ONBOARDING_PENDING_KEY = 'harvous-proto-onboarding-pending';

/** Dev-only: force the getting-started dock for UI testing (`import.meta.env.DEV` only). */
export const PROTO_ONBOARDING_PREVIEW_KEY = 'harvous-proto-onboarding-preview';

/**
 * Handoff for the one-shot spotlight: the target a checklist row is sending you to.
 *
 * sessionStorage rather than local — a glow is about this trip across the app, and should
 * not be waiting in a tab you open tomorrow.
 */
export const PROTO_SPOTLIGHT_KEY = 'harvous-proto-spotlight';
