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
 */
import { useCallback, useState } from 'react';
import Icon from '@/components/react/Icon';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { useProtoShell, type ThreadProposal } from '../../layouts/proto-shell-context';
import { PrototypeSidebarNoteRow } from './sidebar-rows';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

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

export default function PrototypeThreadProposalReview({
  homeSpaceId,
  variant = 'panel',
  canCreate,
  activeNoteFullId,
  resolveNoteRow,
  prefetchNote,
  onOpenNote,
  onDismiss,
  onCreated,
}: {
  homeSpaceId: string | null | undefined;
  /**
   * `panel` fills a rail and pins its actions to the bottom of it; `inline` is one block in
   * a scrolling page. The difference is real layout, not decoration — see the CSS.
   */
  variant?: 'panel' | 'inline';
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
}) {
  const { sidebarThreadProposal: proposal } = useProtoShell();
  const connectNoteMutation = useConnectNote();
  const updateThreadTitleMutation = useUpdateStudyThreadTitle();
  const [isAccepting, setIsAccepting] = useState(false);

  const accept = useCallback(async () => {
    if (!canCreate || !homeSpaceId || !proposal) return;
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

  if (!proposal) return null;

  return (
    <div
      className={`proto-thread-review${variant === 'inline' ? ' proto-thread-review--inline' : ''}`}
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
