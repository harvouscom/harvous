import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';

function clampIndex(index: number, len: number) {
  if (len <= 0) return 0;
  if (index < 0) return 0;
  if (index >= len) return len - 1;
  return index;
}

/**
 * Swipeable home-style card pager — shared by recall resurfacing and shared-space note previews.
 * Reuses recall carousel chrome (dots + chevrons); callers supply card content via renderItem.
 */
export default function PrototypeHomeCardCarousel<T extends { id: string }>({
  items,
  ariaLabel,
  renderItem,
}: {
  items: T[];
  ariaLabel: string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef<number | null>(null);

  const len = items.length;
  const index = clampIndex(activeIndex, len);
  const active = items[index];

  useEffect(() => {
    setActiveIndex((i) => clampIndex(i, items.length));
  }, [items.length, items.map((item) => item.id).join('|')]);

  const goPrev = () => setActiveIndex((i) => clampIndex(i - 1, len));
  const goNext = () => setActiveIndex((i) => clampIndex(i + 1, len));

  const handleSwipeStart = (clientX: number, target: EventTarget | null) => {
    if ((target as HTMLElement)?.closest('button')) return;
    startXRef.current = clientX;
  };

  const handleSwipeEnd = (clientX: number) => {
    const startX = startXRef.current;
    startXRef.current = null;
    if (startX == null) return;
    const dx = clientX - startX;
    const threshold = 40;
    if (dx <= -threshold) goNext();
    else if (dx >= threshold) goPrev();
  };

  if (!active) return null;

  const canGoPrev = len > 1 && index > 0;
  const canGoNext = len > 1 && index < len - 1;

  return (
    <div
      className={`proto-recall-carousel${len <= 1 ? ' proto-recall-carousel--single' : ''}`}
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
      aria-label={ariaLabel}
    >
      {renderItem(active, index)}

      {len > 1 ? (
        <div className="proto-recall-carousel__pager" role="navigation" aria-label={`${ariaLabel} pages`}>
          <button
            type="button"
            className="proto-recall-carousel__pager-btn"
            aria-label="Previous item"
            disabled={!canGoPrev}
            onClick={goPrev}
          >
            <Icon name="caret-left" size={14} />
          </button>
          <div className="proto-recall-carousel__dots" role="tablist" aria-label={`${ariaLabel} positions`}>
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`proto-recall-carousel__dot${idx === index ? ' proto-recall-carousel__dot--active' : ''}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Show item ${idx + 1} of ${len}`}
                aria-selected={idx === index}
                role="tab"
              />
            ))}
          </div>
          <button
            type="button"
            className="proto-recall-carousel__pager-btn"
            aria-label="Next item"
            disabled={!canGoNext}
            onClick={goNext}
          >
            <Icon name="caret-right" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
