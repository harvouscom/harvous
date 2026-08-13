import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';

/**
 * A deck of home-style cards: an overlapping stack that fans out on tap.
 *
 * Replaces the dot-and-caret pager both carousels used to share. That pager
 * put six 8×8px dots between two 18×18px arrows — well under the 24px WCAG
 * floor, let alone 44px for touch — and read as a lot of chrome for a list of
 * suggestions. The stack fixes tappability by removing small targets entirely
 * rather than enlarging them: collapsed, the whole deck is one button; fanned,
 * every card is a full-size one.
 *
 * Collapsed shows at most three layers however many items there are — the cap
 * is about keeping the shape tidy, not hiding content. Fanning reveals all.
 *
 * Tap-anywhere-fans is deliberate (locked with Derek). It costs a second tap to
 * open the top item, accepted because a recall deck is a menu of choices rather
 * than a single call to action.
 */

/** Layers drawn behind the top card. More than two reads as clutter at 260px. */
const MAX_PEEK_LAYERS = 2;

/**
 * Collapsed cards are rendered *inside* the stack's own button, so they must be
 * inert markup — a button inside a button is invalid and unreachable by
 * keyboard. Callers therefore render two trees, not one tree with the handlers
 * switched off: `'preview'` is a plain div, `'interactive'` is the real card.
 */
export type CardStackRenderMode = 'preview' | 'interactive';

export default function PrototypeCardStack<T extends { id: string }>({
  items,
  ariaLabel,
  renderItem,
  /** Label for the collapsed stack's accessible name; count is appended. */
  collapsedLabel = 'Show all',
  onActiveChange,
}: {
  items: T[];
  ariaLabel: string;
  renderItem: (item: T, index: number, mode: CardStackRenderMode) => ReactNode;
  collapsedLabel?: string;
  /**
   * Fires with whatever card is currently on top. Memoize it — it's an effect dependency.
   * Exists because the stack owns `activeIndex`, so a caller that needs to know what the
   * reader is actually looking at (impression tracking) cannot work it out for itself.
   */
  onActiveChange?: (item: T | undefined) => void;
}) {
  const [fanned, setFanned] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * Fanning six cards open adds ~500px below the fold, so the thing you just
   * asked to see is mostly off screen. Bring it back — `block: 'nearest'` so a
   * list that already fits doesn't jump.
   */
  useEffect(() => {
    if (!fanned) return;
    const el = rootRef.current;
    if (!el) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // After paint, so the list has its fanned height before we measure.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [fanned]);

  const len = items.length;
  const index = Math.min(Math.max(activeIndex, 0), Math.max(len - 1, 0));
  const active = items[index];

  /**
   * Follow the card by identity, not by position.
   *
   * This used to only clamp into range, which meant any reorder of `items` left the deck
   * showing whatever had landed at the old index — a different card than the one the reader
   * was looking at a moment ago. PrototypeRecallCarousel carried a correct version of this
   * logic, but against its own `activeIndex` state that never reached render, so it did
   * nothing. The index that actually decides what's on top is this one, so the rule lives here.
   *
   * A card that has genuinely gone (usually snoozed) holds the position instead of snapping
   * back to the front.
   */
  const idsKey = items.map((item) => item.id).join('|');
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = active?.id ?? activeIdRef.current;
  useEffect(() => {
    const keptId = activeIdRef.current;
    const nextIndex = keptId ? items.findIndex((item) => item.id === keptId) : -1;
    setActiveIndex((i) =>
      nextIndex >= 0 ? nextIndex : Math.min(Math.max(i, 0), Math.max(items.length - 1, 0)),
    );
    // Keyed on the id set: a re-render with the same cards must not move the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  /** Lets a caller track what is genuinely on top (impressions) rather than guessing. */
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  // Collapsing when the deck empties out from under us keeps "Show less" from
  // being the only thing left on screen.
  useEffect(() => {
    if (len <= 1) setFanned(false);
  }, [len]);

  /**
   * Swipe still cycles the collapsed stack, so touch users can flick through
   * without expanding — it's the one thing that keeps the top card one tap from
   * open once you're on it.
   */
  const handleSwipeStart = (clientX: number, target: EventTarget | null) => {
    if ((target as HTMLElement)?.closest('button')) return;
    startXRef.current = clientX;
  };
  const handleSwipeEnd = (clientX: number) => {
    const startX = startXRef.current;
    startXRef.current = null;
    if (startX == null || fanned) return;
    const dx = clientX - startX;
    if (dx <= -40) setActiveIndex((i) => Math.min(i + 1, len - 1));
    else if (dx >= 40) setActiveIndex((i) => Math.max(i - 1, 0));
  };

  if (!active) return null;

  // A single card has nothing to stack or fan — render it plainly.
  if (len <= 1) {
    return (
      <div className="proto-card-stack proto-card-stack--single" aria-label={ariaLabel}>
        {renderItem(active, index, 'interactive')}
      </div>
    );
  }

  if (fanned) {
    return (
      <div ref={rootRef} className="proto-card-stack proto-card-stack--fanned" aria-label={ariaLabel}>
        <ul className="proto-card-stack__list">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="proto-card-stack__list-item"
              // Each card starts where the deck was — offset up and slightly
              // inset — and settles into place a beat after the one above it,
              // so the motion reads as the deck spreading rather than a list
              // appearing. Capped so a long deck doesn't crawl.
              style={{ ['--fan-index' as string]: String(Math.min(idx, 6)) }}
            >
              {renderItem(item, idx, 'interactive')}
            </li>
          ))}
        </ul>
        {/*
          An explicit control rather than tap-anywhere-to-collapse, which would
          fight the cards' own open action.
        */}
        <button
          type="button"
          className="proto-card-stack__toggle"
          onClick={() => setFanned(false)}
        >
          <Icon name="caret-up" size={10} aria-hidden />
          <span>Show less</span>
        </button>
      </div>
    );
  }

  // Collapsed. The peek layers are presentational only — the button wrapping
  // them is the whole target, which is the point.
  const peekCount = Math.min(len - 1, MAX_PEEK_LAYERS);

  return (
    <div
      className="proto-card-stack"
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        handleSwipeStart(e.clientX, e.target);
      }}
      onMouseUp={(e) => handleSwipeEnd(e.clientX)}
      onMouseLeave={() => {
        startXRef.current = null;
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 1) handleSwipeStart(e.touches[0].clientX, e.target);
      }}
      onTouchEnd={(e) => {
        if (e.changedTouches.length === 1) handleSwipeEnd(e.changedTouches[0].clientX);
      }}
    >
      <button
        type="button"
        className="proto-card-stack__collapsed"
        aria-expanded={false}
        aria-label={`${collapsedLabel} — ${len} items`}
        onClick={() => setFanned(true)}
      >
        {/* Behind the top card, offset down and inset at the sides so only the
            edges show. aria-hidden: they carry no information a screen reader
            needs beyond the count already in the button's name. */}
        {Array.from({ length: peekCount }).map((_, layer) => (
          <span
            key={layer}
            className="proto-card-stack__peek"
            aria-hidden
            style={{ ['--peek-depth' as string]: String(layer + 1) }}
          />
        ))}
        {/* Inert preview markup — see CardStackRenderMode. */}
        <span className="proto-card-stack__top">{renderItem(active, index, 'preview')}</span>
      </button>
    </div>
  );
}
