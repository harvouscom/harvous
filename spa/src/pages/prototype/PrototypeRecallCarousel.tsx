import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Icon, { type IconName } from '@/components/react/Icon';
import { getNoteQueryOptions } from '../../hooks/queries/useNote';
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
  /**
   * A note this row will actually open, warmed on hover.
   *
   * Deliberately separate from `noteId`: for highlight kinds that field holds the highlight
   * row's id, not a note's, so prefetching it would ask the notes endpoint for something
   * that was never a note. Only set this where the id is a note the row navigates to.
   */
  prefetchNoteId?: string;
  /** Dominant canon section for revisit diversity tracking. */
  canonSection?: string;
  /**
   * Open the underlying note / highlight / passage / thread.
   *
   * Returns `false` when it could not — a highlight with no source note, a draft with no
   * space to save into. Anything else counts as having gone somewhere. The shelf needs to
   * know, because the breadcrumb edge is only honest over a page you actually landed on.
   */
  onOpen: () => boolean | void;
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
  const queryClient = useQueryClient();
  const seenImpressionsRef = useRef<Set<string>>(new Set());

  /**
   * Warm the note a row will open, so opening it does not start with an empty frame.
   *
   * Opening a recall card was the one way into a note with nothing cached behind it: the
   * note list prefetches on hover, but these rows never did, so the note page hit its
   * 250ms loading grace and showed a framed, empty pane before the stack edge and the note
   * arrived — the "in-between state" this fixes. Same freshness guard the sidebar uses, so
   * running the pointer down the shelf cannot turn into a refetch storm.
   */
  const prefetchOpportunityNote = useCallback(
    (noteId: string | undefined) => {
      if (!noteId) return;
      const options = getNoteQueryOptions(noteId);
      const cached = queryClient.getQueryData(options.queryKey) as
        | { __contentIsPreview?: boolean }
        | undefined;
      const state = queryClient.getQueryState(options.queryKey);
      const isFresh = state ? Date.now() - state.dataUpdatedAt < 30_000 : false;
      if (cached && cached.__contentIsPreview === false && isFresh) return;
      void queryClient.prefetchQuery(options).catch(() => {});
    },
    [queryClient],
  );

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
     * Whatever the row opened, it stacks over the row: the edge above it says why the page is
     * open, flipping it down brings you back to the shelf, and its actions answer the
     * suggestion. Sidebar-layer kinds get no origin — see `buildRecallCardStackOrigin`.
     *
     * Set here, at the one place every row passes through, rather than in each of the dozen
     * `onOpen` closures. `op.noteId` is not passed along: for highlight kinds it is the
     * highlight row id, and the layout adopts the note id from wherever the open lands.
     *
     * After `onOpen`, and only if it went somewhere. Stacking first left an edge standing
     * over Home whenever a handler bailed — a highlight whose source note is gone opens
     * nothing, and the breadcrumb pointed back at the page you never left.
     */
    const opened = op.onOpen();
    if (opened === false) return;
    const origin = buildRecallCardStackOrigin(op);
    if (origin) stackNote(origin);
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
          onMouseEnter={() => prefetchOpportunityNote(op.prefetchNoteId)}
          onFocus={() => prefetchOpportunityNote(op.prefetchNoteId)}
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
