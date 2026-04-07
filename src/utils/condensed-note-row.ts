/**
 * Shared compact row metrics (CondensedNoteItem, ThreadNotesList scripture rows).
 *
 * Icon opacity: 0.8 on saturated accent strips (readable on color without full weight).
 * On white / paper / mesh bars keep ~0.3 so titles stay visually primary — do not unify all icons to one opacity.
 */
export const CONDENSED_NOTE_ROW_HEIGHT_PX = 42;
/** Compact row accent icons (CondensedNoteRowLayout, add-to-space lists). Card note sidebar remains 20px in CSS. */
export const CONDENSED_NOTE_ICON_PX = 16;
/** Solid thread/space color strips; aligns with `.featured-card__accent svg` and `.card-thread__icon svg`. */
export const CONDENSED_SOLID_ACCENT_ICON_OPACITY = 0.8;
