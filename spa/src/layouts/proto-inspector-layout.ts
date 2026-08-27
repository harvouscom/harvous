/**
 * The editor content column's *base* width (`--pds-paper-column-min`), which is what the
 * dock threshold below is asking about.
 *
 * No longer the maximum: above 832px of pane the sheet widens toward 816px. That growth is
 * deliberately not reflected here. Docking the inspector shrinks the pane, the sheet clamps
 * back down to this floor, and the question "is there room for both?" is answered by the
 * width the paper can always fall back to — not by the width it would like on an empty pane.
 * Using the ceiling instead would refuse to dock at pane widths where docking fits fine.
 */
export const PROTO_EDITOR_CONTENT_MAX_WIDTH = 720;

/** Inspector column + trailing gutter (`--pds-inspector-w` 260 + 8px). */
export const PROTO_INSPECTOR_RESERVE_WIDTH = 268;

/** Pane width at or above which the inspector docks beside the editor instead of floating. */
export const PANE_DOCK_MIN_WIDTH = PROTO_EDITOR_CONTENT_MAX_WIDTH + PROTO_INSPECTOR_RESERVE_WIDTH;
