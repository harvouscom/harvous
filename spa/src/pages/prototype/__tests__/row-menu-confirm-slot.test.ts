/**
 * The compact delete confirm takes over the ⋯ menu's slot.
 *
 * It used to anchor to the "Delete note" *item*, which already sits at the bottom of a
 * menu that is itself offset below the row — so the offsets compounded and the confirm
 * landed ~68px below where the menu had been. Both now derive from the row.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { computeRightAnchoredPopoverPosition } from '../proto-popover-position';
import { MENU_GAP, measureMenuPositionFromRect } from '../PrototypeSidebarRowMenuPopover';

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

/** Matches the real sidebar geometry measured in the browser. */
function rowRect({ top = 323.8, height = 58, right = 302, width = 272 } = {}): DOMRect {
  const left = right - width;
  return {
    top,
    bottom: top + height,
    left,
    right,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('the delete confirm takes over the row menu slot', () => {
  const CARD_WIDTH = 87;
  const CARD_HEIGHT = 34;

  beforeAll(() => {
    window.innerWidth = VIEWPORT_WIDTH;
    window.innerHeight = VIEWPORT_HEIGHT;
  });

  it('right edge lands exactly on the menu right edge', () => {
    const row = rowRect();
    const menu = measureMenuPositionFromRect(row, VIEWPORT_WIDTH);
    const confirm = computeRightAnchoredPopoverPosition(row, CARD_WIDTH, CARD_HEIGHT);

    const menuRightEdge = VIEWPORT_WIDTH - menu.right;
    expect(confirm.left + CARD_WIDTH).toBe(menuRightEdge);
    expect(menuRightEdge).toBe(row.right);
  });

  it('sits just below the row, within a few px of the menu top', () => {
    const row = rowRect();
    const menu = measureMenuPositionFromRect(row, VIEWPORT_WIDTH);
    const confirm = computeRightAnchoredPopoverPosition(row, CARD_WIDTH, CARD_HEIGHT);

    expect(confirm.placement).toBe('below');
    expect(confirm.top).toBeGreaterThanOrEqual(menu.top);
    // Menu gap is 2, the shared proto popover offset is 6 — the confirm may not be
    // pixel-identical, but it must stay in the menu's slot rather than below its items.
    expect(confirm.top - menu.top).toBeLessThanOrEqual(8);
    expect(menu.top).toBe(row.bottom + MENU_GAP);
  });

  it('does not stack below the menu the way item-anchoring did', () => {
    const row = rowRect();
    const menu = measureMenuPositionFromRect(row, VIEWPORT_WIDTH);

    // The old anchor: the "Delete note" item, last in a ~126px-tall menu.
    const deleteItem = {
      ...rowRect({ top: menu.top + 73, height: 29, right: 297.5, width: 117 }),
    } as DOMRect;
    const oldConfirm = computeRightAnchoredPopoverPosition(deleteItem, CARD_WIDTH, CARD_HEIGHT);
    const newConfirm = computeRightAnchoredPopoverPosition(row, CARD_WIDTH, CARD_HEIGHT);

    expect(oldConfirm.top - menu.top).toBeGreaterThan(60);
    expect(newConfirm.top).toBeLessThan(oldConfirm.top);
  });

  it('flips above rather than off-screen for a row near the viewport bottom', () => {
    const row = rowRect({ top: VIEWPORT_HEIGHT - 40 });
    const confirm = computeRightAnchoredPopoverPosition(row, CARD_WIDTH, CARD_HEIGHT);
    expect(confirm.placement).toBe('above');
    expect(confirm.top + CARD_HEIGHT).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
  });
});
