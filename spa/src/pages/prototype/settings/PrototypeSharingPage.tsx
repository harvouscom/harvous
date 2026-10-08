/**
 * Settings › Sharing — everything you have put out there, in one list.
 *
 * Sharing happens four ways that do not look alike from the inside: a public link on a note, a
 * note added to a shared space, the shared spaces themselves, and what you have offered to
 * Discover. Each used to be answerable only from where it was done, so "what have I shared" had no
 * single place to ask it. This is that place: one list, newest first, narrowed by kind.
 *
 * Each row is a title, one line saying what it is, and one ⋮. Tapping the row opens the thing;
 * everything you can do about it is in the menu. Rows used to carry their actions inline — 11px
 * text links beside 36px pills, up to three per row, with a confirm that took over the row — and
 * that, more than the number of rows, is what made the page busy.
 *
 * The merge itself is `sharing-items.ts`, pure and tested; this file fetches, renders and wires
 * the actions.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import PrototypeSidebarRowMenuPopover from '../PrototypeSidebarRowMenuPopover';
import {
  buildSharingItems,
  discoverActionFor,
  filterSharingItems,
  sharingEmptyCopy,
  sharingItemMeta,
  sharingKindsPresent,
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

/** A destructive or replacing action that needs a second press, anchored to the row that asked. */
type PendingConfirm =
  | { kind: 'refresh'; item: Extract<SharingItem, { kind: 'link' }>; anchorRect: DOMRect }
  | { kind: 'leave'; item: Extract<SharingItem, { kind: 'space' }>; anchorRect: DOMRect }
  | { kind: 'remove'; item: Extract<SharingItem, { kind: 'space-note' }>; anchorRect: DOMRect };

/** One entry in a row's ⋮ menu. */
type SharingMenuAction = {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  /** The row's own rect, for actions that open a confirm anchored to it. */
  onSelect: (rowRect: DOMRect) => void;
};

/**
 * One row: tile, title, one line of meta, one ⋮.
 *
 * Its own component because the menu needs refs — the row it hangs from and the trigger that
 * must not count as "outside" — and those are per row.
 */
function SharingRow({
  item,
  leading,
  meta,
  note,
  busy,
  onOpen,
  actions,
}: {
  item: SharingItem;
  leading: ReactNode;
  meta: string;
  /** A second line only a declined Discover offer carries: the reason, for the person who asked. */
  note?: string | null;
  busy: boolean;
  onOpen: (() => void) | null;
  actions: SharingMenuAction[];
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const triggerRootRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const text = (
    <>
      <span className="proto-sharing-card__title pds-list-title">{item.title}</span>
      <span className="pds-list-preview proto-sharing-card__meta">{busy ? 'Working…' : meta}</span>
      {note ? <span className="pds-list-preview proto-sharing-card__meta">{note}</span> : null}
    </>
  );

  return (
    <div ref={rowRef} className="proto-sharing-card">
      {leading}
      {onOpen ? (
        <button type="button" className="proto-sharing-card__main" onClick={onOpen}>
          {text}
        </button>
      ) : (
        <div className="proto-sharing-card__main">{text}</div>
      )}
      {actions.length > 0 ? (
        <span ref={triggerRootRef} className="proto-sharing-card__more">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            aria-label={`More for ${item.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="ellipsis-vertical" size={12} aria-hidden />
          </button>
          <PrototypeSidebarRowMenuPopover
            open={menuOpen}
            rowRef={rowRef}
            triggerRootRef={triggerRootRef}
            onDismiss={() => setMenuOpen(false)}
            aria-label={`More for ${item.title}`}
            zIndex="var(--pds-z-modal-popover)"
          >
            <div className="proto-menu-section" role="group">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  className={`proto-menu-item${action.destructive ? ' proto-menu-item--destructive' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = rowRef.current?.getBoundingClientRect() ?? new DOMRect();
                    setMenuOpen(false);
                    action.onSelect(rect);
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name={action.icon} size={14} />
                  </span>
                  <span className="proto-menu-item__label">{action.label}</span>
                </button>
              ))}
            </div>
          </PrototypeSidebarRowMenuPopover>
        </span>
      ) : null}
    </div>
  );
}

