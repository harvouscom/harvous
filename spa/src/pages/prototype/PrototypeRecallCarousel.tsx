import { useCallback, useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import type { RecallCandidate } from '@/utils/prototype-home-trends';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
import { recordRecallOpportunityEvent } from './proto-recall-events';
import { recordRecallSectionEngaged } from './proto-recall-cooldown';
import PrototypeCardStack from './PrototypeCardStack';

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
  kind: RecallOpportunityKind;
  /** Owned note id for spaced-repetition when opening note-backed opportunities. */
  noteId?: string;
  /** Dominant canon section for revisit diversity tracking. */
  canonSection?: string;
  /** Open the underlying note / highlight / passage / thread. */
  onOpen: () => void;
}


export default function PrototypeRecallCarousel({
  opportunities,
  onSnooze,
  onOpened,
  onRecallSynced,
  homeSpaceId,
}: {
  opportunities: RecallOpportunity[];
  onSnooze: (id: string) => void;
  /** Acting on a card — rests it so the same suggestion doesn't return tomorrow. */
  onOpened?: (id: string) => void;
  /** Called after a note-backed open event syncs (e.g. invalidate fingerprints). */
  onRecallSynced?: () => void;
  homeSpaceId?: string | null;
}) {
  const lastImpressionIdRef = useRef<string | null>(null);

  /**
   * What's on top comes from PrototypeCardStack, which owns the index that decides it.
   *
   * This component used to keep its own `activeIndex` — including a "follow the card the user
   * is looking at" effect — but it never passed that index to the stack, so the state governed
   * nothing and the impressions below were recorded against a card that might not be the one on
   * screen. Both the follow-by-id rule and the index now live in the stack; this just listens.
   */
  const [active, setActive] = useState<RecallOpportunity | undefined>(undefined);
  const handleActiveChange = useCallback((item: RecallOpportunity | undefined) => {
    setActive(item);
  }, []);

  useEffect(() => {
    if (!active || lastImpressionIdRef.current === active.id) return;
    lastImpressionIdRef.current = active.id;
    recordRecallOpportunityEvent({
      opportunityId: active.id,
      kind: active.kind,
      action: 'impression',
      noteId: active.noteId,
    });
  }, [active]);

  if (opportunities.length === 0) return null;

  /** The card's visible content — identical in both modes, so a preview and a
   *  real card never look different, only behave differently. */
  const cardInner = (op: RecallOpportunity) => (
    <>
      <p className="proto-caption proto-home-card__eyebrow">{op.eyebrow}</p>
      <div className="proto-home-card__body">
        <div className="proto-home-card__title-row">
          <span className="proto-home-card__icon-orb" aria-hidden>
            <Icon name={op.iconName} size={13} />
          </span>
          <p className="pds-list-title proto-home-card__title">{op.title}</p>
          <span className="proto-home-card__chevron" aria-hidden>
            <Icon name="caret-right" size={11} />
          </span>
        </div>
        {op.meta ? (
          <div className="proto-home-card__meta">
            <span className="proto-home-card__meta-item">{op.meta}</span>
          </div>
        ) : null}
      </div>
    </>
  );

  const openOpportunity = (op: RecallOpportunity) => {
    recordRecallOpportunityEvent({
      opportunityId: op.id,
      kind: op.kind,
      action: 'open',
      noteId: op.noteId,
      onSynced: op.noteId ? onRecallSynced : undefined,
    });
    if (op.canonSection) {
      recordRecallSectionEngaged(homeSpaceId, op.canonSection);
    }
    onOpened?.(op.id);
    op.onOpen();
  };

  const snoozeOpportunity = (op: RecallOpportunity) => {
    recordRecallOpportunityEvent({
      opportunityId: op.id,
      kind: op.kind,
      action: 'snooze',
      noteId: op.noteId,
    });
    onSnooze(op.id);
    // No index to fix up here any more — the stack notices the card left its `items` and
    // holds position itself.
  };

  return (
    <PrototypeCardStack
      items={opportunities}
      ariaLabel="Recall opportunities"
      collapsedLabel="Show all recall suggestions"
      onActiveChange={handleActiveChange}
      renderItem={(op, _idx, mode) => {
        // Preview: inert markup only. It sits inside the stack's own button,
        // and a button within a button is invalid and keyboard-unreachable.
        if (mode === 'preview') {
          return (
            <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-recall-card">
              <div className="proto-recall-card__main">{cardInner(op)}</div>
            </div>
          );
        }

        // No busy state any more. Generative cards used to go aria-busy while a create was
        // in flight, and needed a re-entrancy guard so a second tap didn't make a second note.
        // Compose opens synchronously and is a single session, so there is no window to guard.
        return (
          <div className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-recall-card">
            {/* Snooze is per-card once fanned — it is how the deck gets trained,
                so it must never become unreachable. */}
            <button
              type="button"
              className="proto-daily-passage-pill__dismiss"
              aria-label={`Not now — remind me later about ${op.title}`}
              onClick={(e) => {
                e.stopPropagation();
                snoozeOpportunity(op);
              }}
            >
              <Icon name="xmark" size={10} aria-hidden />
              <span>Not now</span>
            </button>
            <button
              type="button"
              className="proto-recall-card__main"
              onClick={() => openOpportunity(op)}
            >
              {cardInner(op)}
            </button>
          </div>
        );
      }}
    />
  );
}
