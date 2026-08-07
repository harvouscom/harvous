/**
 * Lets a settings pane refuse to be dismissed while it's in the middle of something.
 *
 * The settings modal closes on a click outside or on Escape, which is right for a
 * pane of rows and wrong for the import workspace: closing unmounts the engine
 * mid-upload, and a several-minute run gives you plenty of chances to click in the
 * wrong place. The blocking pane raises this flag; the layout checks it before
 * closing and leaves the explicit close button as the deliberate way out.
 *
 * Module state rather than context because the only reader is the layout and the
 * only writer is the pane inside it — a provider would be scaffolding around a
 * boolean. Panes must clear it on unmount; PrototypeDataPage does so in an effect.
 */
let blocked = false;

export function setSettingsCloseBlocked(next: boolean): void {
  blocked = next;
}

export function isSettingsCloseBlocked(): boolean {
  return blocked;
}
