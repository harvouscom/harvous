/**
 * Icon box sizes for `/prototype/` chrome — Font Awesome Solid via `Icon` (fill-based, no stroke).
 *
 * Toolbar orbs use `--pds-toolbar-orb-size` (30px) with `PROTO_TOOLBAR_ORB_ICON_SIZE` glyphs.
 * Popover/menu items keep the former 15px box via `PROTO_TOOLBAR_ICON_SIZE`.
 */
export const PROTO_TOOLBAR_ORB_ICON_SIZE = 17;

/** Folder chip glyph — scales with `--pds-toolbar-orb-size`. */
export const PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE = 15;

/** Popover/menu glyphs — former toolbar-aligned 15px box. */
export const PROTO_TOOLBAR_ICON_SIZE = 15;

/** List view mode trigger (`ListViewMenu` notes / folders / highlights / scripture icon) — toolbar-aligned box. */
export const PROTO_LIST_VIEW_ICON_SIZE = 15;

/** Gap below toolbar triggers — matches `.proto-menu__popover { top: calc(100% + 5px) }`. */
export const PROTO_TOOLBAR_POPOVER_OFFSET = 5;
