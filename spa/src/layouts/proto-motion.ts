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

/**
 * Router pending-state timings for lazy routes.
 *
 * TanStack's `defaultPendingMs` default is 1000ms, which for a route whose component is a
 * `lazyRouteComponent` means up to a second of a literally empty pane before anything is drawn.
 * On a PWA cold cache that is the whole "settings doesn't respond when I tap it" report.
 *
 * DELAY is short enough that a chunk fetch shows *something*, long enough that an
 * already-cached chunk resolves without a spinner flashing. MIN keeps the indicator up once
 * shown, so a near-threshold load doesn't strobe.
 */
export const PROTO_ROUTE_PENDING_DELAY_MS = 150;
export const PROTO_ROUTE_PENDING_MIN_MS = 300;

/**
 * A control morphing into the panel it opens — the resource-library "Add
 * resource" button growing into its form.
 *
 * The panel has to stay mounted for exactly this long after it is dismissed, or
 * the collapse is cut off and the button reappears mid-morph. MUST stay in
 * lockstep with `--pds-duration-morph` in `prototype-tokens.css`.
 */
export const PROTO_RESOURCE_MORPH_MS = 190;

/**
 * Note sheet stacking over / off the Bible reader paper — MUST stay in lockstep with
 * `--pds-duration-paper-stack` and `.pds-reader-stack__sheet` in prototype-components.css.
 *
 * Longer than a panel (260ms) on purpose. A panel reveals; this one *moves a sheet the
 * reader is watching* to a resting place above another sheet, and the eye needs to see
 * it arrive or the two papers read as one screen replacing another. Neither sheet
 * unmounts during the move, so this is animation time only — no work is blocked on it.
 */
export const PROTO_PAPER_STACK_MS = 320;

/**
 * How long a Home origin's edge stays up before retiring itself.
 *
 * Not a motion duration — a reading one. The Home edge explains why the app sent you to a
 * note ("Worth another look"), and unlike the reader and note origins it is not holding any
 * state for you to come back to. Once the label has been read the job is done. Long enough
 * to read a short phrase without hurrying and glance back if you missed it; short enough
 * that it is gone before it becomes furniture.
 */
export const PROTO_HOME_ORIGIN_RETIRE_MS = 8000;

/** Founder letter paper leaf fan — MUST stay in lockstep with `.proto-paper-leaf` transition in prototype-components.css. */
export const PROTO_FOUNDER_LETTER_PAPER_MS = 900;

/** Founder letter sheet unmount delay — paper fan-back + small buffer. */
export const PROTO_FOUNDER_LETTER_SHEET_EXIT_MS = 920;
