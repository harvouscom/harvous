import { useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import type { RecallCandidate } from '@/utils/prototype-home-trends';

/**
 * One swipeable carousel of recall opportunities on the prototype Home — a fading meaningful note, a
 * highlight, a theme taking shape, a passage you return to — replacing the old stack of single cards.
 * Each card opens its target or can be snoozed ("not now"). Swipe + dot pager with chevron arrows.
 * Selection/ordering is done upstream by selectRecallOpportunities; this is presentational.
 */

export interface RecallOpportunity extends RecallCandidate {
  eyebrow: string;
  title: string;
  meta: string;
  iconName: IconName;
  /** Open the underlying note / highlight / passage / thread. */
  onOpen: () => void;
}

function clampIndex(index: number, len: number) {
  if (len <= 0) return 0;
  if (index < 0) return 0;
  if (index >= len) return len - 1;
  return index;
}

export default function PrototypeRecallCarousel({
  opportunities,
  onSnooze,
}: {
  opportunities: RecallOpportunity[];
  onSnooze: (id: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef<number | null>(null);

  const len = opportunities.length;
  const index = clampIndex(activeIndex, len);
  const active = opportunities[index];

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
      aria-label="Recall opportunities"
    >
      <div
        className={`proto-glass-surface proto-glass-surface--panel proto-home-card proto-recall-card${active.isGenerative ? ' proto-recall-card--generative' : ''}`}
      >
        <button
          type="button"
          className="proto-daily-passage-pill__dismiss"
          aria-label="Not now — remind me later"
          onClick={() => {
            onSnooze(active.id);
            setActiveIndex((i) => clampIndex(i, len - 1));
          }}
        >
          <Icon name="xmark" size={10} aria-hidden />
          <span>Not now</span>
        </button>
        <button type="button" className="proto-recall-card__main" onClick={active.onOpen}>
          <p className="proto-caption proto-home-card__eyebrow">{active.eyebrow}</p>
          <div className="proto-home-card__body">
            <div className="proto-home-card__title-row">
              <span className="proto-home-card__icon-orb" aria-hidden>
                <Icon name={active.iconName} size={13} />
              </span>
              <p className="pds-list-title proto-home-card__title">{active.title}</p>
              <span className="proto-home-card__chevron" aria-hidden>
                <Icon name="chevron-right" size={11} />
              </span>
            </div>
            {active.meta ? (
              <div className="proto-home-card__meta">
                <span className="proto-home-card__meta-item">{active.meta}</span>
              </div>
            ) : null}
          </div>
        </button>
      </div>

      {len > 1 ? (
        <div className="proto-recall-carousel__pager" role="navigation" aria-label="Recall carousel">
          <button
            type="button"
            className="proto-recall-carousel__pager-btn"
            aria-label="Previous recall item"
            disabled={!canGoPrev}
            onClick={goPrev}
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <div className="proto-recall-carousel__dots" role="tablist" aria-label="Recall positions">
            {opportunities.map((op, idx) => (
              <button
                key={op.id}
                type="button"
                className={`proto-recall-carousel__dot${idx === index ? ' proto-recall-carousel__dot--active' : ''}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Show recall item ${idx + 1} of ${len}`}
                aria-selected={idx === index}
                role="tab"
              />
            ))}
          </div>
          <button
            type="button"
            className="proto-recall-carousel__pager-btn"
            aria-label="Next recall item"
            disabled={!canGoNext}
            onClick={goNext}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