export default function PrototypeSharingPage() {
  const [filter, setFilter] = useState<SharingFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [deletedOpen, setDeletedOpen] = useState(false);

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
  /* With one kind on the page there is nothing to narrow, so a filter left on another kind
     from earlier would only hide the list. */
  const showFilter = sharingKindsPresent(items) > 1;
  const activeFilter = showFilter ? filter : 'all';
  const visible = useMemo(() => filterSharingItems(items, activeFilter), [items, activeFilter]);

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
      setPendingConfirm(null);
      toast.success('New share link created');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create a new link'));
    } finally {
      setBusyId(null);
    }
  };

  /* The row has no Copy button of its own any more, so the confirmation is a toast rather than
     a label flipping to "Copied" on a control that is now inside a closed menu. */
  const handleCopy = async (url: string, what: string) => {
    if (await copyToClipboard(url)) toast.success(`${what} copied`);
  };

  const handleOpenSpace = (spaceId: string) => {
    switchToSpace(spaceId);
    void navigate({ to: prototypeHomeRouteTo() });
  };

  const handleOpenNote = (noteId: string) => {
    void navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(noteId) }, search: {} });
  };

  const handleWithdraw = (itemId: string, listingId: string, stopping: boolean) => {
    setBusyId(itemId);
    withdraw.mutate(listingId, {
      onSuccess: () => toast.success(stopping ? 'No longer shared in Discover' : 'Taken back'),
      onError: (err) => toast.error(errorMessage(err, 'Could not take that back')),
      onSettled: () => setBusyId(null),
    });
  };

  const confirmPending = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'refresh') {
      void handleRefreshNote(pendingConfirm.item.id, pendingConfirm.item.note);
      return;
    }
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
        <span className="proto-settings-list-row__leading proto-settings-list-row__leading--bare" aria-hidden>
          <ProtoSpaceMenuIcon color={item.space.color || 'paper'} size={32} radius={8} glyphSize={15} />
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
        <Icon name={meta.icon} size={15} />
      </span>
    );
  };

  /** What tapping the row does: the thing itself, wherever it lives. Null when there is nowhere to go. */
  const openFor = (item: SharingItem): (() => void) | null => {
    switch (item.kind) {
      case 'link':
        return () => handleOpenNote(item.note.id);
      case 'space-note':
        return () => handleOpenNote(item.spaceNote.noteId);
      case 'space':
        return () => handleOpenSpace(item.space.id);
      case 'discover': {
        const { slug, status } = item.submission;
        return status === 'listed' && slug
          ? () => window.open(`/discover/${slug}`, '_blank', 'noopener,noreferrer')
          : null;
      }
    }
  };

  /** The ⋮ menu: the way in first, then sharing, then the undo — destructive last, as everywhere. */
  const actionsFor = (item: SharingItem): SharingMenuAction[] => {
    switch (item.kind) {
      case 'link': {
        const { note } = item;
        return [
          {
            key: 'copy',
            label: 'Copy link',
            icon: 'copy',
            onSelect: () => void handleCopy(note.shareUrl, 'Link'),
          },
          {
            key: 'refresh',
            label: 'New link',
            icon: 'arrows-rotate',
            onSelect: (anchorRect) => setPendingConfirm({ kind: 'refresh', item, anchorRect }),
          },
          {
            key: 'stop',
            label: 'Stop sharing',
            icon: 'eye-slash',
            destructive: true,
            onSelect: () => void handleDisableNote(item.id, note),
          },
        ];
      }
      case 'space': {
        const { space } = item;
        const actions: SharingMenuAction[] = [
          { key: 'open', label: 'Open space', icon: 'arrow-right', onSelect: () => handleOpenSpace(space.id) },
        ];
        /* An owner cannot leave — the server refuses it — so Leave is a member's verb, and
           the owner's is sharing the invite. */
        if (item.role === 'owner' && space.shareUrl) {
          const url = space.shareUrl;
          actions.push({
            key: 'invite',
            label: 'Copy invite link',
            icon: 'copy',
            onSelect: () => void handleCopy(url, 'Invite link'),
          });
        }
        if (item.role === 'member') {
          actions.push({
            key: 'leave',
            label: 'Leave space',
            icon: 'right-from-bracket',
            destructive: true,
            onSelect: (anchorRect) => setPendingConfirm({ kind: 'leave', item, anchorRect }),
          });
        }
        return actions;
      }
      case 'space-note':
        return [
          {
            key: 'open',
            label: 'Open note',
            icon: 'note-sticky',
            onSelect: () => handleOpenNote(item.spaceNote.noteId),
          },
          {
            key: 'remove',
            label: 'Remove from space',
            icon: 'circle-minus',
            destructive: true,
            onSelect: (anchorRect) => setPendingConfirm({ kind: 'remove', item, anchorRect }),
          },
        ];
      case 'discover': {
        const { submission } = item;
        const actions: SharingMenuAction[] = [];
        if (submission.status === 'listed' && submission.slug) {
          const slug = submission.slug;
          actions.push({
            key: 'view',
            label: 'View in Discover',
            icon: 'arrow-up-right-from-square',
            onSelect: () => window.open(`/discover/${slug}`, '_blank', 'noopener,noreferrer'),
          });
        }
        const action = discoverActionFor(submission.status);
        if (action) {
          actions.push({
            key: action,
            label: action === 'stop' ? 'Stop sharing' : 'Withdraw',
            icon: 'eye-slash',
            destructive: true,
            onSelect: () => handleWithdraw(item.id, submission.id, action === 'stop'),
          });
        }
        return actions;
      }
    }
  };

  const confirmCopy =
    pendingConfirm?.kind === 'refresh'
      ? {
          title: 'Replace this link?',
          description: 'The old one stops working.',
          confirmLabel: 'Replace',
          busy: busyId === pendingConfirm.item.id,
        }
      : pendingConfirm?.kind === 'leave'
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
      {showFilter ? (
        <ProtoChipBar
          ariaLabel="Which sharing to show"
          options={SHARING_FILTERS}
          selectedId={activeFilter}
          onSelect={setFilter}
        />
      ) : null}

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
          {sharingEmptyCopy(activeFilter)}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <SettingsGroup>
          <div className="proto-sharing-list">
            {visible.map((item) => (
              <SharingRow
                key={item.id}
                item={item}
                leading={renderLeading(item)}
                meta={sharingItemMeta(item, relative).join(' · ')}
                note={
                  item.kind === 'discover' && item.submission.status === 'declined'
                    ? item.submission.reviewNote
                    : null
                }
                busy={busyId === item.id}
                onOpen={openFor(item)}
                actions={actionsFor(item)}
              />
            ))}
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

      {/*
        * Recently deleted spaces, folded into one line.
        *
        * It was a second headed section under the list, which gave a page about what you share a
        * standing block about what you deleted. Spaces wait here for days at most, so it is a
        * row you open when you are looking for one, not furniture. Nothing shows while it loads:
        * a row that appears late is better than a heading that says "Loading…" over nothing.
        */}
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
          <button
            type="button"
            className="proto-note-row proto-settings-row proto-sharing-deleted__toggle"
            aria-expanded={deletedOpen}
            onClick={() => setDeletedOpen((open) => !open)}
          >
            <span className="proto-settings-list-row__main">
              <span className="pds-list-title">Recently deleted spaces</span>
            </span>
            <span className="proto-settings-list-row__trailing">
              <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>
                {deletedSpaces.length}
              </span>
              <span className="proto-sharing-deleted__chevron" aria-hidden>
                <Icon name="caret-right" size={12} />
              </span>
            </span>
          </button>
          {deletedOpen ? (
            <div className="proto-sharing-deleted__list">
              {deletedSpaces.map((space) => {
                const isRestoring = restoreSpace.isPending && restoreSpace.variables === space.id;
                return (
                  <div key={space.id} className="proto-sharing-deleted__row">
                    <span
                      className="proto-settings-list-row__leading proto-settings-list-row__leading--bare"
                      aria-hidden
                    >
                      <ProtoSpaceMenuIcon color={space.color || 'paper'} size={32} radius={8} glyphSize={15} />
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
          ) : null}
        </SettingsGroup>
      ) : null}
    </SettingsShell>
  );
}
