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

/**
 * Whether this browser was running Harvous before 3.0. `'1'` upgraded, `'0'` arrived new.
 *
 * Written by `public/scripts/prototype-route-boot.js` before the bundle loads, and never
 * recomputed after. It has to be sampled there because the answer stops being available
 * almost immediately: the question is whether any Harvous key predates this build, and this
 * build starts writing its own within a render or two of starting up.
 *
 * Read it, never write it. Keep the literal in sync with the boot script.
 */
export const PROTO_UPGRADED_FROM_2_KEY = 'harvous-proto-upgraded-from-2';

/** Client flag: user has seen the Harvous 3 welcome. One message, said once. */
export const PROTO_WELCOME_3_DISMISSED_KEY = 'harvous-proto-welcome-3-dismissed';

/** Dev-only: force the Harvous 3 welcome for UI testing (`import.meta.env.DEV` only). */
export const PROTO_WELCOME_3_PREVIEW_KEY = 'harvous-proto-welcome-3-preview';

/** Client flag: user dismissed the install web app card on prototype home. */
export const PROTO_INSTALL_WEB_APP_DISMISSED_KEY = 'harvous-prototype-install-web-app-dismissed';

/** Dev-only: force the install web app card for UI testing (`import.meta.env.DEV` only). */
export const PROTO_INSTALL_WEB_APP_PREVIEW_KEY = 'harvous-prototype-install-web-app-preview';

/** Client flag: user put away the "want a nudge Sunday morning?" card on Home. */
export const PROTO_PUSH_REMINDERS_DISMISSED_KEY = 'harvous-proto-push-reminders-dismissed';

/** Dev-only: force the reminders card for UI testing (`import.meta.env.DEV` only). */
export const PROTO_PUSH_REMINDERS_PREVIEW_KEY = 'harvous-proto-push-reminders-preview';

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

/**
 * This browser is trying Harvous without an account. Holds the ISO time the visit started.
 *
 * A timestamp rather than `'1'` because it is the one dismissible-adjacent marker that is not a
 * yes-or-no: the exit prompt and the guest row both want to say how long this has been going on,
 * and a boolean would have meant a second key to answer that.
 *
 * Also written by `public/scripts/prototype-route-boot.js` before React loads, so the shell never
 * paints the signed-out frame on the way in. Keep the literal in sync there.
 */
export const PROTO_GUEST_SESSION_KEY = 'harvous-proto-guest';

/**
 * The exit prompt has already had its one turn this visit.
 *
 * sessionStorage, for the same reason as the spotlight above: "I already asked" is about this
 * trip. A guest who comes back tomorrow has not been asked today.
 */
export const PROTO_GUEST_EXIT_PROMPT_KEY = 'harvous-proto-guest-exit-prompt-shown';

/**
 * A checklist row was pressed somewhere that cannot act on it — the toolbar popover, which is
 * reachable from every screen and knows none of their destinations.
 *
 * sessionStorage and consumed once, like the spotlight above: it is a handoff for this trip to
 * Home, not a preference. Home owns `handleOnboardingStep`, which knows that "write a note"
 * means the compose session and "revisit" means glowing the recall shelf; re-deriving any of
 * that at the toolbar would be a second copy to keep true.
 */
export const PROTO_ONBOARDING_PENDING_STEP_KEY = 'harvous-proto-onboarding-pending-step';
