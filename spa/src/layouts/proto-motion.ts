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
 * The Library panel morphing out of (and back into) the toolbar's center chip — MUST
 * stay in lockstep with `--pds-duration-morph` in `prototype-tokens.css`.
 *
 * Shares the resource-add morph's duration because it is the same gesture at a larger
 * scale: a control growing into the surface it opens. Kept as its own constant anyway —
 * the two are the same length by agreement, not by dependency, and a future retune of
 * one should not silently move the other.
 *
 * The mobile sheet is a different animation with different timing; it holds for
 * `PROTO_VOTD_SHEET_MOTION_MS` instead.
 */
export const PROTO_LIBRARY_PANEL_MS = 190;

/**
 * Note sheet stacking over / off the Bible reader paper — MUST stay in lockstep with
 * `--pds-duration-paper-stack` and `.pds-reader-stack__sheet` in prototype-components.css.
 *
 * Longer than a panel (190ms) on purpose. A panel reveals; this one *moves a sheet the
 * reader is watching* to a resting place above another sheet, and the eye needs to see
 * it arrive or the two papers read as one screen replacing another. Neither sheet
 * unmounts during the move, so this is animation time only — no work is blocked on it.
 */
export const PROTO_PAPER_STACK_MS = 260;

/**
 * The same move going the other way — MUST stay in lockstep with
 * `--pds-duration-paper-stack-exit`.
 *
 * Shorter, because an exit is not the same event as an entrance. Arriving, the move is
 * telling you where the thing came from; leaving, you already know, and every millisecond
 * past that is time spent watching an answer you have. This is also what the collapse is
 * held open for before the stack clears, so the two must agree: hold longer and a dead page
 * sits on screen, hold shorter and the chapter is cut off mid-close.
 */
export const PROTO_PAPER_STACK_EXIT_MS = 200;

/**
 * How long a completed checklist row is left on screen wearing its check before it starts
 * to collapse — MUST stay in lockstep with the `animation-delay` on
 * `.proto-onboarding-dock__row--done` in prototype-components.css.
 *
 * The dwell is the entire point of the row's last moment. Completion usually happens
 * somewhere else in the app (you highlighted a verse; the row for it is in the sidebar), so
 * this is often the only chance to see the thing tick over. Collapse immediately and a row
 * has silently disappeared from a list nobody was looking at.
 */
export const PROTO_ONBOARDING_ROW_DWELL_MS = 900;

/**
 * The collapse itself — MUST stay in lockstep with `proto-onboarding-row-out` in
 * prototype-components.css. The dock keeps the row mounted for dwell + exit, so both
 * constants have to agree with the CSS or the row is cut off mid-collapse.
 */
export const PROTO_ONBOARDING_ROW_EXIT_MS = 320;

/** Founder letter paper leaf fan — MUST stay in lockstep with `.proto-paper-leaf` transition in prototype-components.css. */
export const PROTO_FOUNDER_LETTER_PAPER_MS = 900;

/** Founder letter sheet unmount delay — paper fan-back + small buffer. */
export const PROTO_FOUNDER_LETTER_SHEET_EXIT_MS = 920;

/**
 * How long the Review dock holds the moment after an answer.
 *
 * Long enough to read "Recalled. Back in two weeks." and short enough that a sitting of three
 * does not feel gated on animation. The reader can start typing the next answer before it
 * clears — the timer replaces the card, it does not block anything.
 */
export const PROTO_REVIEW_RESULT_DWELL_MS = 1800;

/**
 * How long a space dashboard wears `--enter` — MUST outlast every animation the class
 * starts, which is the section fade (`--pds-duration-home-section`) and, running
 * alongside it rather than after it, the row cascade: `--pds-duration-home-row` plus the
 * last row's share of `--pds-duration-home-row-step`. The cascade caps at six rows, so
 * five steps.
 *
 * The two are concurrent, so this is the longer of them and not their sum:
 * max(420, 320 + 5×28) = 460, plus slack for a row that starts a frame late. Adding them
 * would hold an inert class on the view for most of a second after everything had settled.
 *
 * Generous in one direction only. The class is *removed* when the window ends, and removing
 * it mid-animation snaps a half-faded row to full opacity — visible, and worse than the
 * wait. `proto-motion-home-enter.test.ts` holds both bounds.
 */
export const PROTO_HOME_ENTER_WINDOW_MS = 560;
