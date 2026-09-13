/**
 * Settings › Sharing — everything you have put out there, in one list.
 *
 * Sharing happens four ways that do not look alike from the inside: a public link on a note, a
 * note added to a shared space, the shared spaces themselves, and what you have offered to
 * Discover. Each used to be answerable only from where it was done, so "what have I shared" had no
 * single place to ask it. This is that place: one list, newest first, narrowed by kind, and each
 * row carrying the one or two things you can do about it.
 *
 * The merge itself is `sharing-items.ts`, pure and tested; this file fetches, renders and wires
 * the actions.
 */
import { useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon, { type IconName } from '@/components/react/Icon';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toast } from '@/utils/toast';
import { useShareNote } from '../../../hooks/mutations/useShareNote';
import { mySharingQueryKey, useMySharing, type SharedNoteItem } from '../../../hooks/queries/useMySharing';
import { useMySharedSpaces } from '../../../hooks/queries/useMySharedSpaces';
import {
  mySharedSpaceNotesQueryKey,
  useMySharedSpaceNotes,
} from '../../../hooks/queries/useMySharedSpaceNotes';
import { useMyDiscoverSubmissions } from '../../../hooks/queries/useDiscoverListings';
import { useWithdrawDiscoverSubmission } from '../../../hooks/mutations/useDiscoverMutations';
import {
  normalizeAssociationSpaceId,
  useRemoveNoteFromSpace,
} from '../../../hooks/mutations/useSpaceNoteAssociation';
import { useLeaveSpace } from '../../../hooks/mutations/useLeaveSpace';
import { useSwitchToSpace } from '../../../hooks/useSwitchToSpace';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { SettingsGroup, SettingsShell } from './SettingsShell';
import ProtoChipBar from '../components/ProtoChipBar';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import { noteParamSlug } from '../proto-route-slugs';
import { useDeletedSpaces, type DeletedSpaceItem } from '../../../hooks/queries/useDeletedSpaces';
import { useRestoreSpace } from '../../../hooks/mutations/useRestoreSpace';
import { APIError } from '../../../lib/api';
import ProtoSpaceMenuIcon from '../ProtoSpaceMenuIcon';
import {
  buildSharingItems,
  discoverActionFor,
  filterSharingItems,
  sharingEmptyCopy,
  sharingItemMeta,
  SHARING_FILTERS,
  type SharingFilter,
  type SharingItem,
} from './sharing-items';

type SharedItemKind = 'note' | 'thread' | 'space' | 'discover';

/** Leading icon tile for shared-item cards — matches Settings > Add-ons rows. */
export function resolveSharedItemLeadingMeta(kind: SharedItemKind): {
  icon: IconName;
  label: string;
} {
  switch (kind) {
    case 'thread':
      return { icon: 'layer-group', label: 'Thread' };
    case 'space':
      return { icon: 'user-group', label: 'Space' };
    case 'discover':
      return { icon: 'globe', label: 'Discover' };
    case 'note':
    default:
      return { icon: 'note-sticky', label: 'Note' };
  }
}

/**
 * The glyph a Discover submission wears — the kind's own, as Discover draws it, so a Thread you
 * offered looks like a Thread here too.
 */
const DISCOVER_KIND_ICON: Record<string, IconName> = {
  template: 'list-check',
  note: 'note-sticky',
  pack: 'arrow-right-arrow-left',
  resource: 'newspaper',
};

/** Share links in settings omit the protocol prefix. */
function displayShareUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

const RECOVERY_DAY_MS = 24 * 60 * 60 * 1000;

export function deletedSpaceDaysRemaining(recoveryUntil: string, now = Date.now()): number {
  const recoveryTime = new Date(recoveryUntil).getTime();
  if (!Number.isFinite(recoveryTime)) return 0;
  return Math.max(0, Math.ceil((recoveryTime - now) / RECOVERY_DAY_MS));
}

export function deletedSpacesSectionState(input: {
  isLoading: boolean;
  isError: boolean;
  rowCount: number;
}): 'loading' | 'error' | 'hidden' | 'rows' {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.rowCount > 0 ? 'rows' : 'hidden';
}

