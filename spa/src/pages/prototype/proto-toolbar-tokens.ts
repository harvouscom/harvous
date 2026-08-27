/**
 * Icon box sizes for `/prototype/` chrome — Font Awesome Solid via `Icon` (fill-based, no stroke).
 *
 * Toolbar orbs use `--pds-toolbar-orb-size` (30px) with `PROTO_TOOLBAR_ORB_ICON_SIZE` glyphs.
 * Popover/menu items keep the former 15px box via `PROTO_TOOLBAR_ICON_SIZE`.
 */
export const PROTO_TOOLBAR_ORB_ICON_SIZE = 17;

/** Folder chip glyph — scales with `--pds-toolbar-orb-size`. */
export const PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE = 15;

/**
 * Popover/menu glyphs. Every use is inside a `.proto-menu-item__icon`, so this
 * is the menu glyph size despite the toolbar-era name.
 *
 * 17, not the old 15, because the menu row grew to ~38px: a 15px glyph in an
 * 18px box left the icons looking stranded against the larger label beside
 * them. Keep it one below the CSS box so the glyph never touches its edges.
 */
export const PROTO_TOOLBAR_ICON_SIZE = 17;

/**
 * The tick on a selected menu row. Deliberately below the glyph size — the row
 * icon says what the thing is, the tick only says you are on it — but it moved
 * up with the rest, since a 12px tick beside a 17px glyph read as a leftover.
 */
export const PROTO_MENU_CHECK_ICON_SIZE = 14;

/** List view mode trigger (`ListViewMenu` notes / folders / highlights / scripture icon) — toolbar-aligned box. */
export const PROTO_LIST_VIEW_ICON_SIZE = 15;

/**
 * The icon *block* inside a sidebar-switch half — the box every icon is drawn into,
 * whatever kind it is. 18 because that is what `ProtoSpaceMenuIcon` already draws its
 * tile at (`PROTO_TOOLBAR_ICON_SIZE + 1`), and the tile is the one kind whose size is
 * not ours to pick.
 */
export const PROTO_SEG_ICON_SIZE = 18;

/**
 * A *bare* glyph in that block — My Home's house, the list mode's icon.
 *
 * Two below the block, because only the tile actually fills it: the tile is an 11px
 * glyph floating in soft fill, so its ink stops well short of its 18px edge. A bare
 * glyph drawn to the full 18 is solid to the corners and lands heavier than the tile
 * it sits beside. Two pixels is the whole correction — 13 was tried, and a glyph that
 * small reads as weaker than its neighbour rather than equal to it.
 *
 * The tile keeps `PROTO_SEG_ICON_SIZE`; only bare glyphs take this.
 */
export const PROTO_SEG_GLYPH_SIZE = PROTO_SEG_ICON_SIZE - 2;

/** Gap below toolbar triggers — matches `.proto-menu__popover { top: calc(100% + 5px) }`. */
export const PROTO_TOOLBAR_POPOVER_OFFSET = 5;
