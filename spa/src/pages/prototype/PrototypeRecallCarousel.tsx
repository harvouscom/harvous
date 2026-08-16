import { useEffect, useRef } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import type { RecallCandidate } from '@/utils/prototype-home-trends';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
import { recordRecallOpportunityEvent } from './proto-recall-events';
import { recordRecallSectionEngaged } from './proto-recall-cooldown';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { buildRecallCardStackOrigin } from './paper-stack-origins';

/**
 * The recall opportunities on the prototype Home — a fading meaningful note, a highlight, a
 * theme taking shape, a passage you return to — as rows of the Suggested group.
 *
 * This was a swipeable stack: one card on top, the rest fanned behind it, a pager to move
 * between them. It is flat now, one row per opportunity, because a group on Home is one
 * panel of hairline rows and a stack of cards inside a panel of rows is two furniture
 * systems in one column. What was gained by the stack — a single quiet card instead of a
 * list — is worth less than being able to see all of them at once, which is what a
 * suggestions shelf is for. Selection and ordering are still done upstream by
 * selectRecallOpportunities; this is presentational.
 *
 * Every row records an impression once it is on screen (they all are, now), and each keeps
 * its own "Not now" — snoozing is how the deck gets trained, so it must never be more than
 * one tap away.
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
  const { stackNote } = useProtoShell();
  const seenImpressionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const op of opportunities) {
      if (seenImpressionsRef.current.has(op.id)) continue;
      seenImpressionsRef.current.add(op.id);
      recordRecallOpportunityEvent({
        opportunityId: op.id,
        kind: op.kind,
        action: 'impression',
        noteId: op.noteId,
      });
    }
  }, [opportunities]);

  if (opportunities.length === 0) return null;

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
    /**
     * When the card opens a note, that note stacks over the card: the edge above it says why
     * it is open, and flipping it down brings the card back. Only for kinds that open an
     * existing note — generative kinds create a draft, and sidebar-layer kinds put nothing over
     * anything — see `buildRecallCardStackOrigin`.
     *
     * The stack is set here, at the one place every card passes through, rather than in each
     * of the dozen `onOpen` closures. `op.noteId` is not passed along: for highlight kinds it is
     * the highlight row id, and the layout adopts the note id from wherever the open lands.
     */
    const origin = buildRecallCardStackOrigin(op);
    if (origin) stackNote(origin);
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
  };

  return (
    <>
      {opportunities.map((op) => (
        <PrototypeHomeRow
          key={op.id}
          icon={op.iconName}
          title={op.title}
          meta={[op.eyebrow, op.meta]}
          onClick={() => openOpportunity(op)}
          trailing={
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`Not now — remind me later about ${op.title}`}
              title="Not now"
              onClick={() => snoozeOpportunity(op)}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          }
        />
      ))}
    </>
  );
}
