/**
 * The review for a grouping Home noticed — "these eight notes keep returning to Romans".
 *
 * It used to be written inline in `PrototypeSidebar`, which is why Activity could not offer
 * the three recall kinds whose whole purpose is to open one: the proposal state has always
 * been the shell's, but the only thing that could *render* it was the sidebar, so a card set
 * there would have landed nowhere. Lifting it here is what lets both surfaces raise the same
 * review — the sidebar in place of its list, Activity above the day.
 *
 * Accepting star-connects the notes: every other note becomes a child of the first, forming
 * one connected component with the first as the highest-degree node, which is what makes it
 * the representative the cluster is titled through.
 *
 * Note rows arrive through `resolveNoteRow` rather than being built here. A proposal carries
 * only ids and titles, and each surface already knows how to turn one into a full row from
 * what it has loaded — the sidebar merges in cached content, the day sheet looks it up in the
 * list it is already showing.
 *
 * Home's suggestions raise it as a `sheet` — a centred dialog, or a drawer on a phone. Inline at
 * the top of the day sheet it landed above wherever the reader happened to be scrolled, so the
 * card they had just pressed appeared to do nothing.
 */
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { useProtoShell, type ThreadProposal } from '../../layouts/proto-shell-context';
import { PrototypeSidebarNoteRow } from './sidebar-rows';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import '../../styles/prototype-thread-proposal-sheet.css';

/** What the review says beneath the subject, by the kind of thing that proposed it. */
export function threadProposalSubtitle(proposal: ThreadProposal): string {
  const n = proposal.notes.length;
  switch (proposal.variant) {
    case 'arc':
      return `${n} ${n === 1 ? 'note' : 'notes'} · on your mind`;
    case 'crossref':
      return `${n} ${n === 1 ? 'note connects' : 'notes connect'} these passages`;
    default:
      return `${n} ${n === 1 ? 'note shares' : 'notes share'} this theme`;
  }
}

type ThreadProposalReviewProps = {
  homeSpaceId: string | null | undefined;
  /**
   * `panel` fills a rail and pins its actions to the bottom of it; `inline` is one block in
   * a scrolling page; `sheet` raises it over the page — a centred dialog, or a drawer where
   * the shell presents sheets. The difference is real layout, not decoration — see the CSS.
   */
  variant?: 'panel' | 'inline' | 'sheet';
  /** Whether this viewer may create collections here — a shared space can say no. */
  canCreate: boolean;
  activeNoteFullId?: string;
  resolveNoteRow: (brief: { id: string; title: string | null }) => SpaceNoteRow;
  prefetchNote: (row: SpaceNoteRow) => void;
  onOpenNote: (row: SpaceNoteRow) => void;
  /** "Not now" — the surface decides what it returns to. */
  onDismiss: () => void;
  /** The Thread exists. `repNoteId` is the cluster's representative note. */
  onCreated: (repNoteId: string) => void;
};

export default function PrototypeThreadProposalReview({
  variant = 'panel',
  ...props
}: ThreadProposalReviewProps) {
  const { sidebarThreadProposal: proposal } = useProtoShell();
  if (variant === 'sheet') return <ThreadProposalSheet proposal={proposal} {...props} />;
  if (!proposal) return null;
  return <ThreadProposalBody proposal={proposal} variant={variant} {...props} />;
}

/**
 * The review raised over the page.
 *
 * Open whenever the shell holds a proposal, so every surface that sets one gets the same
 * dialog without wiring an open flag of its own. The proposal it shows is held through the
 * exit: the shell clears it the moment "Not now" is pressed, and a card that emptied as it
 * faded would read as a glitch rather than a close.
 */
