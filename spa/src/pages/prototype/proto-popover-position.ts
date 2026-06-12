import { computeAnchoredPopoverPosition as computeAnchoredPopoverPositionBase } from '@/utils/anchored-popover-position';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

export type { AnchoredPopoverPosition } from '@/utils/anchored-popover-position';

/** Prototype toolbar popover offset — matches `.proto-menu__popover { top: calc(100% + 5px) }`. */
export function computeAnchoredPopoverPosition(
  anchor: DOMRect,
  cardWidth: number,
  cardHeight: number,
  offset = PROTO_TOOLBAR_POPOVER_OFFSET + 1,
) {
  return computeAnchoredPopoverPositionBase(anchor, cardWidth, cardHeight, offset);
}
