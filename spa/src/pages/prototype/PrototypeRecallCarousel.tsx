import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import type { RecallCandidate } from '@/utils/prototype-home-trends';
import { recallKindCreatesNote, type RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
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

function clampIndex(index: number, len: number) {
  if (len <= 0) return 0;
  if (index < 0) return 0;
  if (index >= len) return len - 1;
  return index;
}

export default function PrototypeRecallCarousel({
  opportunities,
  onSnooze,
  onOpened,
  onRecallSynced,
  homeSpaceId,
  creatingNote = false,
}: {
  opportunities: RecallOpportunity[];
  onSnooze: (id: string) => void;
  /** Acting on a card — rests it so the same suggestion doesn't return tomorrow. */
  onOpened?: (id: string) => void;
  /** Called after a note-backed open event syncs (e.g. invalidate fingerprints). */
  onRecallSynced?: () => void;
  homeSpaceId?: string | null;
  /** A note create started from a card is still in flight. */
  creatingNote?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startXRef = useRef<number | null>(null);
  const lastImpressionIdRef = useRef<string | null>(null);

  const len = opportunities.length;
  const index = clampIndex(activeIndex, len);
  const active = opportunities[index];

  // Late-arriving queries reorder the deck after first paint. Follow the card the user is
  // actually looking at rather than letting the content swap under their cursor.
  const idsKey = opportunities.map((o) => o.id).join('|');
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = active?.id ?? activeIdRef.current;
  useEffect(() => {
    const keptId = activeIdRef.current;
    if (!keptId) return;
    const nextIndex = opportunities.findIndex((o) => o.id === keptId);
    // Card gone (usually just snoozed) — hold the position instead of snapping to the
    // front, which is what the snooze handler's own clamp already does.
    setActiveIndex((i) => (nextIndex >= 0 ? nextIndex : clampIndex(i, opportunities.length)));
    // Keyed on the id set, not the array identity — a re-render with the same cards
    // must not move the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

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

  if (!active) return null;

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
    setActiveIndex((i) => clampIndex(i, len - 1));
  };

  return (
    <PrototypeCardStack
      items={opportunities}
      ariaLabel="Recall opportunities"
      collapsedLabel="Show all recall suggestions"
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

        // Only the generative kinds are held: the guard in startDraftNote is what
        // actually prevents the duplicate, this is the visible half. Cards that just
        // navigate stay live so an in-flight create doesn't freeze the whole deck.
        const busy = creatingNote && recallKindCreatesNote(op.kind);
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
              disabled={busy}
              aria-busy={busy || undefined}
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
