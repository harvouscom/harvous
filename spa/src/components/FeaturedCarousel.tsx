import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeaturedItem } from '../hooks/queries/useFeaturedItems';
import FeaturedCard, { readDismissedFeaturedItem } from './FeaturedCard';

function clampIndex(index: number, len: number) {
  if (len <= 0) return 0;
  if (index < 0) return 0;
  if (index >= len) return len - 1;
  return index;
}

export default function FeaturedCarousel({ items }: { items: FeaturedItem[] }) {
  const initial = useMemo(() => items.filter((i) => !readDismissedFeaturedItem(i.id)), [items]);
  const [localItems, setLocalItems] = useState<FeaturedItem[]>(initial);
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep localItems in sync with server list (server excludes dismissed; localStorage is extra safety).
  useEffect(() => {
    const next = items.filter((i) => !readDismissedFeaturedItem(i.id));
    setLocalItems(next);
    setActiveIndex((prev) => clampIndex(prev, next.length));
  }, [items]);

  const activeItem = localItems[activeIndex] ?? null;

  const startXRef = useRef<number | null>(null);

  const goPrev = () => setActiveIndex((i) => clampIndex(i - 1, localItems.length));
  const goNext = () => setActiveIndex((i) => clampIndex(i + 1, localItems.length));

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

  if (!activeItem) return null;

  return (
    <div
      className="featured-carousel"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        handleSwipeStart(e.clientX, e.target);
      }}
      onMouseUp={(e) => handleSwipeEnd(e.clientX)}
      onMouseLeave={() => { startXRef.current = null; }}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          handleSwipeStart(e.touches[0].clientX, e.target);
        }
      }}
      onTouchEnd={(e) => {
        if (e.changedTouches.length === 1) {
          handleSwipeEnd(e.changedTouches[0].clientX);
        }
      }}
      aria-label="Featured items"
    >
      <FeaturedCard
        item={activeItem}
        onClose={() => {
          setLocalItems((prev) => {
            const next = prev.filter((x) => x.id !== activeItem.id);
            setActiveIndex((idx) => clampIndex(idx, next.length));
            return next;
          });
        }}
      />

      {localItems.length > 1 ? (
        <div className="featured-carousel__dots" role="tablist" aria-label="Featured item positions">
          {localItems.map((it, idx) => (
            <button
              key={it.id}
              type="button"
              className={`featured-carousel__dot${idx === activeIndex ? ' featured-carousel__dot--active' : ''}`}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Show featured item ${idx + 1} of ${localItems.length}`}
              aria-selected={idx === activeIndex}
              role="tab"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

