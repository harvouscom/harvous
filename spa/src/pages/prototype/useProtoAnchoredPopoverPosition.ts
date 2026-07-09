import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  computeAnchoredPopoverPosition,
  computeCenteredPortaledDialogPosition,
  computeMainColumnTopRightPopoverPosition,
  resolveMainColumnPopoverHost,
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

/** `anchor` = near trigger; `main-column-top-right` = fixed slot in the main column; `centered` = viewport-centered dialog. */
export type ProtoAnchoredPopoverStrategy = 'anchor' | 'main-column-top-right' | 'centered';

export function useProtoAnchoredPopoverPosition(
  cardRef: RefObject<HTMLElement | null>,
  anchor: ProtoAnchoredPopoverAnchor,
  options: AnchoredPopoverPositionOptions & { enabled: boolean; strategy?: ProtoAnchoredPopoverStrategy },
  layoutDeps: unknown[] = [],
): { position: { top: number; left: number } | null; sync: () => void } {
  const {
    enabled,
    maxHeightPx,
    vhFraction,
    strategy = 'anchor',
    topVhFraction = 0.12,
    fallbackWidth,
    fallbackHeight,
    viewportMargin,
  } = options;
  const isFixedMainColumn = strategy === 'main-column-top-right';
  const isCentered = strategy === 'centered';
  const anchorElRef = useRef(anchor.anchorEl ?? null);
  const anchorRectRef = useRef(anchor.anchorRect ?? null);
  anchorElRef.current = anchor.anchorEl ?? null;
  anchorRectRef.current = anchor.anchorRect ?? null;

  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const sync = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const next = isCentered
      ? computeCenteredPortaledDialogPosition(card, {
          topVhFraction,
          fallbackWidth,
          fallbackHeight,
          viewportMargin,
        })
      : isFixedMainColumn
        ? computeMainColumnTopRightPopoverPosition(card, { viewportMargin })
        : computeAnchoredPopoverPosition(
            card,
            resolveAnchorRect(anchorElRef.current, anchorRectRef.current),
            { maxHeightPx, vhFraction },
          );
    setPosition(next);
  }, [
    cardRef,
    fallbackHeight,
    fallbackWidth,
    isCentered,
    isFixedMainColumn,
    maxHeightPx,
    topVhFraction,
    vhFraction,
    viewportMargin,
  ]);

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
    isCentered,
    isFixedMainColumn,
    sync,
    ...(isCentered || isFixedMainColumn ? layoutDeps : [anchor.anchorEl, anchor.anchorRect, ...layoutDeps]),
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
      const host = resolveMainColumnPopoverHost();
      if (host) ro.observe(host);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onResize);
      };
    }
    if (isCentered) {
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
  }, [cardRef, enabled, isCentered, isFixedMainColumn, sync]);

  return { position, sync };
}
