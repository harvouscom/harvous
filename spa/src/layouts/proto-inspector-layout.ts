/** Max editor content column width (`prototype-editor.css` `.proto-editor-content-wrap`). */
export const PROTO_EDITOR_CONTENT_MAX_WIDTH = 720;

/** Inspector column + trailing gutter (`--pds-inspector-w` 260 + 8px). */
export const PROTO_INSPECTOR_RESERVE_WIDTH = 268;

/** Pane width at or above which the inspector docks beside the editor instead of floating. */
export const PANE_DOCK_MIN_WIDTH = PROTO_EDITOR_CONTENT_MAX_WIDTH + PROTO_INSPECTOR_RESERVE_WIDTH;