function deletedSpaceRecoveryLabel(space: DeletedSpaceItem): string {
  const days = deletedSpaceDaysRemaining(space.recoveryUntil);
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(space.recoveryUntil),
  );
  const daysLabel = `${days} day${days === 1 ? '' : 's'} left`;
  return `Recoverable until ${date} · ${daysLabel}`;
}

async function copyToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    toast.error('Could not copy link');
    return false;
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof APIError ? err.message : err instanceof Error ? err.message : fallback;
}

/** A pending destructive action that needs a second press, anchored to the button that asked. */
type PendingConfirm =
  | { kind: 'leave'; item: Extract<SharingItem, { kind: 'space' }>; anchorRect: DOMRect }
  | { kind: 'remove'; item: Extract<SharingItem, { kind: 'space-note' }>; anchorRect: DOMRect };

export default function PrototypeSharingPage() {
  const [filter, setFilter] = useState<SharingFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRefreshId, setConfirmRefreshId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const sharingQuery = useMySharing();
  const spacesQuery = useMySharedSpaces();
  const spaceNotesQuery = useMySharedSpaceNotes();
  const discoverQuery = useMyDiscoverSubmissions();
  const deletedSpacesQuery = useDeletedSpaces();

  const shareNote = useShareNote();
  const withdraw = useWithdrawDiscoverSubmission();
  const removeNoteFromSpace = useRemoveNoteFromSpace();
  const leaveSpace = useLeaveSpace();
  const restoreSpace = useRestoreSpace();
  const switchToSpace = useSwitchToSpace();
  const { activeSpaceId, setActiveSpaceId } = useProtoShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const items = useMemo(
    () =>
      buildSharingItems({
        links: sharingQuery.data?.notes ?? [],
        spaces: spacesQuery.data ?? { owned: [], memberOf: [] },
        spaceNotes: spaceNotesQuery.data?.notes ?? [],
        discover: discoverQuery.data?.listings ?? [],
      }),
    [sharingQuery.data, spacesQuery.data, spaceNotesQuery.data, discoverQuery.data],
  );
  const visible = useMemo(() => filterSharingItems(items, filter), [items, filter]);

  /*
   * Four sources, each allowed to fail on its own. The list renders whatever has arrived rather
   * than waiting on the slowest, and says which part is missing rather than blanking the page
   * over one failed request.
   */
  const sources = [
    { label: 'public links', query: sharingQuery },
    { label: 'shared spaces', query: spacesQuery },
    { label: 'notes in shared spaces', query: spaceNotesQuery },
    { label: 'Discover', query: discoverQuery },
  ];
  const anyLoaded = sources.some((source) => source.query.data);
  const loading = !anyLoaded && sources.some((source) => source.query.isLoading);
  const failed = sources.filter((source) => source.query.isError);

  const deletedSpaces = deletedSpacesQuery.data?.spaces ?? [];
  const deletedSectionState = deletedSpacesSectionState({
    isLoading: deletedSpacesQuery.isLoading,
    isError: Boolean(deletedSpacesQuery.error),
    rowCount: deletedSpaces.length,
  });

  const flashCopied = (id: string) => {
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 1400);
  };

  const handleDisableNote = async (itemId: string, note: SharedNoteItem) => {
    setBusyId(itemId);
    try {
      await shareNote.mutateAsync({ noteId: note.id, action: 'disable' });
      await queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
      toast.success('Note is now private');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not stop sharing'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRefreshNote = async (itemId: string, note: SharedNoteItem) => {
    setBusyId(itemId);
    try {
      await shareNote.mutateAsync({ noteId: note.id, action: 'refresh' });
      await queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
      setConfirmRefreshId(null);
      toast.success('New share link created');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create a new link'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (itemId: string, url: string) => {
    if (await copyToClipboard(url)) flashCopied(itemId);
  };

  const handleOpenSpace = (spaceId: string) => {
    switchToSpace(spaceId);
    void navigate({ to: prototypeHomeRouteTo() });
  };

  const handleWithdraw = (itemId: string, listingId: string, stopping: boolean) => {
    setBusyId(itemId);
    withdraw.mutate(listingId, {
      onSuccess: () => toast.success(stopping ? 'No longer shared in Discover' : 'Taken back'),
      onError: (err) => toast.error(errorMessage(err, 'Could not take that back')),
      onSettled: () => setBusyId(null),
    });
  };

  const askToConfirm = (event: MouseEvent<HTMLButtonElement>, next: Omit<PendingConfirm, 'anchorRect'>) => {
    setPendingConfirm({ ...next, anchorRect: event.currentTarget.getBoundingClientRect() } as PendingConfirm);
  };

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'leave') {
      const { space } = pendingConfirm.item;
      leaveSpace.mutate(
        { spaceId: space.id },
        {
          onSuccess: () => {
            setPendingConfirm(null);
            /* Leaving the room you are standing in puts you back in My Home, the way the
               People sheet's Leave does. */
            if (
              activeSpaceId &&
              normalizeAssociationSpaceId(activeSpaceId) === normalizeAssociationSpaceId(space.id)
            ) {
              setActiveSpaceId(null);
            }
            toast.success(`Left ${space.title}`);
          },
          onError: (err) => toast.error(errorMessage(err, 'Could not leave this space')),
        },
      );
      return;
    }
    const { spaceNote } = pendingConfirm.item;
    removeNoteFromSpace.mutate(
      { spaceId: spaceNote.spaceId, noteId: spaceNote.noteId },
      {
        onSuccess: () => {
          setPendingConfirm(null);
          void queryClient.invalidateQueries({ queryKey: mySharedSpaceNotesQueryKey });
          toast.success(`Removed from ${spaceNote.spaceTitle}`);
        },
        onError: (err) => toast.error(errorMessage(err, 'Could not remove it from the space')),
      },
    );
  };

  const handleRestoreSpace = async (space: DeletedSpaceItem) => {
    try {
      await restoreSpace.mutateAsync(space.id);
      toast.success(`Restored ${space.title}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not restore space'));
    }
  };

  const relative = (iso: string | null) => protoRelativeCaptionAbbrev(iso) || null;

  const renderLeading = (item: SharingItem) => {
    if (item.kind === 'space') {
      return (
        <span className="proto-settings-list-row__leading proto-sharing-deleted__space-icon" aria-hidden>
          <ProtoSpaceMenuIcon color={item.space.color || 'paper'} size={40} radius={10} glyphSize={18} />
        </span>
      );
    }
    const meta =
      item.kind === 'discover'
        ? {
            icon: DISCOVER_KIND_ICON[item.submission.kind] ?? resolveSharedItemLeadingMeta('discover').icon,
            label: 'Discover',
          }
        : resolveSharedItemLeadingMeta('note');
    return (
      <span className="proto-settings-list-row__leading" aria-label={meta.label} title={meta.label}>
        <Icon name={meta.icon} size={18} />
      </span>
    );
  };

  const renderTitle = (item: SharingItem) => {
    const noteId =
      item.kind === 'link' ? item.note.id : item.kind === 'space-note' ? item.spaceNote.noteId : null;
    if (noteId) {
      return (
        <Link
          to={prototypeNoteRouteTo()}
          params={{ noteId: noteParamSlug(noteId) }}
          search={{}}
          className="proto-sharing-card__title pds-list-title"
        >
          {item.title}
        </Link>
      );
    }
    return <span className="proto-sharing-card__title pds-list-title">{item.title}</span>;
  };

  const renderActions = (item: SharingItem) => {
    const isBusy = busyId === item.id;
    switch (item.kind) {
      case 'link': {
        const { note } = item;
        if (confirmRefreshId === item.id) {
          return (
            <>
              <span className="proto-sharing-card__confirm-prompt">
                Replace this link? The old one stops working.
              </span>
              <button
                type="button"
                className="proto-sharing-card__text-action"
                disabled={isBusy}
                onClick={() => setConfirmRefreshId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="proto-sharing-card__text-action proto-sharing-card__text-action--accent"
                disabled={isBusy}
                onClick={() => void handleRefreshNote(item.id, note)}
              >
                {isBusy ? 'Working…' : 'Replace'}
              </button>
            </>
          );
        }
        return (
          <>
            <button
              type="button"
              className="proto-sharing-card__text-action"
              disabled={isBusy}
              onClick={() => setConfirmRefreshId(item.id)}
            >
              New link
            </button>
            <button
              type="button"
              className="proto-sharing-card__text-action proto-sharing-card__text-action--danger"
              disabled={isBusy}
              onClick={() => void handleDisableNote(item.id, note)}
            >
              {isBusy ? 'Working…' : 'Stop sharing'}
            </button>
            <button
              type="button"
              className="proto-thread-review__dismiss"
              disabled={isBusy}
              onClick={() => void handleCopy(item.id, note.shareUrl)}
              title={displayShareUrl(note.shareUrl)}
              aria-label={copiedId === item.id ? 'Copied' : 'Copy link'}
            >
              {copiedId === item.id ? 'Copied' : 'Copy'}
            </button>
          </>
        );
      }
      case 'space': {
        const { space } = item;
        return (
          <>
            {/* An owner cannot leave — the server refuses it — so Leave is a member's verb, and
                the owner's is sharing the invite. */}
            {item.role === 'member' ? (
              <button
                type="button"
                className="proto-sharing-card__text-action proto-sharing-card__text-action--danger"
                disabled={leaveSpace.isPending}
                onClick={(event) => askToConfirm(event, { kind: 'leave', item })}
              >
                Leave
              </button>
            ) : space.shareUrl ? (
              <button
                type="button"
                className="proto-sharing-card__text-action"
                onClick={() => void handleCopy(item.id, space.shareUrl!)}
                title={displayShareUrl(space.shareUrl)}
              >
                {copiedId === item.id ? 'Copied' : 'Copy invite link'}
              </button>
            ) : null}
            <button
              type="button"
              className="proto-thread-review__dismiss"
              onClick={() => handleOpenSpace(space.id)}
            >
              Open
            </button>
          </>
        );
      }
      case 'space-note':
        return (
          <button
            type="button"
            className="proto-sharing-card__text-action proto-sharing-card__text-action--danger"
            disabled={removeNoteFromSpace.isPending}
            onClick={(event) => askToConfirm(event, { kind: 'remove', item })}
          >
            Remove from space
          </button>
        );
      case 'discover': {
        const { submission } = item;
        const action = discoverActionFor(submission.status);
        return (
          <>
            {submission.status === 'listed' && submission.slug ? (
              <a
                className="proto-sharing-card__text-action"
                href={`/discover/${submission.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
            ) : null}
            {action ? (
              <button
                type="button"
                className="proto-sharing-card__text-action proto-sharing-card__text-action--danger"
                disabled={isBusy}
                onClick={() => handleWithdraw(item.id, submission.id, action === 'stop')}
              >
                {isBusy ? 'Working…' : action === 'stop' ? 'Stop sharing' : 'Withdraw'}
              </button>
            ) : null}
          </>
        );
      }
    }
  };

  const confirmCopy =
    pendingConfirm?.kind === 'leave'
      ? {
          /* The People sheet's own words for leaving, so the two doors say the same thing. */
          title: 'Leave this space?',
          description: 'Your notes stay in My Home.',
          confirmLabel: 'Leave',
          busy: leaveSpace.isPending,
        }
      : pendingConfirm?.kind === 'remove'
        ? {
            title: `Remove from ${pendingConfirm.item.spaceNote.spaceTitle}?`,
            description: 'The note stays in My Home. People in the space stop seeing it.',
            confirmLabel: 'Remove',
            busy: removeNoteFromSpace.isPending,
          }
        : null;

  return (
    <SettingsShell wide>
      <ProtoChipBar
        ariaLabel="Which sharing to show"
        options={SHARING_FILTERS}
        selectedId={filter}
        onSelect={setFilter}
      />

      {loading ? (
        <p className="pds-caption" style={{ marginTop: 20, color: 'var(--pds-text-secondary)' }}>Loading…</p>
      ) : null}

      {failed.length > 0 ? (
        <div className="proto-sharing-deleted__status" role="alert">
          <span className="pds-caption">
            Could not load {failed.map((source) => source.label).join(', ')}.
          </span>
          <button
            type="button"
            className="proto-thread-review__dismiss"
            onClick={() => failed.forEach((source) => void source.query.refetch())}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && visible.length === 0 ? (
        <p className="pds-caption" style={{ marginTop: 20, color: 'var(--pds-text-secondary)' }}>
          {sharingEmptyCopy(filter)}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <SettingsGroup>
          <div className="proto-sharing-list">
            {visible.map((item) => {
              const meta = sharingItemMeta(item, relative);
              return (
                <div key={item.id} className="proto-sharing-card">
                  {renderLeading(item)}

                  <div className="proto-sharing-card__main">
                    {renderTitle(item)}
                    {meta.length > 0 ? (
                      <span className="pds-list-preview proto-sharing-card__meta">{meta.join(' · ')}</span>
                    ) : null}
                    {/* A decline carries a reason, and the person who asked is the one who needs
                        to read it. */}
                    {item.kind === 'discover' && item.submission.status === 'declined' && item.submission.reviewNote ? (
                      <span className="pds-list-preview proto-sharing-card__meta">{item.submission.reviewNote}</span>
                    ) : null}
                  </div>

                  <span className="proto-sharing-card__actions">{renderActions(item)}</span>
                </div>
              );
            })}
          </div>
        </SettingsGroup>
      ) : null}

      {pendingConfirm && confirmCopy ? (
        <ProtoConfirmDialog
          anchorRect={pendingConfirm.anchorRect}
          alignRight
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          cancelLabel="Keep"
          busy={confirmCopy.busy}
          onConfirm={confirmPending}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}

      {deletedSectionState !== 'hidden' ? (
        <section className="proto-sharing-deleted" aria-labelledby="proto-sharing-deleted-title">
          <h2 id="proto-sharing-deleted-title" className="pds-inspector-label proto-sharing-deleted__title">
            Recently deleted spaces
          </h2>

          {deletedSectionState === 'loading' ? (
            <p className="pds-caption proto-sharing-deleted__status" role="status">
              Loading recently deleted spaces…
            </p>
          ) : null}

          {deletedSectionState === 'error' ? (
            <div className="proto-sharing-deleted__status" role="alert">
              <span className="pds-caption">Could not load recently deleted spaces.</span>
              <button
                type="button"
                className="proto-thread-review__dismiss"
                onClick={() => void deletedSpacesQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {deletedSectionState === 'rows' ? (
            <SettingsGroup>
              <div className="proto-sharing-deleted__list">
                {deletedSpaces.map((space) => {
                  const isRestoring = restoreSpace.isPending && restoreSpace.variables === space.id;
                  return (
                    <div key={space.id} className="proto-sharing-deleted__row">
                      <span
                        className="proto-settings-list-row__leading proto-sharing-deleted__space-icon"
                        aria-hidden
                      >
                        <ProtoSpaceMenuIcon
                          color={space.color || 'paper'}
                          size={40}
                          radius={10}
                          glyphSize={18}
                        />
                      </span>
                      <span className="proto-sharing-deleted__main">
                        <span className="pds-list-title">{space.title}</span>
                        <span className="pds-list-preview">{deletedSpaceRecoveryLabel(space)}</span>
                      </span>
                      <button
                        type="button"
                        className="proto-thread-review__dismiss"
                        disabled={restoreSpace.isPending}
                        onClick={() => void handleRestoreSpace(space)}
                      >
                        {isRestoring ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </SettingsGroup>
          ) : null}
        </section>
      ) : null}
    </SettingsShell>
  );
}
