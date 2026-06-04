/**
 * Single source of truth for prototype shell panel motion timing.
 *
 * The sidebar, inspector, and study-thread panel each play a CSS exit animation
 * before they unmount. The JS shell has to keep the element mounted for exactly
 * that long, so the timeout below MUST stay in lockstep with the exit animation
 * length defined in `spa/src/styles/prototype-shell.css`.
 *
 * If you change the CSS exit duration, change this constant too (and vice versa).
 */
export const PROTO_PANEL_EXIT_MS = 260;
