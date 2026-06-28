import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  computeAnchoredPopoverPosition,
  computeMainColumnTopRightPopoverPosition,
  type AnchoredPopoverPositionOptions,
} from './proto-anchored-popover-position';

export function resolveAnchorRect(
  anchorEl: HTMLElement | null | undefined,
  anchorRect: DOMRect | null | undefined,
): DOMRect | null {
  if (anchorEl?.isConnected) {
    return anchorEl.getBoundingClientRect();
  }
  return anchorRect ?? null;
}

export type ProtoAnchoredPopoverAnchor = {
  anchorEl?: HTMLElement | null;
  anchorRect?: DOMRect | null;
};

/** `anchor` = near trigger; `main-column-top-right` = fixed slot in the main column. */
export type ProtoAnchoredPopoverStrategy = 'anchor' | 'main-column-top-right';

export function useProtoAnchoredPopoverPosition(
  cardRef: RefObject<HTMLElement | null>,
  anchor: ProtoAnchoredPopoverAnchor,
  options: AnchoredPopoverPositionOptions & { enabled: boolean; strategy?: ProtoAnchoredPopoverStrategy },
  layoutDeps: unknown[] = [],
): { position: { top: number; left: number } | null; sync: () => void } {
  const { enabled, maxHeightPx, vhFraction, strategy = 'anchor' } = options;
  const isFixedMainColumn = strategy === 'main-column-top-right';
  const anchorElRef = useRef(anchor.anchorEl ?? null);
  const anchorRectRef = useRef(anchor.anchorRect ?? null);
  anchorElRef.current = anchor.anchorEl ?? null;
  anchorRectRef.current = anchor.anchorRect ?? null;

  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const sync = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const next = isFixedMainColumn
      ? computeMainColumnTopRightPopoverPosition(card)
      : computeAnchoredPopoverPosition(
          card,
          resolveAnchorRect(anchorElRef.current, anchorRectRef.current),
          { maxHeightPx, vhFraction },
        );
    setPosition(next);
  }, [cardRef, isFixedMainColumn, maxHeightPx, vhFraction]);

  useLayoutEffect(() => {
    if (!enabled) {
      setPosition(null);
      return;
    }
    sync();
    // Re-sync when popover content/layout changes (caller-supplied deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutDeps is intentional
  }, [
    enabled,
    isFixedMainColumn,
    sync,
    ...(isFixedMainColumn ? layoutDeps : [anchor.anchorEl, anchor.anchorRect, ...layoutDeps]),
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onResize = () => sync();
    window.addEventListener('resize', onResize);
    const card = cardRef.current;
    if (!card) {
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver(() => sync());
    ro.observe(card);
    if (isFixedMainColumn) {
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onResize);
      };
    }
    const onScroll = () => sync();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [cardRef, enabled, isFixedMainColumn, sync]);

  return { position, sync };
}
