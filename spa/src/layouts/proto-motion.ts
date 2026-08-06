/**
 * Single source of truth for prototype shell panel motion timing.
 *
 * The sidebar, inspector, and study-thread panel each play a CSS exit animation
 * before they unmount. The JS shell has to keep the element mounted for exactly
 * that long, so the timeout below MUST stay in lockstep with the exit animation
 * length defined in `spa/src/styles/prototype-shell.css` and `--pds-duration-panel`
 * in `prototype-tokens.css`.
 *
 * If you change the CSS exit duration, change this constant too (and vice versa).
 */
export const PROTO_PANEL_EXIT_MS = 260;

/**
 * The expanded sidebar (Planner, Resource library) unfurls and collapses faster
 * than the panels that slide — MUST stay in lockstep with
 * `--pds-duration-panel-expand` in `prototype-tokens.css`.
 *
 * Separate from `PROTO_PANEL_EXIT_MS` because the sidebar, inspector and thread
 * panel all hardcode `0.26s` in `prototype-shell.css`. Speeding this one up by
 * lowering the shared constant would have left those three unmounting 70ms
 * before their own animation finished, which looks like a panel being cut off.
 */
export const PROTO_EXPANDED_SIDEBAR_EXIT_MS = 190;

/**
 * Portaled toolbar popovers (folder / share / find) play a short scale+fade exit
 * before unmount. The dismiss hook keeps each popover mounted for exactly this
 * long — MUST stay in lockstep with `.proto-portaled-popover--motion` in
 * `spa/src/styles/prototype-components.css`.
 */
export const PROTO_POPOVER_MOTION_MS = 120;

/**
 * Centered VOTD / migration modals play a scale+fade exit before unmount.
 * The overlay hook keeps each sheet mounted for exactly this long — MUST stay
 * in lockstep with `.proto-votd-sheet--motion` in `prototype-components.css`.
 *
 * Desktop portaled dialog scrims (`.proto-dialog-backdrop--motion`) and settings
 * modal overlay reuse the same 220ms timing.
 */
export const PROTO_VOTD_SHEET_MOTION_MS = 220;

/** Founder letter paper leaf fan — MUST stay in lockstep with `.proto-paper-leaf` transition in prototype-components.css. */
export const PROTO_FOUNDER_LETTER_PAPER_MS = 900;

/** Founder letter sheet unmount delay — paper fan-back + small buffer. */
export const PROTO_FOUNDER_LETTER_SHEET_EXIT_MS = 920;
