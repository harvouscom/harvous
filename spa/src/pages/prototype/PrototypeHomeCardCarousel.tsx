import { type ReactNode } from 'react';
import PrototypeCardStack, { type CardStackRenderMode } from './PrototypeCardStack';

/**
 * Home-style card deck — shared-space note previews.
 *
 * Was a duplicate of the recall carousel: identical swipe handlers, identical
 * `clampIndex`, identical dot-and-caret pager markup. Both now render
 * `PrototypeCardStack`, so there is one paging idiom in the app rather than two
 * copies of one that was hard to tap.
 *
 * Kept as a thin wrapper rather than deleted so the two call sites keep their
 * current import, and so `renderItem`'s old two-argument signature still works —
 * callers that don't care about preview-vs-interactive don't have to.
 */
export default function PrototypeHomeCardCarousel<T extends { id: string }>({
  items,
  ariaLabel,
  renderItem,
}: {
  items: T[];
  ariaLabel: string;
  renderItem: (item: T, index: number, mode: CardStackRenderMode) => ReactNode;
}) {
  return (
    <PrototypeCardStack
      items={items}
      ariaLabel={ariaLabel}
      collapsedLabel={`Show all ${ariaLabel.toLowerCase()}`}
      renderItem={renderItem}
    />
  );
}