function ThreadProposalSheet({
  proposal,
  onDismiss,
  ...props
}: Omit<ThreadProposalReviewProps, 'variant'> & { proposal: ThreadProposal | undefined }) {
  const open = Boolean(proposal);
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const [shown, setShown] = useState(proposal);
  if (proposal && proposal !== shown) setShown(proposal);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopoverPortal = !asSheet && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.12,
      fallbackWidth: 360,
      fallbackHeight: 420,
    },
    [shown?.notes.length],
  );

  useDismissOnOutside(cardRef, onDismiss, open && !asSheet);

  if (!shown) return null;
  const body = <ThreadProposalBody proposal={shown} variant="sheet" onDismiss={onDismiss} {...props} />;

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={onDismiss}
          aria-label="Close suggested Thread"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={`Suggested Thread: ${shown.subject}`}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-thread-proposal-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          {body}
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open || !asSheet) return null;

  return (
    <Drawer.Root open={open} onOpenChange={(next) => (next ? undefined : onDismiss())}>
      <DrawerContent
        onOverlayClick={onDismiss}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-thread-proposal-sheet"
        aria-label={`Suggested Thread: ${shown.subject}`}
      >
        {body}
      </DrawerContent>
    </Drawer.Root>
  );
}

function ThreadProposalBody({
  proposal,
  homeSpaceId,
  variant,
  canCreate,
  activeNoteFullId,
  resolveNoteRow,
  prefetchNote,
  onOpenNote,
  onDismiss,
  onCreated,
}: Omit<ThreadProposalReviewProps, 'variant'> & {
  proposal: ThreadProposal;
  variant: 'panel' | 'inline' | 'sheet';
}) {
  const connectNoteMutation = useConnectNote();
  const updateThreadTitleMutation = useUpdateStudyThreadTitle();
  const [isAccepting, setIsAccepting] = useState(false);
  const accept = useCallback(async () => {
    if (!canCreate || !homeSpaceId) return;
    const [first, ...rest] = proposal.notes.map((n) => n.id);
    if (!first) return;
    setIsAccepting(true);
    try {
      for (const linkedNoteId of rest) {
        await connectNoteMutation.mutateAsync({
          parentNoteId: first,
          linkedNoteId,
          spaceId: homeSpaceId,
        });
      }
      /* Name the cluster after the theme — the representative note carries the title. */
      await updateThreadTitleMutation.mutateAsync({
        repNoteId: first,
        spaceId: homeSpaceId,
        title: proposal.subject,
        userOverride: true,
      });
      try {
        window.toast?.success('Thread created');
      } catch {
        /* ignore */
      }
      onCreated(first);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create Thread';
      try {
        window.toast?.error(msg);
      } catch {
        /* ignore */
      }
    } finally {
      setIsAccepting(false);
    }
  }, [
    canCreate,
    homeSpaceId,
    proposal,
    connectNoteMutation,
    updateThreadTitleMutation,
    onCreated,
  ]);

  return (
    <div
      className={`proto-thread-review${variant === 'panel' ? '' : ` proto-thread-review--${variant}`}`}
    >
      <div className="proto-thread-review__header">
        <span className="proto-home-card__icon-orb" aria-hidden>
          <Icon name="arrow-right-arrow-left" size={13} />
        </span>
        <div>
          <div className="proto-thread-review__title-row">
            <p className="proto-thread-review__title">{proposal.subject}</p>
            <span className="proto-thread-review__badge">Suggested</span>
          </div>
          <p className="proto-thread-review__subtitle">{threadProposalSubtitle(proposal)}</p>
        </div>
      </div>
      <ul className="proto-note-list proto-thread-review__list">
        {proposal.notes.map((note) => {
          const row = resolveNoteRow({ id: note.id, title: note.title });
          return (
            <PrototypeSidebarNoteRow
              key={note.id}
              row={row}
              active={Boolean(activeNoteFullId && note.id === activeNoteFullId)}
              homeSpaceId={homeSpaceId ?? ''}
              activeNoteFullId={activeNoteFullId}
              prefetchNote={prefetchNote}
              hideMenu
              onOpenNote={onOpenNote}
            />
          );
        })}
      </ul>
      <div className="proto-thread-review__actions">
        <button
          type="button"
          className="proto-thread-review__dismiss"
          onClick={onDismiss}
          disabled={isAccepting}
        >
          Not now
        </button>
        {canCreate ? (
          <button
            type="button"
            className="proto-thread-review__btn proto-thread-review__btn--primary"
            onClick={accept}
            disabled={isAccepting}
          >
            {isAccepting ? 'Creating…' : 'Create Thread'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { threadClusterDrillSlug };
